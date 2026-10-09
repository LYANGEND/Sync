import {
  AcademicTermStatus,
  Prisma,
  TermRolloverStatus,
  TermRolloverType,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../utils/prisma';
import { assertTermWriteAllowed } from './termLifecycleService';

export const ROLLOVER_COPY_CATEGORIES = [
  'SUBJECT_LINKS',
  'TEACHER_ASSIGNMENTS',
  'FEE_TEMPLATES',
  'CLASS_FEE_ASSIGNMENTS',
  'TIMETABLE',
  'LESSON_PLANS',
] as const;

export type RolloverCopyCategory = typeof ROLLOVER_COPY_CATEGORIES[number];
export type RolloverPlanCategory = 'CLASS_COHORTS' | 'CLASS_OFFERINGS' | RolloverCopyCategory;
export type RolloverIssueSeverity = 'BLOCKER' | 'WARNING';

type RolloverClient = Prisma.TransactionClient | typeof prisma;
type RolloverOperation<T> = (tx: Prisma.TransactionClient) => Promise<T>;
type ProposalDisposition = 'CREATE' | 'REUSE' | 'SKIP';

const OPEN_ROLLOVER_STATUSES: TermRolloverStatus[] = [
  'DRAFT',
  'PREPARING',
  'PREPARED',
  'READY',
  'EXECUTING',
];
const MAX_SERIALIZABLE_ATTEMPTS = 3;
const PLAN_CATEGORIES: RolloverPlanCategory[] = [
  'CLASS_COHORTS',
  'CLASS_OFFERINGS',
  ...ROLLOVER_COPY_CATEGORIES,
];
const DEFAULT_COPY_CATEGORIES: RolloverCopyCategory[] = [...ROLLOVER_COPY_CATEGORIES];

export type TermRolloverErrorCode =
  | 'ROLLOVER_NOT_FOUND'
  | 'TERM_NOT_FOUND'
  | 'INVALID_TERM_PAIR'
  | 'ACADEMIC_YEAR_REQUIRED'
  | 'SOURCE_TERM_NOT_PREPARABLE'
  | 'TARGET_TERM_NOT_DRAFT'
  | 'TERMS_NOT_ADJACENT'
  | 'INVALID_ROLLOVER_CONFIGURATION'
  | 'IDEMPOTENCY_CONFLICT'
  | 'ROLLOVER_ALREADY_OPEN'
  | 'INVALID_ROLLOVER_STATUS'
  | 'STALE_ROLLOVER_VERSION'
  | 'STALE_ROLLOVER_PLAN'
  | 'SOURCE_CONFIGURATION_CHANGED'
  | 'ROLLOVER_PREPARATION_BLOCKED'
  | 'ROLLOVER_PREPARATION_CONFLICT';

export class TermRolloverError extends Error {
  constructor(
    public readonly code: TermRolloverErrorCode,
    message: string,
    public readonly statusCode: number = 409,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'TermRolloverError';
  }
}

export interface YearEndCohortMappingInput {
  sourceCohortId: string;
  targetName?: string;
  targetGradeLevel?: number;
  skip?: boolean;
}

export interface TermRolloverConfigurationInput {
  copyCategories?: RolloverCopyCategory[];
  yearEndMappings?: YearEndCohortMappingInput[];
}

interface NormalizedYearEndMapping {
  sourceCohortId: string;
  targetName: string | null;
  targetGradeLevel: number | null;
  skip: boolean;
}

interface NormalizedRolloverConfiguration {
  copyCategories: RolloverCopyCategory[];
  yearEndMappings: NormalizedYearEndMapping[];
}

interface StoredPreparationMetadata {
  sourceHash: string;
  preparedHash: string;
  preparedAt: string;
  preparedByUserId: string;
  taskCount: number;
  counts: RolloverPlanCounts;
}

export interface RolloverIssue {
  code: string;
  severity: RolloverIssueSeverity;
  message: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

export interface RolloverPlanCount {
  planned: number;
  create: number;
  reuse: number;
  skip: number;
}

export type RolloverPlanCounts = Record<RolloverPlanCategory, RolloverPlanCount>;

export interface YearEndMappingPlan {
  sourceCohortId: string;
  sourceName: string;
  sourceGradeLevel: number;
  branchId: string | null;
  configured: boolean;
  skip: boolean;
  targetName: string;
  targetGradeLevel: number;
}

export interface TargetOperationalActivity {
  total: number;
  counts: Record<string, number>;
}

export interface TermRolloverPlan {
  rolloverId: string;
  transitionType: TermRolloverType;
  sourceTerm: {
    id: string;
    name: string;
    status: AcademicTermStatus;
    academicYearId: string;
    sequence: number;
  };
  targetTerm: {
    id: string;
    name: string;
    status: AcademicTermStatus;
    academicYearId: string;
    sequence: number;
  };
  configuration: NormalizedRolloverConfiguration;
  inputHash: string;
  sourceHash: string;
  targetBaselineHash: string;
  counts: RolloverPlanCounts;
  issues: RolloverIssue[];
  yearEndMappings: YearEndMappingPlan[];
  operationalActivity: TargetOperationalActivity;
  canPrepare: boolean;
}

interface CohortProposal {
  operationKey: string;
  sourceCohortId: string;
  targetName: string;
  targetGradeLevel: number;
  branchId: string | null;
  targetEntityId: string | null;
  disposition: ProposalDisposition;
}

interface ClassProposal {
  operationKey: string;
  sourceClassId: string;
  sourceCohortId: string;
  targetCohortId: string | null;
  cohortOperationKey: string | null;
  targetEntityId: string | null;
  disposition: ProposalDisposition;
}

interface RelationProposal {
  operationKey: string;
  sourceEntityId: string;
  sourceClassId: string;
  subjectId?: string;
  sourceFeeTemplateId?: string;
  targetEntityId: string | null;
  disposition: ProposalDisposition;
}

interface TimetableProposal {
  operationKey: string;
  sourcePeriodId: string;
  sourceClassIds: string[];
  targetEntityId: string | null;
  disposition: ProposalDisposition;
}

interface LessonPlanProposal {
  operationKey: string;
  sourceLessonPlanId: string;
  sourceClassId: string;
  targetEntityId: string | null;
  disposition: ProposalDisposition;
}

interface InternalTermRolloverPlan extends TermRolloverPlan {
  context: PreparationContext;
  proposals: {
    cohorts: CohortProposal[];
    classes: ClassProposal[];
    subjectLinks: RelationProposal[];
    teacherAssignments: RelationProposal[];
    feeTemplates: RelationProposal[];
    classFeeAssignments: RelationProposal[];
    timetablePeriods: TimetableProposal[];
    lessonPlans: LessonPlanProposal[];
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (isRecord(value)) {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        const child = value[key];
        if (child !== undefined) result[key] = canonicalize(child);
        return result;
      }, {});
  }
  return value;
};

const fingerprint = (value: unknown): string => (
  createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex')
);

const normalizeName = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');
const sameNullable = (left: string | null, right: string | null): boolean => left === right;
const iso = (value: Date): string => value.toISOString();
const isoOrNull = (value: Date | null): string | null => value?.toISOString() ?? null;

const hasPrismaCode = (error: unknown, code: string): boolean => (
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
);

const runRolloverTransaction = async <T>(operation: RolloverOperation<T>): Promise<T> => {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2034') && attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
      if (hasPrismaCode(error, 'P2034')) {
        throw new TermRolloverError(
          'ROLLOVER_PREPARATION_CONFLICT',
          'The rollover preparation changed concurrently. Refresh and try again',
        );
      }
      throw error;
    }
  }
  throw new TermRolloverError(
    'ROLLOVER_PREPARATION_CONFLICT',
    'The rollover preparation changed concurrently. Refresh and try again',
  );
};

const lockRollover = async (tx: Prisma.TransactionClient, key: string) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sync:term-rollover:${key}`}))`;
};

const appendRolloverEvent = async (
  tx: Prisma.TransactionClient,
  rolloverId: string,
  type: string,
  actorUserId: string | null,
  payload?: Record<string, unknown>,
) => {
  const current = await tx.termRolloverEvent.aggregate({
    where: { rolloverId },
    _max: { sequence: true },
  });
  return tx.termRolloverEvent.create({
    data: {
      rolloverId,
      sequence: (current._max.sequence ?? 0) + 1,
      type,
      actorUserId,
      payload: payload as Prisma.InputJsonValue | undefined,
    },
  });
};

const parseConfiguration = (value: unknown): TermRolloverConfigurationInput => {
  if (!isRecord(value)) return {};
  return {
    copyCategories: Array.isArray(value.copyCategories)
      ? value.copyCategories.filter((item): item is RolloverCopyCategory => typeof item === 'string')
      : undefined,
    yearEndMappings: Array.isArray(value.yearEndMappings)
      ? value.yearEndMappings.filter(isRecord).map(mapping => ({
        sourceCohortId: typeof mapping.sourceCohortId === 'string' ? mapping.sourceCohortId : '',
        targetName: typeof mapping.targetName === 'string' ? mapping.targetName : undefined,
        targetGradeLevel: typeof mapping.targetGradeLevel === 'number' ? mapping.targetGradeLevel : undefined,
        skip: mapping.skip === true,
      }))
      : undefined,
  };
};

const getStoredPreparationMetadata = (value: unknown): StoredPreparationMetadata | null => {
  if (!isRecord(value) || !isRecord(value.preparation)) return null;
  const preparation = value.preparation;
  if (typeof preparation.sourceHash !== 'string'
    || typeof preparation.preparedHash !== 'string'
    || typeof preparation.preparedAt !== 'string'
    || typeof preparation.preparedByUserId !== 'string'
    || typeof preparation.taskCount !== 'number'
    || !isRecord(preparation.counts)) {
    return null;
  }
  return preparation as unknown as StoredPreparationMetadata;
};

const normalizeConfiguration = (
  input: TermRolloverConfigurationInput = {},
): NormalizedRolloverConfiguration => {
  const requested = input.copyCategories === undefined
    ? DEFAULT_COPY_CATEGORIES
    : input.copyCategories;
  const validCategories = new Set<string>(ROLLOVER_COPY_CATEGORIES);
  if (requested.some(category => !validCategories.has(category))) {
    throw new TermRolloverError(
      'INVALID_ROLLOVER_CONFIGURATION',
      'The rollover contains an unsupported setup-copy category',
      400,
    );
  }

  const categories = new Set<RolloverCopyCategory>(requested);
  if (categories.has('TEACHER_ASSIGNMENTS')) categories.add('SUBJECT_LINKS');
  if (categories.has('CLASS_FEE_ASSIGNMENTS')) categories.add('FEE_TEMPLATES');
  if (categories.has('TIMETABLE')) {
    categories.add('SUBJECT_LINKS');
    categories.add('TEACHER_ASSIGNMENTS');
  }
  if (categories.has('LESSON_PLANS')) categories.add('SUBJECT_LINKS');

  const seenMappings = new Set<string>();
  const yearEndMappings = (input.yearEndMappings ?? []).map(mapping => {
    const sourceCohortId = mapping.sourceCohortId.trim();
    if (!sourceCohortId || seenMappings.has(sourceCohortId)) {
      throw new TermRolloverError(
        'INVALID_ROLLOVER_CONFIGURATION',
        'Year-end cohort mappings must contain one unique source cohort each',
        400,
      );
    }
    seenMappings.add(sourceCohortId);
    const skip = mapping.skip === true;
    const targetName = mapping.targetName?.trim() || null;
    const targetGradeLevel = mapping.targetGradeLevel ?? null;
    if (!skip && (!targetName
      || targetGradeLevel === null
      || !Number.isInteger(targetGradeLevel)
      || targetGradeLevel < 0
      || targetGradeLevel > 12)) {
      throw new TermRolloverError(
        'INVALID_ROLLOVER_CONFIGURATION',
        'Mapped year-end cohorts require a target name and grade from 0 to 12',
        400,
      );
    }
    return { sourceCohortId, targetName, targetGradeLevel, skip };
  }).sort((left, right) => left.sourceCohortId.localeCompare(right.sourceCohortId));

  return {
    copyCategories: [...categories].sort() as RolloverCopyCategory[],
    yearEndMappings,
  };
};

const configurationJson = (
  configuration: NormalizedRolloverConfiguration,
  preparation?: StoredPreparationMetadata | null,
): Prisma.InputJsonValue => ({
  copyCategories: configuration.copyCategories,
  yearEndMappings: configuration.yearEndMappings,
  ...(preparation ? { preparation: preparation as unknown as Prisma.InputJsonValue } : {}),
} as unknown as Prisma.InputJsonValue);

const configurationMatches = (
  left: NormalizedRolloverConfiguration,
  right: NormalizedRolloverConfiguration,
): boolean => fingerprint(left) === fingerprint(right);

interface TermPairRecord {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: AcademicTermStatus;
  version: number;
  academicYearId: string | null;
  sequence: number | null;
  academicYear: {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    termCount: number;
    status: string;
  } | null;
}

const validateTermPair = (
  sourceTerm: TermPairRecord,
  targetTerm: TermPairRecord,
  transitionType: TermRolloverType,
) => {
  if (sourceTerm.id === targetTerm.id) {
    throw new TermRolloverError('INVALID_TERM_PAIR', 'Source and target terms must differ', 400);
  }
  if (!sourceTerm.academicYearId || !sourceTerm.academicYear || sourceTerm.sequence === null
    || !targetTerm.academicYearId || !targetTerm.academicYear || targetTerm.sequence === null) {
    throw new TermRolloverError(
      'ACADEMIC_YEAR_REQUIRED',
      'Both terms must belong to sequenced academic years before rollover preparation',
    );
  }
  if (sourceTerm.status !== AcademicTermStatus.ACTIVE
    && sourceTerm.status !== AcademicTermStatus.CLOSING) {
    throw new TermRolloverError(
      'SOURCE_TERM_NOT_PREPARABLE',
      'The source term must be active or closing while target setup is prepared',
    );
  }
  if (targetTerm.status !== AcademicTermStatus.DRAFT) {
    throw new TermRolloverError(
      'TARGET_TERM_NOT_DRAFT',
      'Target setup can only be prepared in a draft term',
    );
  }
  if (targetTerm.startDate <= sourceTerm.endDate) {
    throw new TermRolloverError(
      'TERMS_NOT_ADJACENT',
      'The target term must begin after the source term ends',
    );
  }

  if (transitionType === TermRolloverType.WITHIN_YEAR) {
    if (sourceTerm.academicYearId !== targetTerm.academicYearId
      || targetTerm.sequence !== sourceTerm.sequence + 1) {
      throw new TermRolloverError(
        'TERMS_NOT_ADJACENT',
        'A within-year rollover requires the next sequenced term in the same academic year',
      );
    }
    return;
  }

  if (sourceTerm.academicYearId === targetTerm.academicYearId
    || sourceTerm.sequence !== sourceTerm.academicYear.termCount
    || targetTerm.sequence !== 1
    || targetTerm.academicYear.startDate <= sourceTerm.academicYear.endDate) {
    throw new TermRolloverError(
      'TERMS_NOT_ADJACENT',
      'A year-end rollover requires the final source term and first term of the next academic year',
    );
  }
};

const getTermPair = async (
  client: RolloverClient,
  sourceTermId: string,
  targetTermId: string,
) => {
  const [sourceTerm, targetTerm] = await Promise.all([
    client.academicTerm.findUnique({
      where: { id: sourceTermId },
      include: { academicYear: true },
    }),
    client.academicTerm.findUnique({
      where: { id: targetTermId },
      include: { academicYear: true },
    }),
  ]);
  if (!sourceTerm || !targetTerm) {
    throw new TermRolloverError('TERM_NOT_FOUND', 'Source or target academic term was not found', 404);
  }
  return { sourceTerm, targetTerm };
};

export interface CreateTermRolloverInput {
  sourceTermId: string;
  targetTermId: string;
  transitionType: TermRolloverType;
  idempotencyKey: string;
  actorUserId: string;
  configuration?: TermRolloverConfigurationInput;
}

export const createTermRollover = async (input: CreateTermRolloverInput) => {
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    throw new TermRolloverError(
      'INVALID_ROLLOVER_CONFIGURATION',
      'The idempotency key must contain 8 to 200 characters',
      400,
    );
  }
  const configuration = normalizeConfiguration(input.configuration);

  return runRolloverTransaction(async tx => {
    await lockRollover(tx, `${input.sourceTermId}:${input.targetTermId}`);
    const existingByKey = await tx.termRollover.findUnique({ where: { idempotencyKey } });
    if (existingByKey) {
      const existingConfiguration = normalizeConfiguration(parseConfiguration(existingByKey.configuration));
      if (existingByKey.sourceTermId !== input.sourceTermId
        || existingByKey.targetTermId !== input.targetTermId
        || existingByKey.transitionType !== input.transitionType
        || !configurationMatches(existingConfiguration, configuration)) {
        throw new TermRolloverError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key is already associated with a different rollover request',
        );
      }
      return { rollover: existingByKey, reused: true };
    }

    const { sourceTerm, targetTerm } = await getTermPair(tx, input.sourceTermId, input.targetTermId);
    validateTermPair(sourceTerm, targetTerm, input.transitionType);

    const open = await tx.termRollover.findFirst({
      where: {
        sourceTermId: input.sourceTermId,
        targetTermId: input.targetTermId,
        status: { in: OPEN_ROLLOVER_STATUSES },
      },
    });
    if (open) {
      throw new TermRolloverError(
        'ROLLOVER_ALREADY_OPEN',
        'An open rollover already exists for this source and target term pair',
        409,
        { rolloverId: open.id },
      );
    }

    try {
      const rollover = await tx.termRollover.create({
        data: {
          sourceTermId: input.sourceTermId,
          targetTermId: input.targetTermId,
          transitionType: input.transitionType,
          idempotencyKey,
          configuration: configurationJson(configuration),
        },
      });
      await appendRolloverEvent(tx, rollover.id, 'ROLLOVER_DRAFT_CREATED', input.actorUserId, {
        sourceTermId: rollover.sourceTermId,
        targetTermId: rollover.targetTermId,
        transitionType: rollover.transitionType,
        copyCategories: configuration.copyCategories,
      });
      return { rollover, reused: false };
    } catch (error) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new TermRolloverError(
          'ROLLOVER_ALREADY_OPEN',
          'An open rollover already exists for this source and target term pair',
        );
      }
      throw error;
    }
  });
};

export const updateTermRolloverConfiguration = async (
  rolloverId: string,
  input: TermRolloverConfigurationInput,
  actorUserId: string,
  expectedVersion?: number,
) => {
  const configuration = normalizeConfiguration(input);
  return runRolloverTransaction(async tx => {
    await lockRollover(tx, rolloverId);
    const rollover = await tx.termRollover.findUnique({ where: { id: rolloverId } });
    if (!rollover) throw new TermRolloverError('ROLLOVER_NOT_FOUND', 'Term rollover not found', 404);
    if (rollover.status !== TermRolloverStatus.DRAFT) {
      throw new TermRolloverError(
        'INVALID_ROLLOVER_STATUS',
        'Only a draft rollover configuration can be changed',
      );
    }
    if (expectedVersion !== undefined && rollover.version !== expectedVersion) {
      throw new TermRolloverError(
        'STALE_ROLLOVER_VERSION',
        `Rollover version ${expectedVersion} is stale; current version is ${rollover.version}`,
      );
    }

    const updated = await tx.termRollover.update({
      where: { id: rollover.id },
      data: {
        configuration: configurationJson(configuration),
        inputHash: null,
        version: { increment: 1 },
      },
    });
    await appendRolloverEvent(tx, rollover.id, 'ROLLOVER_CONFIGURATION_UPDATED', actorUserId, {
      copyCategories: configuration.copyCategories,
      yearEndMappingCount: configuration.yearEndMappings.length,
    });
    return updated;
  });
};

export const listTermRollovers = async () => {
  // READY is fingerprint-bound evidence, not a permanent assertion. Revalidate
  // before exposing it to callers; domain writes can occur after approval.
  const ready = await prisma.termRollover.findMany({ where: { status: 'READY' }, select: { id: true } });
  if (ready.length) {
    const { preflightTermRollover } = await import('./termRolloverReadinessService');
    for (const rollover of ready) await preflightTermRollover(rollover.id);
  }
  return prisma.termRollover.findMany({
  include: {
    sourceTerm: { include: { academicYear: true } },
    targetTerm: { include: { academicYear: true } },
    _count: { select: { tasks: true, events: true } },
  },
  orderBy: { updatedAt: 'desc' },
  });
};

export const getTermRollover = async (rolloverId: string, client: RolloverClient = prisma) => {
  if (client === prisma) {
    const state = await prisma.termRollover.findUnique({ where: { id: rolloverId }, select: { status: true } });
    if (state?.status === 'READY') {
      const { preflightTermRollover } = await import('./termRolloverReadinessService');
      await preflightTermRollover(rolloverId);
    }
  }
  const rollover = await client.termRollover.findUnique({
    where: { id: rolloverId },
    include: {
      sourceTerm: { include: { academicYear: true } },
      targetTerm: { include: { academicYear: true } },
      tasks: { orderBy: [{ category: 'asc' }, { operationKey: 'asc' }] },
      events: { orderBy: { sequence: 'asc' } },
    },
  });
  if (!rollover) throw new TermRolloverError('ROLLOVER_NOT_FOUND', 'Term rollover not found', 404);
  return rollover;
};

const getTargetOperationalActivity = async (
  client: RolloverClient,
  targetTermId: string,
  rolloverId: string,
): Promise<TargetOperationalActivity> => {
  const [targetClasses, targetEnrollments, transitionDecisions] = await Promise.all([
    client.class.findMany({
      where: { academicTermId: targetTermId },
      select: { id: true },
    }),
    client.studentTermEnrollment.findMany({
      where: { academicTermId: targetTermId },
      select: {
        studentId: true,
        classId: true,
        status: true,
        transitionAction: true,
        sourceEnrollmentId: true,
      },
    }),
    client.studentTransitionDecision.findMany({
      where: { rolloverId },
      select: {
        studentId: true,
        sourceEnrollmentId: true,
        targetClassId: true,
        action: true,
      },
    }),
  ]);
  const classIds = targetClasses.map(classRecord => classRecord.id);
  const decisionByStudentId = new Map(
    transitionDecisions.map(decision => [decision.studentId, decision]),
  );
  const allowedStagedEnrollments = targetEnrollments.filter(enrollment => {
    const decision = decisionByStudentId.get(enrollment.studentId);
    if (!decision) return false;
    return enrollment.status === 'STAGED'
      && decision.targetClassId === enrollment.classId
      && decision.sourceEnrollmentId === enrollment.sourceEnrollmentId
      && decision.action === enrollment.transitionAction
      && ['CARRY_FORWARD', 'PROMOTE', 'RETAIN'].includes(decision.action);
  }).length;
  const unexpectedEnrollments = targetEnrollments.length - allowedStagedEnrollments;
  const targetAssessments = await client.assessment.findMany({
    where: { termId: targetTermId },
    select: { id: true },
  });
  const assessmentIds = targetAssessments.map(assessment => assessment.id);

  const entries = await Promise.all([
    Promise.resolve(['enrollments', unexpectedEnrollments] as const),
    Promise.resolve(['allowedStagedEnrollments', allowedStagedEnrollments] as const),
    client.attendance.count({ where: { academicTermId: targetTermId } }).then(value => ['attendance', value] as const),
    client.attendanceAlert.count({ where: { academicTermId: targetTermId } }).then(value => ['attendanceAlerts', value] as const),
    Promise.resolve(['assessments', targetAssessments.length] as const),
    (assessmentIds.length
      ? client.assessmentResult.count({ where: { assessmentId: { in: assessmentIds } } })
      : Promise.resolve(0)).then(value => ['assessmentResults', value] as const),
    (assessmentIds.length
      ? client.assessmentSubmission.count({ where: { assessmentId: { in: assessmentIds } } })
      : Promise.resolve(0)).then(value => ['assessmentSubmissions', value] as const),
    (assessmentIds.length
      ? client.homeworkSubmission.count({ where: { assessmentId: { in: assessmentIds } } })
      : Promise.resolve(0)).then(value => ['homeworkSubmissions', value] as const),
    client.termResult.count({ where: { termId: targetTermId } }).then(value => ['termResults', value] as const),
    client.studentTermReport.count({ where: { termId: targetTermId } }).then(value => ['reports', value] as const),
    (classIds.length
      ? client.topicProgress.count({ where: { classId: { in: classIds } } })
      : Promise.resolve(0)).then(value => ['topicProgress', value] as const),
    client.studentFeeStructure.count({ where: { academicTermId: targetTermId } }).then(value => ['feeObligations', value] as const),
    client.invoice.count({ where: { termId: targetTermId } }).then(value => ['invoices', value] as const),
    client.payment.count({ where: { academicTermId: targetTermId } }).then(value => ['payments', value] as const),
    client.paymentAllocation.count({
      where: {
        OR: [
          { payment: { academicTermId: targetTermId } },
          { studentFee: { academicTermId: targetTermId } },
        ],
      },
    }).then(value => ['paymentAllocations', value] as const),
    client.termFinancialSummary.count({ where: { academicTermId: targetTermId } }).then(value => ['financialSummaries', value] as const),
    client.debtCollectionCampaign.count({ where: { academicTermId: targetTermId } }).then(value => ['debtCampaigns', value] as const),
    client.campaignMessage.count({ where: { academicTermId: targetTermId } }).then(value => ['campaignMessages', value] as const),
    client.financialReport.count({ where: { termId: targetTermId } }).then(value => ['financialReports', value] as const),
    client.studentRiskAssessment.count({ where: { termId: targetTermId } }).then(value => ['riskAssessments', value] as const),
    (classIds.length
      ? client.learningObjectiveMastery.count({ where: { classId: { in: classIds } } })
      : Promise.resolve(0)).then(value => ['mastery', value] as const),
    (classIds.length
      ? client.interventionRecord.count({ where: { classId: { in: classIds } } })
      : Promise.resolve(0)).then(value => ['interventions', value] as const),
    (classIds.length
      ? client.pendingTeacherAction.count({ where: { classId: { in: classIds } } })
      : Promise.resolve(0)).then(value => ['teacherActions', value] as const),
    (classIds.length
      ? client.adaptedLesson.count({
        where: { classId: { in: classIds }, status: { in: ['DEPLOYED', 'COMPLETED'] } },
      })
      : Promise.resolve(0)).then(value => ['deployedLessons', value] as const),
    (classIds.length
      ? client.virtualClassroom.count({ where: { classId: { in: classIds } } })
      : Promise.resolve(0)).then(value => ['virtualClassrooms', value] as const),
    client.budget.count({
      where: { termId: targetTermId, status: { not: 'DRAFT' } },
    }).then(value => ['activeBudgets', value] as const),
  ]);

  const counts = Object.fromEntries(entries);
  return {
    counts,
    total: Object.entries(counts).reduce(
      (sum, [key, value]) => sum + (key === 'allowedStagedEnrollments' ? 0 : value),
      0,
    ),
  };
};

const loadPreparationContext = async (client: RolloverClient, rolloverId: string) => {
  const rollover = await client.termRollover.findUnique({
    where: { id: rolloverId },
    include: {
      sourceTerm: { include: { academicYear: true } },
      targetTerm: { include: { academicYear: true } },
      tasks: { orderBy: { operationKey: 'asc' } },
    },
  });
  if (!rollover) throw new TermRolloverError('ROLLOVER_NOT_FOUND', 'Term rollover not found', 404);
  validateTermPair(rollover.sourceTerm, rollover.targetTerm, rollover.transitionType);
  const configuration = normalizeConfiguration(parseConfiguration(rollover.configuration));

  const [
    sourceClasses,
    targetClasses,
    sourceCohorts,
    targetCohorts,
    sourceFeeTemplates,
    targetFeeTemplates,
    sourceTimetablePeriods,
    targetTimetablePeriods,
    sourceLessonPlans,
    targetLessonPlans,
    targetInstructionalDays,
    operationalActivity,
  ] = await Promise.all([
    client.class.findMany({
      where: { academicTermId: rollover.sourceTermId },
      include: {
        classCohort: true,
        subjects: { orderBy: { id: 'asc' } },
        teacherAssignments: { orderBy: { id: 'asc' } },
        classFeeAssignments: { include: { feeTemplate: true }, orderBy: { id: 'asc' } },
      },
      orderBy: { id: 'asc' },
    }),
    client.class.findMany({
      where: { academicTermId: rollover.targetTermId },
      include: {
        classCohort: true,
        subjects: { orderBy: { id: 'asc' } },
        teacherAssignments: { orderBy: { id: 'asc' } },
        classFeeAssignments: { include: { feeTemplate: true }, orderBy: { id: 'asc' } },
      },
      orderBy: { id: 'asc' },
    }),
    client.classCohort.findMany({
      where: { academicYearId: rollover.sourceTerm.academicYearId ?? undefined },
      orderBy: { id: 'asc' },
    }),
    client.classCohort.findMany({
      where: { academicYearId: rollover.targetTerm.academicYearId ?? undefined },
      orderBy: { id: 'asc' },
    }),
    client.feeTemplate.findMany({
      where: { academicTermId: rollover.sourceTermId },
      orderBy: { id: 'asc' },
    }),
    client.feeTemplate.findMany({
      where: { academicTermId: rollover.targetTermId },
      orderBy: { id: 'asc' },
    }),
    client.timetablePeriod.findMany({
      where: { academicTermId: rollover.sourceTermId },
      include: { classes: { orderBy: { classId: 'asc' } } },
      orderBy: { id: 'asc' },
    }),
    client.timetablePeriod.findMany({
      where: { academicTermId: rollover.targetTermId },
      include: { classes: { orderBy: { classId: 'asc' } } },
      orderBy: { id: 'asc' },
    }),
    client.lessonPlan.findMany({ where: { termId: rollover.sourceTermId }, orderBy: { id: 'asc' } }),
    client.lessonPlan.findMany({ where: { termId: rollover.targetTermId }, orderBy: { id: 'asc' } }),
    client.termInstructionalDay.findMany({
      where: { academicTermId: rollover.targetTermId },
      orderBy: { date: 'asc' },
    }),
    getTargetOperationalActivity(client, rollover.targetTermId, rollover.id),
  ]);

  return {
    rollover,
    configuration,
    sourceClasses,
    targetClasses,
    sourceCohorts,
    targetCohorts,
    sourceFeeTemplates,
    targetFeeTemplates,
    sourceTimetablePeriods,
    targetTimetablePeriods,
    sourceLessonPlans,
    targetLessonPlans,
    targetInstructionalDays,
    operationalActivity,
  };
};

type PreparationContext = Awaited<ReturnType<typeof loadPreparationContext>>;

const hasCategory = (context: PreparationContext, category: RolloverCopyCategory): boolean => (
  context.configuration.copyCategories.includes(category)
);

const sourceSetupSnapshot = (context: PreparationContext) => ({
  term: {
    id: context.rollover.sourceTerm.id,
    version: context.rollover.sourceTerm.version,
    academicYearId: context.rollover.sourceTerm.academicYearId,
    sequence: context.rollover.sourceTerm.sequence,
    status: context.rollover.sourceTerm.status,
    startDate: iso(context.rollover.sourceTerm.startDate),
    endDate: iso(context.rollover.sourceTerm.endDate),
  },
  configuration: context.configuration,
  classes: context.sourceClasses.map(classRecord => ({
    id: classRecord.id,
    name: classRecord.name,
    gradeLevel: classRecord.gradeLevel,
    teacherId: classRecord.teacherId,
    branchId: classRecord.branchId,
    classCohortId: classRecord.classCohortId,
    cohort: classRecord.classCohort ? {
      id: classRecord.classCohort.id,
      academicYearId: classRecord.classCohort.academicYearId,
      name: classRecord.classCohort.name,
      gradeLevel: classRecord.classCohort.gradeLevel,
      branchId: classRecord.classCohort.branchId,
      predecessorCohortId: classRecord.classCohort.predecessorCohortId,
    } : null,
    subjects: hasCategory(context, 'SUBJECT_LINKS')
      ? classRecord.subjects.map(subject => subject.id)
      : [],
    teacherAssignments: hasCategory(context, 'TEACHER_ASSIGNMENTS')
      ? classRecord.teacherAssignments.map(assignment => ({
        id: assignment.id,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
      }))
      : [],
    feeAssignments: hasCategory(context, 'CLASS_FEE_ASSIGNMENTS')
      ? classRecord.classFeeAssignments.map(assignment => ({
        id: assignment.id,
        feeTemplateId: assignment.feeTemplateId,
        categoryId: assignment.categoryId,
        dueDate: isoOrNull(assignment.dueDate),
      }))
      : [],
  })),
  feeTemplates: hasCategory(context, 'FEE_TEMPLATES')
    ? context.sourceFeeTemplates.map(template => ({
      id: template.id,
      name: template.name,
      amount: template.amount.toString(),
      applicableGrade: template.applicableGrade,
      categoryId: template.categoryId,
    }))
    : [],
  timetable: hasCategory(context, 'TIMETABLE')
    ? context.sourceTimetablePeriods.map(period => ({
      id: period.id,
      subjectId: period.subjectId,
      teacherId: period.teacherId,
      dayOfWeek: period.dayOfWeek,
      startTime: period.startTime,
      endTime: period.endTime,
      classIds: period.classes.map(link => link.classId),
    }))
    : [],
  lessonPlans: hasCategory(context, 'LESSON_PLANS')
    ? context.sourceLessonPlans.map(plan => ({
      id: plan.id,
      teacherId: plan.teacherId,
      classId: plan.classId,
      subjectId: plan.subjectId,
      weekStartDate: iso(plan.weekStartDate),
      title: plan.title,
      content: plan.content,
      fileUrl: plan.fileUrl,
    }))
    : [],
});

const targetSetupSnapshot = (context: PreparationContext) => ({
  term: {
    id: context.rollover.targetTerm.id,
    version: context.rollover.targetTerm.version,
    academicYearId: context.rollover.targetTerm.academicYearId,
    sequence: context.rollover.targetTerm.sequence,
    status: context.rollover.targetTerm.status,
    startDate: iso(context.rollover.targetTerm.startDate),
    endDate: iso(context.rollover.targetTerm.endDate),
  },
  cohorts: context.rollover.transitionType === TermRolloverType.YEAR_END
    ? context.targetCohorts.map(cohort => ({
      id: cohort.id,
      name: cohort.name,
      gradeLevel: cohort.gradeLevel,
      branchId: cohort.branchId,
      predecessorCohortId: cohort.predecessorCohortId,
      status: cohort.status,
    }))
    : [],
  classes: context.targetClasses.map(classRecord => ({
    id: classRecord.id,
    name: classRecord.name,
    gradeLevel: classRecord.gradeLevel,
    teacherId: classRecord.teacherId,
    branchId: classRecord.branchId,
    classCohortId: classRecord.classCohortId,
    subjects: hasCategory(context, 'SUBJECT_LINKS')
      ? classRecord.subjects.map(subject => subject.id)
      : [],
    teacherAssignments: hasCategory(context, 'TEACHER_ASSIGNMENTS')
      ? classRecord.teacherAssignments.map(assignment => ({
        id: assignment.id,
        subjectId: assignment.subjectId,
        teacherId: assignment.teacherId,
      }))
      : [],
    feeAssignments: hasCategory(context, 'CLASS_FEE_ASSIGNMENTS')
      ? classRecord.classFeeAssignments.map(assignment => ({
        id: assignment.id,
        feeTemplateId: assignment.feeTemplateId,
        categoryId: assignment.categoryId,
        dueDate: isoOrNull(assignment.dueDate),
      }))
      : [],
  })),
  feeTemplates: hasCategory(context, 'FEE_TEMPLATES')
    ? context.targetFeeTemplates.map(template => ({
      id: template.id,
      name: template.name,
      amount: template.amount.toString(),
      applicableGrade: template.applicableGrade,
      categoryId: template.categoryId,
    }))
    : [],
  timetable: hasCategory(context, 'TIMETABLE')
    ? context.targetTimetablePeriods.map(period => ({
      id: period.id,
      subjectId: period.subjectId,
      teacherId: period.teacherId,
      dayOfWeek: period.dayOfWeek,
      startTime: period.startTime,
      endTime: period.endTime,
      classIds: period.classes.map(link => link.classId),
    }))
    : [],
  lessonPlans: hasCategory(context, 'LESSON_PLANS')
    ? context.targetLessonPlans.map(plan => ({
      id: plan.id,
      teacherId: plan.teacherId,
      classId: plan.classId,
      subjectId: plan.subjectId,
      weekStartDate: iso(plan.weekStartDate),
      title: plan.title,
      content: plan.content,
      fileUrl: plan.fileUrl,
    }))
    : [],
  instructionalDays: context.targetInstructionalDays.map(day => ({
    id: day.id,
    date: iso(day.date),
    isInstructional: day.isInstructional,
    label: day.label,
  })),
});

const emptyCounts = (): RolloverPlanCounts => Object.fromEntries(
  PLAN_CATEGORIES.map(category => [category, { planned: 0, create: 0, reuse: 0, skip: 0 }]),
) as RolloverPlanCounts;

const incrementCount = (
  counts: RolloverPlanCounts,
  category: RolloverPlanCategory,
  disposition: ProposalDisposition,
) => {
  counts[category].planned += 1;
  if (disposition === 'CREATE') counts[category].create += 1;
  else if (disposition === 'REUSE') counts[category].reuse += 1;
  else counts[category].skip += 1;
};

const issue = (
  issues: RolloverIssue[],
  code: string,
  severity: RolloverIssueSeverity,
  message: string,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>,
) => issues.push({ code, severity, message, entityType, entityId, details });

const proposeTargetName = (name: string, currentGrade: number): string => {
  const nextGrade = Math.min(12, currentGrade + 1);
  const replaced = name.replace(new RegExp(`\\b${currentGrade}\\b`), String(nextGrade));
  return replaced === name ? name : replaced;
};

const shiftDate = (value: Date | null, sourceStart: Date, targetStart: Date): Date | null => (
  value ? new Date(targetStart.getTime() + (value.getTime() - sourceStart.getTime())) : null
);

const sameIdSet = (left: string[], right: string[]): boolean => (
  left.length === right.length
  && [...left].sort().every((value, index) => value === [...right].sort()[index])
);

const periodsOverlap = (
  left: { startTime: string; endTime: string },
  right: { startTime: string; endTime: string },
): boolean => left.startTime < right.endTime && left.endTime > right.startTime;

const buildPlanInternal = async (
  client: RolloverClient,
  rolloverId: string,
): Promise<InternalTermRolloverPlan> => {
  const context = await loadPreparationContext(client, rolloverId);
  if (context.rollover.status !== TermRolloverStatus.DRAFT
    && context.rollover.status !== TermRolloverStatus.PREPARED
    && context.rollover.status !== TermRolloverStatus.READY) {
    throw new TermRolloverError(
      'INVALID_ROLLOVER_STATUS',
      `Target preparation is not available while the rollover is ${context.rollover.status}`,
    );
  }

  const counts = emptyCounts();
  const issues: RolloverIssue[] = [];
  const taskMap = new Map(context.rollover.tasks.map(task => [task.operationKey, task]));
  for (const task of context.rollover.tasks) {
    if (task.status !== 'COMPLETED' || !task.targetEntityId) {
      issue(
        issues,
        'INCOMPLETE_PREPARATION_TASK',
        'BLOCKER',
        `Preparation task ${task.operationKey} does not retain a completed target mapping`,
        'TermRolloverTask',
        task.id,
      );
    }
  }

  if (context.sourceClasses.length === 0) {
    issue(issues, 'SOURCE_CLASSES_REQUIRED', 'BLOCKER', 'The source term has no class offerings to prepare');
  }
  if (context.operationalActivity.total > 0) {
    issue(
      issues,
      'TARGET_OPERATIONAL_ACTIVITY',
      'BLOCKER',
      'The target term already contains operational activity and cannot be prepared safely',
      'AcademicTerm',
      context.rollover.targetTermId,
      context.operationalActivity.counts,
    );
  }

  const sourceCohortById = new Map(context.sourceCohorts.map(cohort => [cohort.id, cohort]));
  const configuredMappings = new Map(
    context.configuration.yearEndMappings.map(mapping => [mapping.sourceCohortId, mapping]),
  );
  const sourceClassCohortIds = [...new Set(
    context.sourceClasses.map(classRecord => classRecord.classCohortId).filter((id): id is string => Boolean(id)),
  )].sort();
  const yearEndMappings: YearEndMappingPlan[] = [];
  const cohortProposals: CohortProposal[] = [];
  const cohortProposalBySourceId = new Map<string, CohortProposal>();

  if (context.rollover.transitionType === TermRolloverType.YEAR_END) {
    for (const sourceCohortId of sourceClassCohortIds) {
      const sourceCohort = sourceCohortById.get(sourceCohortId);
      if (!sourceCohort) continue;
      const mapping = configuredMappings.get(sourceCohortId);
      const suggestedName = proposeTargetName(sourceCohort.name, sourceCohort.gradeLevel);
      const suggestedGrade = Math.min(12, sourceCohort.gradeLevel + 1);
      yearEndMappings.push({
        sourceCohortId,
        sourceName: sourceCohort.name,
        sourceGradeLevel: sourceCohort.gradeLevel,
        branchId: sourceCohort.branchId,
        configured: Boolean(mapping),
        skip: mapping?.skip ?? false,
        targetName: mapping?.targetName ?? suggestedName,
        targetGradeLevel: mapping?.targetGradeLevel ?? suggestedGrade,
      });
      if (!mapping) {
        issue(
          issues,
          'YEAR_END_MAPPING_REQUIRED',
          'BLOCKER',
          `Approve a target cohort mapping for ${sourceCohort.name}`,
          'ClassCohort',
          sourceCohort.id,
          { suggestedName, suggestedGradeLevel: suggestedGrade },
        );
        continue;
      }
      if (mapping.skip) {
        incrementCount(counts, 'CLASS_COHORTS', 'SKIP');
        issue(
          issues,
          'YEAR_END_COHORT_SKIPPED',
          'WARNING',
          `${sourceCohort.name} is intentionally excluded from target setup`,
          'ClassCohort',
          sourceCohort.id,
        );
        cohortProposalBySourceId.set(sourceCohort.id, {
          operationKey: `cohort:${sourceCohort.id}`,
          sourceCohortId: sourceCohort.id,
          targetName: sourceCohort.name,
          targetGradeLevel: sourceCohort.gradeLevel,
          branchId: sourceCohort.branchId,
          targetEntityId: null,
          disposition: 'SKIP',
        });
        continue;
      }

      const operationKey = `cohort:${sourceCohort.id}`;
      const task = taskMap.get(operationKey);
      let targetEntityId: string | null = null;
      let disposition: ProposalDisposition = 'CREATE';
      if (task?.targetEntityId) {
        const mapped = context.targetCohorts.find(cohort => cohort.id === task.targetEntityId);
        if (!mapped) {
          issue(
            issues,
            'PREPARED_TARGET_MISSING',
            'BLOCKER',
            `Mapped target cohort for ${sourceCohort.name} no longer exists`,
            'TermRolloverTask',
            task.id,
          );
        } else {
          targetEntityId = mapped.id;
          disposition = 'REUSE';
        }
      } else {
        const candidates = context.targetCohorts.filter(cohort => (
          cohort.predecessorCohortId === sourceCohort.id
          || (normalizeName(cohort.name) === normalizeName(mapping.targetName ?? '')
            && sameNullable(cohort.branchId, sourceCohort.branchId))
        ));
        const uniqueCandidates = [...new Map(candidates.map(candidate => [candidate.id, candidate])).values()];
        if (uniqueCandidates.length > 1) {
          issue(
            issues,
            'TARGET_COHORT_MAPPING_AMBIGUOUS',
            'BLOCKER',
            `Multiple target cohorts match ${sourceCohort.name}`,
            'ClassCohort',
            sourceCohort.id,
          );
        } else if (uniqueCandidates.length === 1) {
          const candidate = uniqueCandidates[0];
          if (candidate.predecessorCohortId !== sourceCohort.id
            || normalizeName(candidate.name) !== normalizeName(mapping.targetName ?? '')
            || candidate.gradeLevel !== mapping.targetGradeLevel
            || !sameNullable(candidate.branchId, sourceCohort.branchId)) {
            issue(
              issues,
              'TARGET_COHORT_MAPPING_CONFLICT',
              'BLOCKER',
              `Existing target cohort conflicts with the approved mapping for ${sourceCohort.name}`,
              'ClassCohort',
              candidate.id,
            );
          } else {
            targetEntityId = candidate.id;
            disposition = 'REUSE';
          }
        }
      }

      const proposal: CohortProposal = {
        operationKey,
        sourceCohortId: sourceCohort.id,
        targetName: mapping.targetName as string,
        targetGradeLevel: mapping.targetGradeLevel as number,
        branchId: sourceCohort.branchId,
        targetEntityId,
        disposition,
      };
      cohortProposals.push(proposal);
      cohortProposalBySourceId.set(sourceCohort.id, proposal);
      incrementCount(counts, 'CLASS_COHORTS', disposition);
    }
  }

  const classProposals: ClassProposal[] = [];
  const classProposalBySourceId = new Map<string, ClassProposal>();
  for (const sourceClass of context.sourceClasses) {
    if (!sourceClass.classCohortId || !sourceClass.classCohort) {
      issue(
        issues,
        'SOURCE_CLASS_COHORT_REQUIRED',
        'BLOCKER',
        `${sourceClass.name} must be linked to a logical class cohort before preparation`,
        'Class',
        sourceClass.id,
      );
      continue;
    }
    if (sourceClass.classCohort.academicYearId !== context.rollover.sourceTerm.academicYearId) {
      issue(
        issues,
        'SOURCE_CLASS_COHORT_YEAR_MISMATCH',
        'BLOCKER',
        `${sourceClass.name} is linked to a cohort outside the source academic year`,
        'Class',
        sourceClass.id,
      );
      continue;
    }

    let targetCohortId: string | null = sourceClass.classCohortId;
    let cohortOperationKey: string | null = null;
    if (context.rollover.transitionType === TermRolloverType.YEAR_END) {
      const cohortProposal = cohortProposalBySourceId.get(sourceClass.classCohortId);
      if (!cohortProposal || cohortProposal.disposition === 'SKIP') {
        incrementCount(counts, 'CLASS_OFFERINGS', 'SKIP');
        continue;
      }
      targetCohortId = cohortProposal.targetEntityId;
      cohortOperationKey = cohortProposal.operationKey;
    }

    const operationKey = `class:${sourceClass.id}`;
    const task = taskMap.get(operationKey);
    let targetEntityId: string | null = null;
    let disposition: ProposalDisposition = 'CREATE';
    if (task?.targetEntityId) {
      const mapped = context.targetClasses.find(classRecord => classRecord.id === task.targetEntityId);
      if (!mapped) {
        issue(
          issues,
          'PREPARED_TARGET_MISSING',
          'BLOCKER',
          `Mapped target class for ${sourceClass.name} no longer exists`,
          'TermRolloverTask',
          task.id,
        );
      } else {
        targetEntityId = mapped.id;
        disposition = 'REUSE';
      }
    } else if (targetCohortId) {
      const existing = context.targetClasses.find(classRecord => classRecord.classCohortId === targetCohortId);
      if (existing) {
        targetEntityId = existing.id;
        disposition = 'REUSE';
        if (existing.name !== sourceClass.name
          || existing.gradeLevel !== (context.rollover.transitionType === TermRolloverType.YEAR_END
            ? cohortProposalBySourceId.get(sourceClass.classCohortId)?.targetGradeLevel
            : sourceClass.gradeLevel)
          || existing.teacherId !== sourceClass.teacherId
          || !sameNullable(existing.branchId, sourceClass.branchId)) {
          issue(
            issues,
            'TARGET_CLASS_REUSED_WITH_DIFFERENCES',
            'WARNING',
            `${existing.name} already exists in the target and its manual values will be preserved`,
            'Class',
            existing.id,
          );
        }
      }
    }

    const proposal: ClassProposal = {
      operationKey,
      sourceClassId: sourceClass.id,
      sourceCohortId: sourceClass.classCohortId,
      targetCohortId,
      cohortOperationKey,
      targetEntityId,
      disposition,
    };
    classProposals.push(proposal);
    classProposalBySourceId.set(sourceClass.id, proposal);
    incrementCount(counts, 'CLASS_OFFERINGS', disposition);
  }

  const subjectLinkProposals: RelationProposal[] = [];
  if (hasCategory(context, 'SUBJECT_LINKS')) {
    for (const sourceClass of context.sourceClasses) {
      const classProposal = classProposalBySourceId.get(sourceClass.id);
      if (!classProposal) continue;
      const targetClass = classProposal.targetEntityId
        ? context.targetClasses.find(item => item.id === classProposal.targetEntityId)
        : null;
      for (const subject of sourceClass.subjects) {
        const operationKey = `class-subject:${sourceClass.id}:${subject.id}`;
        const task = taskMap.get(operationKey);
        const disposition: ProposalDisposition = task?.targetEntityId
          || targetClass?.subjects.some(item => item.id === subject.id)
          ? 'REUSE'
          : 'CREATE';
        subjectLinkProposals.push({
          operationKey,
          sourceEntityId: `${sourceClass.id}:${subject.id}`,
          sourceClassId: sourceClass.id,
          subjectId: subject.id,
          targetEntityId: task?.targetEntityId ?? classProposal.targetEntityId,
          disposition,
        });
        incrementCount(counts, 'SUBJECT_LINKS', disposition);
      }
    }
  }

  const teacherAssignmentProposals: RelationProposal[] = [];
  if (hasCategory(context, 'TEACHER_ASSIGNMENTS')) {
    for (const sourceClass of context.sourceClasses) {
      const classProposal = classProposalBySourceId.get(sourceClass.id);
      if (!classProposal) continue;
      const sourceSubjectIds = new Set(sourceClass.subjects.map(subject => subject.id));
      const targetClass = classProposal.targetEntityId
        ? context.targetClasses.find(item => item.id === classProposal.targetEntityId)
        : null;
      for (const assignment of sourceClass.teacherAssignments) {
        if (!sourceSubjectIds.has(assignment.subjectId)) {
          issue(
            issues,
            'SOURCE_TEACHER_ASSIGNMENT_INVALID',
            'BLOCKER',
            `Teacher assignment ${assignment.id} references a subject not linked to ${sourceClass.name}`,
            'TeacherSubject',
            assignment.id,
          );
          continue;
        }
        const operationKey = `teacher-assignment:${assignment.id}`;
        const task = taskMap.get(operationKey);
        const existing = targetClass?.teacherAssignments.find(item => item.subjectId === assignment.subjectId);
        const disposition: ProposalDisposition = task?.targetEntityId || existing ? 'REUSE' : 'CREATE';
        if (existing && existing.teacherId !== assignment.teacherId) {
          issue(
            issues,
            'TARGET_TEACHER_ASSIGNMENT_PRESERVED',
            'WARNING',
            `The target teacher assignment for ${sourceClass.name} was configured manually and will be preserved`,
            'TeacherSubject',
            existing.id,
          );
        }
        teacherAssignmentProposals.push({
          operationKey,
          sourceEntityId: assignment.id,
          sourceClassId: sourceClass.id,
          subjectId: assignment.subjectId,
          targetEntityId: task?.targetEntityId ?? existing?.id ?? null,
          disposition,
        });
        incrementCount(counts, 'TEACHER_ASSIGNMENTS', disposition);
      }
    }
  }

  const feeTemplateProposals: RelationProposal[] = [];
  const feeTemplateProposalBySourceId = new Map<string, RelationProposal>();
  if (hasCategory(context, 'FEE_TEMPLATES')) {
    for (const template of context.sourceFeeTemplates) {
      if (!template.categoryId) {
        issue(
          issues,
          'SOURCE_FEE_CATEGORY_REQUIRED',
          'BLOCKER',
          `${template.name} must have a fee category before it can be prepared`,
          'FeeTemplate',
          template.id,
        );
        continue;
      }
      const operationKey = `fee-template:${template.id}`;
      const task = taskMap.get(operationKey);
      let targetEntityId: string | null = null;
      let disposition: ProposalDisposition = 'CREATE';
      if (task?.targetEntityId) {
        const mapped = context.targetFeeTemplates.find(item => item.id === task.targetEntityId);
        if (!mapped) {
          issue(
            issues,
            'PREPARED_TARGET_MISSING',
            'BLOCKER',
            `Mapped target fee template for ${template.name} no longer exists`,
            'TermRolloverTask',
            task.id,
          );
        } else {
          targetEntityId = mapped.id;
          disposition = 'REUSE';
        }
      } else {
        const candidates = context.targetFeeTemplates.filter(item => (
          normalizeName(item.name) === normalizeName(template.name)
          && item.applicableGrade === template.applicableGrade
          && item.categoryId === template.categoryId
        ));
        if (candidates.length > 1) {
          issue(
            issues,
            'TARGET_FEE_TEMPLATE_AMBIGUOUS',
            'BLOCKER',
            `Multiple target fee templates match ${template.name}`,
            'FeeTemplate',
            template.id,
          );
        } else if (candidates.length === 1) {
          targetEntityId = candidates[0].id;
          disposition = 'REUSE';
          if (!candidates[0].amount.equals(template.amount)) {
            issue(
              issues,
              'TARGET_FEE_TEMPLATE_PRESERVED',
              'WARNING',
              `${template.name} already exists with a manually configured amount that will be preserved`,
              'FeeTemplate',
              candidates[0].id,
            );
          }
        }
      }
      const proposal: RelationProposal = {
        operationKey,
        sourceEntityId: template.id,
        sourceClassId: '',
        sourceFeeTemplateId: template.id,
        targetEntityId,
        disposition,
      };
      feeTemplateProposals.push(proposal);
      feeTemplateProposalBySourceId.set(template.id, proposal);
      incrementCount(counts, 'FEE_TEMPLATES', disposition);
    }
  }

  const classFeeAssignmentProposals: RelationProposal[] = [];
  if (hasCategory(context, 'CLASS_FEE_ASSIGNMENTS')) {
    for (const sourceClass of context.sourceClasses) {
      const classProposal = classProposalBySourceId.get(sourceClass.id);
      if (!classProposal) continue;
      const targetClass = classProposal.targetEntityId
        ? context.targetClasses.find(item => item.id === classProposal.targetEntityId)
        : null;
      for (const assignment of sourceClass.classFeeAssignments) {
        const feeProposal = feeTemplateProposalBySourceId.get(assignment.feeTemplateId);
        if (!feeProposal || !assignment.categoryId) {
          issue(
            issues,
            'SOURCE_CLASS_FEE_INVALID',
            'BLOCKER',
            `Fee assignment ${assignment.id} cannot be mapped safely`,
            'ClassFeeAssignment',
            assignment.id,
          );
          continue;
        }
        const operationKey = `class-fee-assignment:${assignment.id}`;
        const task = taskMap.get(operationKey);
        const existing = targetClass?.classFeeAssignments.find(item => item.categoryId === assignment.categoryId);
        const disposition: ProposalDisposition = task?.targetEntityId || existing ? 'REUSE' : 'CREATE';
        if (existing && feeProposal.targetEntityId && existing.feeTemplateId !== feeProposal.targetEntityId) {
          issue(
            issues,
            'TARGET_CLASS_FEE_PRESERVED',
            'WARNING',
            `A manually configured target fee for ${sourceClass.name} will be preserved`,
            'ClassFeeAssignment',
            existing.id,
          );
        }
        classFeeAssignmentProposals.push({
          operationKey,
          sourceEntityId: assignment.id,
          sourceClassId: sourceClass.id,
          sourceFeeTemplateId: assignment.feeTemplateId,
          targetEntityId: task?.targetEntityId ?? existing?.id ?? null,
          disposition,
        });
        incrementCount(counts, 'CLASS_FEE_ASSIGNMENTS', disposition);
      }
    }
  }

  const timetableProposals: TimetableProposal[] = [];
  if (hasCategory(context, 'TIMETABLE')) {
    for (const period of context.sourceTimetablePeriods) {
      const mappedClassProposals = period.classes
        .map(link => classProposalBySourceId.get(link.classId))
        .filter((proposal): proposal is ClassProposal => Boolean(proposal));
      if (mappedClassProposals.length === 0) {
        incrementCount(counts, 'TIMETABLE', 'SKIP');
        continue;
      }
      if (mappedClassProposals.length !== period.classes.length) {
        issue(
          issues,
          'TIMETABLE_PARTIALLY_MAPPED',
          'WARNING',
          `A timetable period will include only mapped target classes`,
          'TimetablePeriod',
          period.id,
        );
      }
      const operationKey = `timetable-period:${period.id}`;
      const task = taskMap.get(operationKey);
      let targetEntityId: string | null = null;
      let disposition: ProposalDisposition = 'CREATE';
      if (task?.targetEntityId) {
        const mapped = context.targetTimetablePeriods.find(item => item.id === task.targetEntityId);
        if (!mapped) {
          issue(
            issues,
            'PREPARED_TARGET_MISSING',
            'BLOCKER',
            `Mapped target timetable period no longer exists`,
            'TermRolloverTask',
            task.id,
          );
        } else {
          targetEntityId = mapped.id;
          disposition = 'REUSE';
        }
      } else {
        const targetClassIds = mappedClassProposals
          .map(proposal => proposal.targetEntityId)
          .filter((id): id is string => Boolean(id));
        if (targetClassIds.length === mappedClassProposals.length) {
          const exact = context.targetTimetablePeriods.filter(item => (
            item.subjectId === period.subjectId
            && item.teacherId === period.teacherId
            && item.dayOfWeek === period.dayOfWeek
            && item.startTime === period.startTime
            && item.endTime === period.endTime
            && sameIdSet(item.classes.map(link => link.classId), targetClassIds)
          ));
          if (exact.length > 1) {
            issue(
              issues,
              'TARGET_TIMETABLE_AMBIGUOUS',
              'BLOCKER',
              'Multiple target timetable periods match one source period',
              'TimetablePeriod',
              period.id,
            );
          } else if (exact.length === 1) {
            targetEntityId = exact[0].id;
            disposition = 'REUSE';
          }
        }
        if (!targetEntityId) {
          const targetClassIdSet = new Set(targetClassIds);
          const conflict = context.targetTimetablePeriods.find(item => (
            item.dayOfWeek === period.dayOfWeek
            && periodsOverlap(item, period)
            && (item.teacherId === period.teacherId
              || item.classes.some(link => targetClassIdSet.has(link.classId)))
          ));
          if (conflict) {
            issue(
              issues,
              'TARGET_TIMETABLE_CONFLICT',
              'BLOCKER',
              'A target teacher or class is already scheduled during this period',
              'TimetablePeriod',
              conflict.id,
            );
          }
        }
      }
      timetableProposals.push({
        operationKey,
        sourcePeriodId: period.id,
        sourceClassIds: mappedClassProposals.map(proposal => proposal.sourceClassId),
        targetEntityId,
        disposition,
      });
      incrementCount(counts, 'TIMETABLE', disposition);
    }
  }

  const lessonPlanProposals: LessonPlanProposal[] = [];
  if (hasCategory(context, 'LESSON_PLANS')) {
    for (const plan of context.sourceLessonPlans) {
      const classProposal = classProposalBySourceId.get(plan.classId);
      if (!classProposal) {
        incrementCount(counts, 'LESSON_PLANS', 'SKIP');
        continue;
      }
      const operationKey = `lesson-plan:${plan.id}`;
      const task = taskMap.get(operationKey);
      let targetEntityId: string | null = null;
      let disposition: ProposalDisposition = 'CREATE';
      if (task?.targetEntityId) {
        const mapped = context.targetLessonPlans.find(item => item.id === task.targetEntityId);
        if (!mapped) {
          issue(
            issues,
            'PREPARED_TARGET_MISSING',
            'BLOCKER',
            `Mapped target lesson plan for ${plan.title} no longer exists`,
            'TermRolloverTask',
            task.id,
          );
        } else {
          targetEntityId = mapped.id;
          disposition = 'REUSE';
        }
      } else if (classProposal.targetEntityId) {
        const shiftedDate = shiftDate(
          plan.weekStartDate,
          context.rollover.sourceTerm.startDate,
          context.rollover.targetTerm.startDate,
        ) as Date;
        const matches = context.targetLessonPlans.filter(item => (
          item.classId === classProposal.targetEntityId
          && item.subjectId === plan.subjectId
          && item.teacherId === plan.teacherId
          && item.title === plan.title
          && item.weekStartDate.getTime() === shiftedDate.getTime()
        ));
        if (matches.length > 1) {
          issue(
            issues,
            'TARGET_LESSON_PLAN_AMBIGUOUS',
            'BLOCKER',
            `Multiple target lesson plans match ${plan.title}`,
            'LessonPlan',
            plan.id,
          );
        } else if (matches.length === 1) {
          targetEntityId = matches[0].id;
          disposition = 'REUSE';
        }
      }
      lessonPlanProposals.push({
        operationKey,
        sourceLessonPlanId: plan.id,
        sourceClassId: plan.classId,
        targetEntityId,
        disposition,
      });
      incrementCount(counts, 'LESSON_PLANS', disposition);
    }
  }

  const sourceHash = fingerprint(sourceSetupSnapshot(context));
  const targetBaselineHash = fingerprint(targetSetupSnapshot(context));
  const inputHash = fingerprint({ sourceHash, targetBaselineHash, configuration: context.configuration });
  return {
    rolloverId: context.rollover.id,
    transitionType: context.rollover.transitionType,
    sourceTerm: {
      id: context.rollover.sourceTerm.id,
      name: context.rollover.sourceTerm.name,
      status: context.rollover.sourceTerm.status,
      academicYearId: context.rollover.sourceTerm.academicYearId as string,
      sequence: context.rollover.sourceTerm.sequence as number,
    },
    targetTerm: {
      id: context.rollover.targetTerm.id,
      name: context.rollover.targetTerm.name,
      status: context.rollover.targetTerm.status,
      academicYearId: context.rollover.targetTerm.academicYearId as string,
      sequence: context.rollover.targetTerm.sequence as number,
    },
    configuration: context.configuration,
    inputHash,
    sourceHash,
    targetBaselineHash,
    counts,
    issues,
    yearEndMappings,
    operationalActivity: context.operationalActivity,
    canPrepare: !issues.some(item => item.severity === 'BLOCKER'),
    context,
    proposals: {
      cohorts: cohortProposals,
      classes: classProposals,
      subjectLinks: subjectLinkProposals,
      teacherAssignments: teacherAssignmentProposals,
      feeTemplates: feeTemplateProposals,
      classFeeAssignments: classFeeAssignmentProposals,
      timetablePeriods: timetableProposals,
      lessonPlans: lessonPlanProposals,
    },
  };
};

const publicPlan = (plan: InternalTermRolloverPlan): TermRolloverPlan => {
  const { context: _context, proposals: _proposals, ...result } = plan;
  return result;
};

export const planTermRollover = async (rolloverId: string): Promise<TermRolloverPlan> => (
  publicPlan(await buildPlanInternal(prisma, rolloverId))
);

interface TaskResolution {
  targetEntityId: string;
  generated: boolean;
  details?: Record<string, unknown>;
}

const resolvePreparationTask = async (
  tx: Prisma.TransactionClient,
  plan: InternalTermRolloverPlan,
  category: RolloverPlanCategory,
  operationKey: string,
  sourceEntityId: string,
  resolver: () => Promise<TaskResolution>,
): Promise<TaskResolution> => {
  const existing = plan.context.rollover.tasks.find(task => task.operationKey === operationKey);
  if (existing) {
    if (existing.status !== 'COMPLETED' || !existing.targetEntityId) {
      throw new TermRolloverError(
        'ROLLOVER_PREPARATION_BLOCKED',
        `Preparation task ${operationKey} does not have a completed target mapping`,
      );
    }
    const resultData = isRecord(existing.resultData) ? existing.resultData : {};
    return {
      targetEntityId: existing.targetEntityId,
      generated: resultData.generated === true,
      details: isRecord(resultData.details) ? resultData.details : undefined,
    };
  }

  const resolution = await resolver();
  await tx.termRolloverTask.create({
    data: {
      rolloverId: plan.rolloverId,
      category,
      operationKey,
      sourceEntityId,
      targetEntityId: resolution.targetEntityId,
      status: 'COMPLETED',
      attemptCount: 1,
      startedAt: new Date(),
      completedAt: new Date(),
      resultData: {
        generated: resolution.generated,
        reused: !resolution.generated,
        details: resolution.details ?? {},
      } as Prisma.InputJsonValue,
    },
  });
  return resolution;
};

const applyPreparationPlan = async (
  tx: Prisma.TransactionClient,
  plan: InternalTermRolloverPlan,
) => {
  const sourceClassById = new Map(plan.context.sourceClasses.map(item => [item.id, item]));
  const sourceFeeById = new Map(plan.context.sourceFeeTemplates.map(item => [item.id, item]));
  const sourceTimetableById = new Map(plan.context.sourceTimetablePeriods.map(item => [item.id, item]));
  const sourceLessonById = new Map(plan.context.sourceLessonPlans.map(item => [item.id, item]));
  const sourceAssignmentById = new Map(
    plan.context.sourceClasses.flatMap(item => item.teacherAssignments).map(item => [item.id, item]),
  );
  const sourceClassFeeById = new Map(
    plan.context.sourceClasses.flatMap(item => item.classFeeAssignments).map(item => [item.id, item]),
  );
  const targetCohortBySourceId = new Map<string, string>();
  const targetClassBySourceId = new Map<string, string>();
  const targetFeeBySourceId = new Map<string, string>();

  for (const proposal of plan.proposals.cohorts) {
    if (proposal.disposition === 'SKIP') continue;
    const resolution = await resolvePreparationTask(
      tx,
      plan,
      'CLASS_COHORTS',
      proposal.operationKey,
      proposal.sourceCohortId,
      async () => {
        if (proposal.targetEntityId) {
          return { targetEntityId: proposal.targetEntityId, generated: false };
        }
        const created = await tx.classCohort.create({
          data: {
            academicYearId: plan.targetTerm.academicYearId,
            name: proposal.targetName,
            gradeLevel: proposal.targetGradeLevel,
            branchId: proposal.branchId,
            predecessorCohortId: proposal.sourceCohortId,
          },
        });
        return { targetEntityId: created.id, generated: true };
      },
    );
    targetCohortBySourceId.set(proposal.sourceCohortId, resolution.targetEntityId);
  }

  for (const proposal of plan.proposals.classes) {
    const sourceClass = sourceClassById.get(proposal.sourceClassId);
    if (!sourceClass) continue;
    const targetCohortId = plan.transitionType === TermRolloverType.WITHIN_YEAR
      ? proposal.sourceCohortId
      : targetCohortBySourceId.get(proposal.sourceCohortId);
    if (!targetCohortId) {
      throw new TermRolloverError(
        'ROLLOVER_PREPARATION_BLOCKED',
        `No target cohort mapping exists for ${sourceClass.name}`,
      );
    }
    const targetGradeLevel = plan.transitionType === TermRolloverType.YEAR_END
      ? plan.proposals.cohorts.find(item => item.sourceCohortId === proposal.sourceCohortId)?.targetGradeLevel
        ?? sourceClass.gradeLevel
      : sourceClass.gradeLevel;
    const targetName = plan.transitionType === TermRolloverType.YEAR_END
      ? plan.proposals.cohorts.find(item => item.sourceCohortId === proposal.sourceCohortId)?.targetName
        ?? sourceClass.name
      : sourceClass.name;
    const resolution = await resolvePreparationTask(
      tx,
      plan,
      'CLASS_OFFERINGS',
      proposal.operationKey,
      sourceClass.id,
      async () => {
        if (proposal.targetEntityId) {
          return { targetEntityId: proposal.targetEntityId, generated: false };
        }
        const created = await tx.class.create({
          data: {
            name: targetName,
            gradeLevel: targetGradeLevel,
            teacherId: sourceClass.teacherId,
            academicTermId: plan.targetTerm.id,
            classCohortId: targetCohortId,
            branchId: sourceClass.branchId,
          },
        });
        return { targetEntityId: created.id, generated: true };
      },
    );
    targetClassBySourceId.set(sourceClass.id, resolution.targetEntityId);
  }

  for (const proposal of plan.proposals.subjectLinks) {
    const targetClassId = targetClassBySourceId.get(proposal.sourceClassId);
    if (!targetClassId || !proposal.subjectId) continue;
    await resolvePreparationTask(
      tx,
      plan,
      'SUBJECT_LINKS',
      proposal.operationKey,
      proposal.sourceEntityId,
      async () => {
        if (proposal.disposition === 'CREATE') {
          await tx.class.update({
            where: { id: targetClassId },
            data: { subjects: { connect: { id: proposal.subjectId } } },
          });
        }
        return {
          targetEntityId: targetClassId,
          generated: proposal.disposition === 'CREATE',
          details: { subjectId: proposal.subjectId },
        };
      },
    );
  }

  for (const proposal of plan.proposals.teacherAssignments) {
    const sourceAssignment = sourceAssignmentById.get(proposal.sourceEntityId);
    const targetClassId = targetClassBySourceId.get(proposal.sourceClassId);
    if (!sourceAssignment || !targetClassId) continue;
    await resolvePreparationTask(
      tx,
      plan,
      'TEACHER_ASSIGNMENTS',
      proposal.operationKey,
      sourceAssignment.id,
      async () => {
        if (proposal.targetEntityId) {
          return { targetEntityId: proposal.targetEntityId, generated: false };
        }
        const created = await tx.teacherSubject.create({
          data: {
            classId: targetClassId,
            subjectId: sourceAssignment.subjectId,
            teacherId: sourceAssignment.teacherId,
          },
        });
        return { targetEntityId: created.id, generated: true };
      },
    );
  }

  for (const proposal of plan.proposals.feeTemplates) {
    const sourceTemplate = sourceFeeById.get(proposal.sourceEntityId);
    if (!sourceTemplate) continue;
    const resolution = await resolvePreparationTask(
      tx,
      plan,
      'FEE_TEMPLATES',
      proposal.operationKey,
      sourceTemplate.id,
      async () => {
        if (proposal.targetEntityId) {
          return { targetEntityId: proposal.targetEntityId, generated: false };
        }
        const created = await tx.feeTemplate.create({
          data: {
            name: sourceTemplate.name,
            amount: sourceTemplate.amount,
            academicTermId: plan.targetTerm.id,
            applicableGrade: sourceTemplate.applicableGrade,
            categoryId: sourceTemplate.categoryId,
          },
        });
        return { targetEntityId: created.id, generated: true };
      },
    );
    targetFeeBySourceId.set(sourceTemplate.id, resolution.targetEntityId);
  }

  for (const proposal of plan.proposals.classFeeAssignments) {
    const sourceAssignment = sourceClassFeeById.get(proposal.sourceEntityId);
    const targetClassId = targetClassBySourceId.get(proposal.sourceClassId);
    const targetFeeTemplateId = proposal.sourceFeeTemplateId
      ? targetFeeBySourceId.get(proposal.sourceFeeTemplateId)
      : null;
    if (!sourceAssignment || !targetClassId || !targetFeeTemplateId) continue;
    await resolvePreparationTask(
      tx,
      plan,
      'CLASS_FEE_ASSIGNMENTS',
      proposal.operationKey,
      sourceAssignment.id,
      async () => {
        if (proposal.targetEntityId) {
          return { targetEntityId: proposal.targetEntityId, generated: false };
        }
        const created = await tx.classFeeAssignment.create({
          data: {
            classId: targetClassId,
            feeTemplateId: targetFeeTemplateId,
            academicTermId: plan.targetTerm.id,
            categoryId: sourceAssignment.categoryId,
            dueDate: shiftDate(
              sourceAssignment.dueDate,
              plan.context.rollover.sourceTerm.startDate,
              plan.context.rollover.targetTerm.startDate,
            ),
          },
        });
        return { targetEntityId: created.id, generated: true };
      },
    );
  }

  for (const proposal of plan.proposals.timetablePeriods) {
    const sourcePeriod = sourceTimetableById.get(proposal.sourcePeriodId);
    const targetClassIds = proposal.sourceClassIds
      .map(sourceClassId => targetClassBySourceId.get(sourceClassId))
      .filter((id): id is string => Boolean(id));
    if (!sourcePeriod || targetClassIds.length === 0) continue;
    await resolvePreparationTask(
      tx,
      plan,
      'TIMETABLE',
      proposal.operationKey,
      sourcePeriod.id,
      async () => {
        if (proposal.targetEntityId) {
          return { targetEntityId: proposal.targetEntityId, generated: false };
        }
        const created = await tx.timetablePeriod.create({
          data: {
            subjectId: sourcePeriod.subjectId,
            teacherId: sourcePeriod.teacherId,
            dayOfWeek: sourcePeriod.dayOfWeek,
            startTime: sourcePeriod.startTime,
            endTime: sourcePeriod.endTime,
            academicTermId: plan.targetTerm.id,
            classes: { create: targetClassIds.map(classId => ({ classId })) },
          },
        });
        return { targetEntityId: created.id, generated: true };
      },
    );
  }

  for (const proposal of plan.proposals.lessonPlans) {
    const sourcePlan = sourceLessonById.get(proposal.sourceLessonPlanId);
    const targetClassId = targetClassBySourceId.get(proposal.sourceClassId);
    if (!sourcePlan || !targetClassId) continue;
    await resolvePreparationTask(
      tx,
      plan,
      'LESSON_PLANS',
      proposal.operationKey,
      sourcePlan.id,
      async () => {
        if (proposal.targetEntityId) {
          return { targetEntityId: proposal.targetEntityId, generated: false };
        }
        const created = await tx.lessonPlan.create({
          data: {
            teacherId: sourcePlan.teacherId,
            classId: targetClassId,
            subjectId: sourcePlan.subjectId,
            termId: plan.targetTerm.id,
            weekStartDate: shiftDate(
              sourcePlan.weekStartDate,
              plan.context.rollover.sourceTerm.startDate,
              plan.context.rollover.targetTerm.startDate,
            ) as Date,
            title: sourcePlan.title,
            content: sourcePlan.content,
            fileUrl: sourcePlan.fileUrl,
          },
        });
        return { targetEntityId: created.id, generated: true };
      },
    );
  }
};

export const prepareTermRollover = async (
  rolloverId: string,
  expectedInputHash: string,
  actorUserId: string,
) => runRolloverTransaction(async tx => {
  await lockRollover(tx, rolloverId);
  const initial = await tx.termRollover.findUnique({ where: { id: rolloverId } });
  if (!initial) throw new TermRolloverError('ROLLOVER_NOT_FOUND', 'Term rollover not found', 404);
  if (initial.status !== TermRolloverStatus.DRAFT
    && initial.status !== TermRolloverStatus.PREPARED) {
    throw new TermRolloverError(
      'INVALID_ROLLOVER_STATUS',
      `Target preparation is not available while the rollover is ${initial.status}`,
    );
  }

  const existingMetadata = getStoredPreparationMetadata(initial.configuration);
  const plan = await buildPlanInternal(tx, rolloverId);
  if (initial.status === TermRolloverStatus.DRAFT && plan.inputHash !== expectedInputHash) {
    throw new TermRolloverError(
      'STALE_ROLLOVER_PLAN',
      'Source or target setup changed after the dry run. Run the dry run again',
      409,
      { expectedInputHash, currentInputHash: plan.inputHash },
    );
  }
  if (initial.status === TermRolloverStatus.PREPARED
    && existingMetadata
    && plan.sourceHash !== existingMetadata.sourceHash) {
    throw new TermRolloverError(
      'SOURCE_CONFIGURATION_CHANGED',
      'Source setup changed after preparation. Create a new dry run before continuing',
      409,
      { preparedSourceHash: existingMetadata.sourceHash, currentSourceHash: plan.sourceHash },
    );
  }
  if (!plan.canPrepare) {
    throw new TermRolloverError(
      'ROLLOVER_PREPARATION_BLOCKED',
      'Target preparation is blocked by validation issues',
      409,
      { issues: plan.issues },
    );
  }

  const manualChangesDetected = Boolean(
    existingMetadata && existingMetadata.preparedHash !== plan.targetBaselineHash,
  );
  if (initial.status === TermRolloverStatus.PREPARED) {
    await appendRolloverEvent(tx, rolloverId, 'TARGET_PREPARATION_REUSED', actorUserId, {
      inputHash: initial.inputHash,
      manualChangesDetected,
      taskCount: initial.status === 'PREPARED' ? plan.context.rollover.tasks.length : 0,
    });
    return {
      rollover: await getTermRollover(rolloverId, tx),
      counts: existingMetadata?.counts ?? plan.counts,
      manualChangesDetected,
      reused: true,
    };
  }

  await assertTermWriteAllowed(plan.targetTerm.id, 'SETUP', { client: tx });
  await tx.termRollover.update({
    where: { id: rolloverId },
    data: { status: TermRolloverStatus.PREPARING },
  });
  await appendRolloverEvent(tx, rolloverId, 'TARGET_PREPARATION_STARTED', actorUserId, {
    inputHash: plan.inputHash,
    counts: plan.counts,
  });

  await applyPreparationPlan(tx, plan);
  const refreshedContext = await loadPreparationContext(tx, rolloverId);
  const preparedHash = fingerprint(targetSetupSnapshot(refreshedContext));
  const taskCount = await tx.termRolloverTask.count({ where: { rolloverId } });
  const metadata: StoredPreparationMetadata = {
    sourceHash: plan.sourceHash,
    preparedHash,
    preparedAt: new Date().toISOString(),
    preparedByUserId: actorUserId,
    taskCount,
    counts: plan.counts,
  };
  await tx.termRollover.update({
    where: { id: rolloverId },
    data: {
      status: TermRolloverStatus.PREPARED,
      inputHash: plan.inputHash,
      configuration: configurationJson(plan.configuration, metadata),
      failureCode: null,
      failureMessage: null,
      version: { increment: 1 },
    },
  });
  await appendRolloverEvent(tx, rolloverId, 'TARGET_PREPARED', actorUserId, {
    inputHash: plan.inputHash,
    preparedHash,
    taskCount,
    counts: plan.counts,
    operationalActivity: refreshedContext.operationalActivity,
  });

  return {
    rollover: await getTermRollover(rolloverId, tx),
    counts: plan.counts,
    manualChangesDetected: false,
    reused: false,
  };
});

export const validateTermRolloverPreparation = async (
  rolloverId: string,
  client: RolloverClient = prisma,
) => {
  const plan = await buildPlanInternal(client, rolloverId);
  const metadata = getStoredPreparationMetadata(plan.context.rollover.configuration);
  const issues = [...plan.issues];
  const prepared = plan.context.rollover.status === TermRolloverStatus.PREPARED
    || plan.context.rollover.status === TermRolloverStatus.READY;
  const sourceChanged = Boolean(metadata && metadata.sourceHash !== plan.sourceHash);
  const manualChangesDetected = Boolean(metadata && metadata.preparedHash !== plan.targetBaselineHash);

  if (sourceChanged) {
    issue(
      issues,
      'PREPARED_SOURCE_CHANGED',
      'BLOCKER',
      'Source setup changed after target preparation',
      'TermRollover',
      rolloverId,
      { preparedSourceHash: metadata?.sourceHash, currentSourceHash: plan.sourceHash },
    );
  }
  if (manualChangesDetected) {
    issue(
      issues,
      'PREPARED_TARGET_CHANGED',
      'WARNING',
      'Prepared target setup was edited after preparation; the edits were preserved',
      'TermRollover',
      rolloverId,
      { preparedHash: metadata?.preparedHash, currentPreparedHash: plan.targetBaselineHash },
    );
  }

  return {
    rolloverId,
    prepared,
    sourceChanged,
    manualChangesDetected,
    preparedHash: metadata?.preparedHash ?? null,
    currentPreparedHash: plan.targetBaselineHash,
    operationalActivity: plan.operationalActivity,
    issues,
    valid: prepared && !issues.some(item => item.severity === 'BLOCKER'),
  };
};
