import {
  Prisma,
  StudentTransitionAction,
  TermRolloverStatus,
  TermRolloverType,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../utils/prisma';
import { assertTermWriteAllowed } from './termLifecycleService';
import { upsertStudentPlacement } from './studentPlacementService';
import { validateTermRolloverPreparation } from './termRolloverPreparationService';

type EnrollmentClient = Prisma.TransactionClient | typeof prisma;
type EnrollmentOperation<T> = (tx: Prisma.TransactionClient) => Promise<T>;

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const AUTOMATIC_CARRY_FORWARD_REASON = 'Automatic within-year same-cohort carry-forward';
const ENROLLMENT_ACTIONS: StudentTransitionAction[] = [
  StudentTransitionAction.CARRY_FORWARD,
  StudentTransitionAction.PROMOTE,
  StudentTransitionAction.RETAIN,
];
const YEAR_END_ACTIONS: StudentTransitionAction[] = [
  StudentTransitionAction.PROMOTE,
  StudentTransitionAction.RETAIN,
  StudentTransitionAction.GRADUATE,
  StudentTransitionAction.TRANSFER,
  StudentTransitionAction.WITHDRAW,
];

export type RolloverEnrollmentIssueSeverity = 'BLOCKER' | 'WARNING';
export type RolloverEnrollmentErrorCode =
  | 'ROLLOVER_NOT_FOUND'
  | 'ROLLOVER_NOT_PREPARED'
  | 'TARGET_TERM_NOT_DRAFT'
  | 'SOURCE_TERM_NOT_ELIGIBLE'
  | 'INVALID_TRANSITION_TYPE'
  | 'INVALID_TRANSITION_DECISION'
  | 'DUPLICATE_TRANSITION_DECISION'
  | 'STALE_ENROLLMENT_PLAN'
  | 'ENROLLMENT_STAGING_BLOCKED'
  | 'ENROLLMENT_STAGING_LOCKED'
  | 'ENROLLMENT_STAGING_CONFLICT';

export class TermRolloverEnrollmentError extends Error {
  constructor(
    public readonly code: RolloverEnrollmentErrorCode,
    message: string,
    public readonly statusCode = 409,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'TermRolloverEnrollmentError';
  }
}

export interface RolloverEnrollmentIssue {
  code: string;
  severity: RolloverEnrollmentIssueSeverity;
  message: string;
  studentId?: string;
  sourceEnrollmentId?: string;
  details?: Record<string, unknown>;
}

export interface RolloverTargetClassOption {
  id: string;
  name: string;
  gradeLevel: number;
  branchId: string | null;
  classCohortId: string | null;
  actions: Array<'CARRY_FORWARD' | 'PROMOTE' | 'RETAIN'>;
}

export interface RolloverEnrollmentDecisionView {
  id: string;
  action: StudentTransitionAction;
  targetClassId: string | null;
  reason: string | null;
  decidedByUserId: string | null;
  updatedAt: string;
}

export type RolloverEnrollmentOutcomeState =
  | 'DECISION_REQUIRED'
  | 'READY_TO_STAGE'
  | 'STAGED'
  | 'TERMINAL'
  | 'BLOCKED';

export interface RolloverEnrollmentOutcome {
  studentId: string;
  sourceEnrollmentId: string;
  admissionNumber: string;
  studentName: string;
  sourceClass: {
    id: string;
    name: string;
    gradeLevel: number;
    branchId: string | null;
    classCohortId: string | null;
  };
  decision: RolloverEnrollmentDecisionView | null;
  action: StudentTransitionAction | null;
  targetClassId: string | null;
  mappedTargetClassId: string | null;
  targetOptions: RolloverTargetClassOption[];
  targetEnrollmentId: string | null;
  state: RolloverEnrollmentOutcomeState;
}

export interface EnrollmentStagingMetadata {
  sourceHash: string;
  decisionHash: string;
  targetHash: string;
  reviewedInputHash: string;
  outcomeHash: string;
  stagedAt: string;
  stagedByUserId: string;
  eligibleCount: number;
  enrollmentCount: number;
  terminalCount: number;
}

export interface TermRolloverEnrollmentPlan {
  rolloverId: string;
  transitionType: TermRolloverType;
  rolloverStatus: TermRolloverStatus;
  sourceTerm: { id: string; name: string; status: string };
  targetTerm: { id: string; name: string; status: string };
  sourceHash: string;
  decisionHash: string;
  targetHash: string;
  inputHash: string;
  currentOutcomeHash: string;
  targetClasses: RolloverTargetClassOption[];
  outcomes: RolloverEnrollmentOutcome[];
  summary: {
    eligibleCount: number;
    excludedCount: number;
    decisionCount: number;
    missingDecisionCount: number;
    stagedEnrollmentCount: number;
    terminalOutcomeCount: number;
    completeOutcomeCount: number;
  };
  preparationValid: boolean;
  staging: EnrollmentStagingMetadata | null;
  staged: boolean;
  issues: RolloverEnrollmentIssue[];
  canStage: boolean;
}

export interface YearEndDecisionInput {
  studentId: string;
  action: Exclude<StudentTransitionAction, 'CARRY_FORWARD'>;
  targetClassId?: string | null;
  reason?: string | null;
}

interface NormalizedDecisionInput {
  studentId: string;
  action: StudentTransitionAction;
  targetClassId: string | null;
  reason: string | null;
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

const hasPrismaCode = (error: unknown, code: string): boolean => (
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
);

const runEnrollmentTransaction = async <T>(operation: EnrollmentOperation<T>): Promise<T> => {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryableConflict = hasPrismaCode(error, 'P2034') || hasPrismaCode(error, 'P2002');
      if (retryableConflict && attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
      if (retryableConflict) {
        throw new TermRolloverEnrollmentError(
          'ENROLLMENT_STAGING_CONFLICT',
          'Enrollment staging changed concurrently. Refresh and try again',
        );
      }
      throw error;
    }
  }
  throw new TermRolloverEnrollmentError(
    'ENROLLMENT_STAGING_CONFLICT',
    'Enrollment staging changed concurrently. Refresh and try again',
  );
};

const lockRollover = async (tx: Prisma.TransactionClient, rolloverId: string) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sync:term-rollover:${rolloverId}`}))`;
};

const appendRolloverEvent = async (
  tx: Prisma.TransactionClient,
  rolloverId: string,
  type: string,
  actorUserId: string,
  payload: Record<string, unknown>,
) => {
  const current = await tx.termRolloverEvent.aggregate({
    where: { rolloverId },
    _max: { sequence: true },
  });
  await tx.termRolloverEvent.create({
    data: {
      rolloverId,
      sequence: (current._max.sequence ?? 0) + 1,
      type,
      actorUserId,
      payload: payload as Prisma.InputJsonValue,
    },
  });
};

const configurationRecord = (value: unknown): Record<string, unknown> => (
  isRecord(value) ? { ...value } : {}
);

const getStagingMetadata = (value: unknown): EnrollmentStagingMetadata | null => {
  if (!isRecord(value) || !isRecord(value.enrollmentStaging)) return null;
  const metadata = value.enrollmentStaging;
  if (typeof metadata.sourceHash !== 'string'
    || typeof metadata.decisionHash !== 'string'
    || typeof metadata.targetHash !== 'string'
    || typeof metadata.reviewedInputHash !== 'string'
    || typeof metadata.outcomeHash !== 'string'
    || typeof metadata.stagedAt !== 'string'
    || typeof metadata.stagedByUserId !== 'string'
    || typeof metadata.eligibleCount !== 'number'
    || typeof metadata.enrollmentCount !== 'number'
    || typeof metadata.terminalCount !== 'number') {
    return null;
  }
  return metadata as unknown as EnrollmentStagingMetadata;
};

const issue = (
  issues: RolloverEnrollmentIssue[],
  code: string,
  severity: RolloverEnrollmentIssueSeverity,
  message: string,
  options: Pick<RolloverEnrollmentIssue, 'studentId' | 'sourceEnrollmentId' | 'details'> = {},
) => issues.push({ code, severity, message, ...options });

const isEnrollmentAction = (action: StudentTransitionAction | null): boolean => (
  Boolean(action && ENROLLMENT_ACTIONS.includes(action))
);

const normalizeReason = (reason: string | null | undefined): string | null => {
  const normalized = reason?.trim();
  return normalized ? normalized : null;
};

const loadEnrollmentContext = async (client: EnrollmentClient, rolloverId: string) => {
  const rollover = await client.termRollover.findUnique({
    where: { id: rolloverId },
    include: {
      sourceTerm: { include: { academicYear: true } },
      targetTerm: { include: { academicYear: true } },
      tasks: {
        where: { category: 'CLASS_OFFERINGS' },
        orderBy: { operationKey: 'asc' },
      },
      transitionDecisions: { orderBy: { studentId: 'asc' } },
    },
  });
  if (!rollover) {
    throw new TermRolloverEnrollmentError('ROLLOVER_NOT_FOUND', 'Term rollover not found', 404);
  }
  if (rollover.status !== TermRolloverStatus.PREPARED
    && rollover.status !== TermRolloverStatus.READY) {
    throw new TermRolloverEnrollmentError(
      'ROLLOVER_NOT_PREPARED',
      'Enrollment evidence is available only after target setup is prepared',
    );
  }
  if (rollover.targetTerm.status !== 'DRAFT') {
    throw new TermRolloverEnrollmentError(
      'TARGET_TERM_NOT_DRAFT',
      'Enrollment outcomes can only be staged in a draft target term',
    );
  }
  if (rollover.sourceTerm.status !== 'ACTIVE' && rollover.sourceTerm.status !== 'CLOSING') {
    throw new TermRolloverEnrollmentError(
      'SOURCE_TERM_NOT_ELIGIBLE',
      'The source term must remain active or closing while enrollment outcomes are staged',
    );
  }

  const [preparationValidation, sourceEnrollments, targetClasses, targetEnrollments] = await Promise.all([
    validateTermRolloverPreparation(rolloverId, client),
    client.studentTermEnrollment.findMany({
      where: { academicTermId: rollover.sourceTermId },
      include: {
        student: {
          select: {
            id: true,
            admissionNumber: true,
            firstName: true,
            lastName: true,
            status: true,
            branchId: true,
          },
        },
        class: { include: { classCohort: true } },
      },
      orderBy: { id: 'asc' },
    }),
    client.class.findMany({
      where: { academicTermId: rollover.targetTermId },
      include: { classCohort: true },
      orderBy: { id: 'asc' },
    }),
    client.studentTermEnrollment.findMany({
      where: { academicTermId: rollover.targetTermId },
      orderBy: { id: 'asc' },
    }),
  ]);

  return {
    rollover,
    preparationValidation,
    sourceEnrollments,
    targetClasses,
    targetEnrollments,
  };
};

type EnrollmentContext = Awaited<ReturnType<typeof loadEnrollmentContext>>;
type SourceEnrollment = EnrollmentContext['sourceEnrollments'][number];
type TargetClass = EnrollmentContext['targetClasses'][number];

const mappedTargetForSourceClass = (
  context: EnrollmentContext,
  sourceClassId: string,
): TargetClass | null => {
  const task = context.rollover.tasks.find(candidate => (
    candidate.operationKey === `class:${sourceClassId}`
    && candidate.sourceEntityId === sourceClassId
    && candidate.status === 'COMPLETED'
    && Boolean(candidate.targetEntityId)
  ));
  if (!task?.targetEntityId) return null;
  return context.targetClasses.find(candidate => candidate.id === task.targetEntityId) ?? null;
};

const sameBranch = (left: string | null, right: string | null): boolean => left === right;

const optionForClass = (
  targetClass: TargetClass,
  actions: RolloverTargetClassOption['actions'],
): RolloverTargetClassOption => ({
  id: targetClass.id,
  name: targetClass.name,
  gradeLevel: targetClass.gradeLevel,
  branchId: targetClass.branchId,
  classCohortId: targetClass.classCohortId,
  actions,
});

const mergeTargetOptions = (
  options: RolloverTargetClassOption[],
): RolloverTargetClassOption[] => {
  const merged = new Map<string, RolloverTargetClassOption>();
  for (const option of options) {
    const existing = merged.get(option.id);
    if (!existing) {
      merged.set(option.id, { ...option, actions: [...option.actions] });
      continue;
    }
    existing.actions = [...new Set([...existing.actions, ...option.actions])];
  }
  return [...merged.values()].sort((left, right) => (
    left.gradeLevel - right.gradeLevel || left.name.localeCompare(right.name)
  ));
};

const targetOptionsForSource = (
  context: EnrollmentContext,
  source: SourceEnrollment,
  mappedTarget: TargetClass | null,
): RolloverTargetClassOption[] => {
  if (context.rollover.transitionType === TermRolloverType.WITHIN_YEAR) {
    return mappedTarget ? [optionForClass(mappedTarget, ['CARRY_FORWARD'])] : [];
  }

  const options: RolloverTargetClassOption[] = [];
  if (mappedTarget
    && source.class.classCohortId
    && mappedTarget.classCohort?.predecessorCohortId === source.class.classCohortId
    && mappedTarget.gradeLevel === source.class.gradeLevel + 1
    && sameBranch(mappedTarget.branchId, source.class.branchId)) {
    options.push(optionForClass(mappedTarget, ['PROMOTE']));
  }

  for (const targetClass of context.targetClasses) {
    if (targetClass.gradeLevel === source.class.gradeLevel
      && sameBranch(targetClass.branchId, source.class.branchId)
      && targetClass.classCohort
      && targetClass.classCohort.academicYearId === context.rollover.targetTerm.academicYearId) {
      options.push(optionForClass(targetClass, ['RETAIN']));
    }
  }
  return mergeTargetOptions(options);
};

const validateEffectiveDecision = (
  context: EnrollmentContext,
  source: SourceEnrollment,
  action: StudentTransitionAction | null,
  targetClassId: string | null,
  mappedTarget: TargetClass | null,
  issues: RolloverEnrollmentIssue[],
) => {
  const options = { studentId: source.studentId, sourceEnrollmentId: source.id };
  if (!action) return;

  if (context.rollover.transitionType === TermRolloverType.WITHIN_YEAR) {
    if (action !== StudentTransitionAction.CARRY_FORWARD) {
      issue(issues, 'WITHIN_YEAR_ACTION_INVALID', 'BLOCKER', 'Within-year outcomes must carry forward in the same logical cohort', options);
      return;
    }
    if (!mappedTarget || targetClassId !== mappedTarget.id) {
      issue(issues, 'CARRY_FORWARD_TARGET_REQUIRED', 'BLOCKER', `No prepared same-cohort target class is available for ${source.class.name}`, options);
      return;
    }
    if (mappedTarget.classCohortId !== source.class.classCohortId
      || mappedTarget.gradeLevel !== source.class.gradeLevel
      || !sameBranch(mappedTarget.branchId, source.class.branchId)) {
      issue(issues, 'CARRY_FORWARD_TARGET_INVALID', 'BLOCKER', `Prepared target class for ${source.class.name} is not the same logical cohort, grade, and branch`, options);
    }
    return;
  }

  if (!YEAR_END_ACTIONS.includes(action)) {
    issue(issues, 'YEAR_END_ACTION_INVALID', 'BLOCKER', 'Year-end decisions must promote, retain, graduate, transfer, or withdraw', options);
    return;
  }

  if (action === StudentTransitionAction.PROMOTE) {
    if (!mappedTarget || targetClassId !== mappedTarget.id) {
      issue(issues, 'PROMOTION_TARGET_MAPPING_REQUIRED', 'BLOCKER', `Promotion for ${source.student.firstName} ${source.student.lastName} must use the prepared successor mapping`, options);
      return;
    }
    if (!source.class.classCohortId
      || mappedTarget.classCohort?.predecessorCohortId !== source.class.classCohortId
      || mappedTarget.gradeLevel !== source.class.gradeLevel + 1
      || !sameBranch(mappedTarget.branchId, source.class.branchId)) {
      issue(issues, 'PROMOTION_TARGET_INVALID', 'BLOCKER', 'Promotion target must be the approved next-grade successor in the same branch', options);
    }
    return;
  }

  if (action === StudentTransitionAction.RETAIN) {
    const targetClass = context.targetClasses.find(candidate => candidate.id === targetClassId);
    if (!targetClass
      || targetClass.gradeLevel !== source.class.gradeLevel
      || !sameBranch(targetClass.branchId, source.class.branchId)
      || !targetClass.classCohort
      || targetClass.classCohort.academicYearId !== context.rollover.targetTerm.academicYearId) {
      issue(issues, 'RETENTION_TARGET_INVALID', 'BLOCKER', 'Retention target must be a target-year class at the same grade and branch', options);
    }
    return;
  }

  if (targetClassId !== null) {
    issue(issues, 'TERMINAL_OUTCOME_TARGET_INVALID', 'BLOCKER', `${action.toLowerCase()} is a terminal outcome and cannot create a target enrollment`, options);
  }
};

interface InternalEnrollmentPlan extends TermRolloverEnrollmentPlan {
  context: EnrollmentContext;
}

const buildEnrollmentPlanInternal = async (
  client: EnrollmentClient,
  rolloverId: string,
): Promise<InternalEnrollmentPlan> => {
  const context = await loadEnrollmentContext(client, rolloverId);
  const issues: RolloverEnrollmentIssue[] = context.preparationValidation.issues.map(item => ({
    code: item.code,
    severity: item.severity,
    message: item.message,
    details: item.details,
  }));
  const preparationValid = context.preparationValidation.valid;

  const eligible = context.sourceEnrollments.filter(enrollment => (
    enrollment.status === 'ACTIVE' && enrollment.student.status === 'ACTIVE'
  ));
  const eligibleByStudentId = new Map(eligible.map(enrollment => [enrollment.studentId, enrollment]));
  const decisionsByStudentId = new Map(
    context.rollover.transitionDecisions.map(decision => [decision.studentId, decision]),
  );
  const targetEnrollmentByStudentId = new Map(
    context.targetEnrollments.map(enrollment => [enrollment.studentId, enrollment]),
  );

  for (const source of context.sourceEnrollments) {
    if (source.status === 'ACTIVE' && source.student.status !== 'ACTIVE') {
      issue(
        issues,
        'SOURCE_STATUS_MISMATCH',
        'BLOCKER',
        `${source.student.firstName} ${source.student.lastName} has an active source enrollment but a terminal student status`,
        { studentId: source.studentId, sourceEnrollmentId: source.id },
      );
    }
  }
  for (const decision of context.rollover.transitionDecisions) {
    if (!eligibleByStudentId.has(decision.studentId)) {
      issue(
        issues,
        'INELIGIBLE_TRANSITION_DECISION',
        'BLOCKER',
        'A transition decision references a student who is no longer eligible in the source term',
        { studentId: decision.studentId, sourceEnrollmentId: decision.sourceEnrollmentId },
      );
    }
  }

  const outcomes: RolloverEnrollmentOutcome[] = [];
  let missingDecisionCount = 0;
  let completeOutcomeCount = 0;
  let terminalOutcomeCount = 0;
  let stagedEnrollmentCount = 0;

  for (const source of eligible) {
    const existingDecision = decisionsByStudentId.get(source.studentId) ?? null;
    const mappedTarget = mappedTargetForSourceClass(context, source.classId);
    const targetOptions = targetOptionsForSource(context, source, mappedTarget);
    const action = context.rollover.transitionType === TermRolloverType.WITHIN_YEAR
      ? StudentTransitionAction.CARRY_FORWARD
      : existingDecision?.action ?? null;
    const targetClassId = context.rollover.transitionType === TermRolloverType.WITHIN_YEAR
      ? mappedTarget?.id ?? null
      : existingDecision?.targetClassId ?? null;
    const issueCountBefore = issues.length;

    if (!source.class.classCohortId || !source.class.classCohort) {
      issue(
        issues,
        'SOURCE_COHORT_REQUIRED',
        'BLOCKER',
        `${source.class.name} must have a logical cohort before enrollment can be staged`,
        { studentId: source.studentId, sourceEnrollmentId: source.id },
      );
    }
    if (!mappedTarget && (
      context.rollover.transitionType === TermRolloverType.WITHIN_YEAR
      || action === StudentTransitionAction.PROMOTE
    )) {
      issue(
        issues,
        'PREPARED_CLASS_MAPPING_REQUIRED',
        'BLOCKER',
        `Prepared class mapping is missing for ${source.class.name}`,
        { studentId: source.studentId, sourceEnrollmentId: source.id },
      );
    }
    if (existingDecision && existingDecision.sourceEnrollmentId !== source.id) {
      issue(
        issues,
        'DECISION_SOURCE_MISMATCH',
        'BLOCKER',
        'Transition decision does not reference the eligible source enrollment',
        { studentId: source.studentId, sourceEnrollmentId: source.id },
      );
    }
    if (context.rollover.transitionType === TermRolloverType.YEAR_END && !existingDecision) {
      missingDecisionCount += 1;
    }

    validateEffectiveDecision(context, source, action, targetClassId, mappedTarget, issues);

    const targetEnrollment = targetEnrollmentByStudentId.get(source.studentId) ?? null;
    const expectsEnrollment = isEnrollmentAction(action);
    let enrollmentMatches = false;
    if (targetEnrollment && expectsEnrollment) {
      enrollmentMatches = targetEnrollment.status === 'STAGED'
        && targetEnrollment.classId === targetClassId
        && targetEnrollment.sourceEnrollmentId === source.id
        && targetEnrollment.transitionAction === action;
      if (!enrollmentMatches) {
        issue(
          issues,
          'TARGET_ENROLLMENT_CONFLICT',
          'BLOCKER',
          'An existing target enrollment conflicts with the reviewed rollover outcome',
          { studentId: source.studentId, sourceEnrollmentId: source.id },
        );
      } else {
        stagedEnrollmentCount += 1;
      }
    } else if (targetEnrollment && !expectsEnrollment) {
      issue(
        issues,
        'TERMINAL_OUTCOME_ENROLLMENT_CONFLICT',
        'BLOCKER',
        'A terminal decision cannot retain a target-term enrollment',
        { studentId: source.studentId, sourceEnrollmentId: source.id },
      );
    }

    const decisionMatches = Boolean(existingDecision
      && existingDecision.sourceEnrollmentId === source.id
      && existingDecision.action === action
      && existingDecision.targetClassId === targetClassId);
    const terminal = Boolean(action && !expectsEnrollment);
    if (terminal) terminalOutcomeCount += 1;
    const outcomeComplete = decisionMatches && (terminal ? !targetEnrollment : enrollmentMatches);
    if (outcomeComplete) completeOutcomeCount += 1;

    let state: RolloverEnrollmentOutcomeState;
    if (issues.length > issueCountBefore) state = 'BLOCKED';
    else if (context.rollover.transitionType === TermRolloverType.YEAR_END && !existingDecision) state = 'DECISION_REQUIRED';
    else if (outcomeComplete && terminal) state = 'TERMINAL';
    else if (outcomeComplete) state = 'STAGED';
    else state = 'READY_TO_STAGE';

    outcomes.push({
      studentId: source.studentId,
      sourceEnrollmentId: source.id,
      admissionNumber: source.student.admissionNumber,
      studentName: `${source.student.firstName} ${source.student.lastName}`,
      sourceClass: {
        id: source.class.id,
        name: source.class.name,
        gradeLevel: source.class.gradeLevel,
        branchId: source.class.branchId,
        classCohortId: source.class.classCohortId,
      },
      decision: existingDecision ? {
        id: existingDecision.id,
        action: existingDecision.action,
        targetClassId: existingDecision.targetClassId,
        reason: existingDecision.reason,
        decidedByUserId: existingDecision.decidedByUserId,
        updatedAt: existingDecision.updatedAt.toISOString(),
      } : null,
      action,
      targetClassId,
      mappedTargetClassId: mappedTarget?.id ?? null,
      targetOptions,
      targetEnrollmentId: targetEnrollment?.id ?? null,
      state,
    });
  }

  if (missingDecisionCount > 0) {
    issue(
      issues,
      'YEAR_END_DECISION_SET_INCOMPLETE',
      'BLOCKER',
      `${missingDecisionCount} eligible student${missingDecisionCount === 1 ? '' : 's'} still require a year-end decision`,
      { details: { missingDecisionCount } },
    );
  }

  const sourceHash = fingerprint({
    sourceTermId: context.rollover.sourceTermId,
    enrollments: context.sourceEnrollments.map(enrollment => ({
      id: enrollment.id,
      studentId: enrollment.studentId,
      enrollmentStatus: enrollment.status,
      startsAt: enrollment.startsAt,
      endsAt: enrollment.endsAt,
      studentStatus: enrollment.student.status,
      studentBranchId: enrollment.student.branchId,
      classId: enrollment.classId,
      classGradeLevel: enrollment.class.gradeLevel,
      classBranchId: enrollment.class.branchId,
      classCohortId: enrollment.class.classCohortId,
    })),
  });
  const targetHash = fingerprint({
    preparationHash: isRecord(context.rollover.configuration)
      && isRecord(context.rollover.configuration.preparation)
      ? context.rollover.configuration.preparation.preparedHash
      : null,
    tasks: context.rollover.tasks.map(task => ({
      operationKey: task.operationKey,
      sourceEntityId: task.sourceEntityId,
      targetEntityId: task.targetEntityId,
      status: task.status,
    })),
    classes: context.targetClasses.map(targetClass => ({
      id: targetClass.id,
      academicTermId: targetClass.academicTermId,
      gradeLevel: targetClass.gradeLevel,
      branchId: targetClass.branchId,
      classCohortId: targetClass.classCohortId,
      cohortAcademicYearId: targetClass.classCohort?.academicYearId ?? null,
      predecessorCohortId: targetClass.classCohort?.predecessorCohortId ?? null,
    })),
  });
  const decisionHash = fingerprint(outcomes.map(outcome => ({
    studentId: outcome.studentId,
    sourceEnrollmentId: outcome.sourceEnrollmentId,
    action: outcome.action,
    targetClassId: outcome.targetClassId,
    reason: context.rollover.transitionType === TermRolloverType.WITHIN_YEAR
      ? AUTOMATIC_CARRY_FORWARD_REASON
      : normalizeReason(outcome.decision?.reason),
  })));
  const inputHash = fingerprint({
    rolloverId,
    transitionType: context.rollover.transitionType,
    sourceHash,
    targetHash,
    decisionHash,
  });
  const currentOutcomeHash = fingerprint({
    decisions: context.rollover.transitionDecisions.map(decision => ({
      id: decision.id,
      studentId: decision.studentId,
      sourceEnrollmentId: decision.sourceEnrollmentId,
      action: decision.action,
      targetClassId: decision.targetClassId,
      reason: normalizeReason(decision.reason),
    })),
    enrollments: context.targetEnrollments.map(enrollment => ({
      id: enrollment.id,
      studentId: enrollment.studentId,
      classId: enrollment.classId,
      status: enrollment.status,
      transitionAction: enrollment.transitionAction,
      sourceEnrollmentId: enrollment.sourceEnrollmentId,
    })),
  });

  const staging = getStagingMetadata(context.rollover.configuration);
  if (staging) {
    if (staging.sourceHash !== sourceHash) {
      issue(issues, 'STAGED_SOURCE_CHANGED', 'BLOCKER', 'Eligible source enrollment data changed after outcomes were staged');
    }
    if (staging.decisionHash !== decisionHash) {
      issue(issues, 'STAGED_DECISIONS_CHANGED', 'BLOCKER', 'Transition decisions changed after outcomes were staged');
    }
    if (staging.targetHash !== targetHash) {
      issue(issues, 'STAGED_TARGET_MAPPING_CHANGED', 'BLOCKER', 'Prepared target class mappings changed after outcomes were staged');
    }
    if (staging.outcomeHash !== currentOutcomeHash) {
      issue(issues, 'STAGED_OUTCOMES_CHANGED', 'BLOCKER', 'Staged target outcomes changed after their audit fingerprint was recorded');
    }
  }

  const staged = Boolean(
    staging
    && staging.sourceHash === sourceHash
    && staging.decisionHash === decisionHash
    && staging.targetHash === targetHash
    && staging.outcomeHash === currentOutcomeHash
    && completeOutcomeCount === eligible.length,
  );
  const blockers = issues.filter(item => item.severity === 'BLOCKER');
  const allTargetClasses = mergeTargetOptions(outcomes.flatMap(outcome => outcome.targetOptions));

  return {
    rolloverId,
    transitionType: context.rollover.transitionType,
    rolloverStatus: context.rollover.status,
    sourceTerm: {
      id: context.rollover.sourceTerm.id,
      name: context.rollover.sourceTerm.name,
      status: context.rollover.sourceTerm.status,
    },
    targetTerm: {
      id: context.rollover.targetTerm.id,
      name: context.rollover.targetTerm.name,
      status: context.rollover.targetTerm.status,
    },
    sourceHash,
    decisionHash,
    targetHash,
    inputHash,
    currentOutcomeHash,
    targetClasses: allTargetClasses,
    outcomes,
    summary: {
      eligibleCount: eligible.length,
      excludedCount: context.sourceEnrollments.length - eligible.length,
      decisionCount: context.rollover.transitionDecisions.length,
      missingDecisionCount,
      stagedEnrollmentCount,
      terminalOutcomeCount,
      completeOutcomeCount,
    },
    preparationValid,
    staging,
    staged,
    issues,
    canStage: context.rollover.status === TermRolloverStatus.PREPARED
      && preparationValid
      && blockers.length === 0,
    context,
  };
};

const publicPlan = (internal: InternalEnrollmentPlan): TermRolloverEnrollmentPlan => {
  const { context: _context, ...plan } = internal;
  return plan;
};

export const getTermRolloverEnrollmentPlan = async (
  rolloverId: string,
  client: EnrollmentClient = prisma,
): Promise<TermRolloverEnrollmentPlan> => publicPlan(
  await buildEnrollmentPlanInternal(client, rolloverId),
);

const normalizeDecisionInputs = (decisions: YearEndDecisionInput[]): NormalizedDecisionInput[] => {
  const seen = new Set<string>();
  return decisions.map(decision => {
    if (seen.has(decision.studentId)) {
      throw new TermRolloverEnrollmentError(
        'DUPLICATE_TRANSITION_DECISION',
        'Each eligible student can appear only once in a year-end decision set',
        400,
      );
    }
    seen.add(decision.studentId);
    if (!YEAR_END_ACTIONS.includes(decision.action)) {
      throw new TermRolloverEnrollmentError(
        'INVALID_TRANSITION_DECISION',
        'Year-end decisions must promote, retain, graduate, transfer, or withdraw',
        400,
      );
    }
    return {
      studentId: decision.studentId,
      action: decision.action,
      targetClassId: decision.targetClassId ?? null,
      reason: normalizeReason(decision.reason),
    };
  }).sort((left, right) => left.studentId.localeCompare(right.studentId));
};

const canonicalStoredDecisions = (context: EnrollmentContext) => context.rollover.transitionDecisions
  .map(decision => ({
    studentId: decision.studentId,
    action: decision.action,
    targetClassId: decision.targetClassId,
    reason: normalizeReason(decision.reason),
  }))
  .sort((left, right) => left.studentId.localeCompare(right.studentId));

export const saveYearEndTransitionDecisions = async (
  rolloverId: string,
  decisions: YearEndDecisionInput[],
  expectedInputHash: string,
  actorUserId: string,
) => runEnrollmentTransaction(async tx => {
  await lockRollover(tx, rolloverId);
  const plan = await buildEnrollmentPlanInternal(tx, rolloverId);
  if (plan.rolloverStatus !== TermRolloverStatus.PREPARED) {
    throw new TermRolloverEnrollmentError(
      'ROLLOVER_NOT_PREPARED',
      'Enrollment decisions are locked after readiness approval begins',
    );
  }
  if (plan.transitionType !== TermRolloverType.YEAR_END) {
    throw new TermRolloverEnrollmentError(
      'INVALID_TRANSITION_TYPE',
      'Within-year enrollment uses automatic same-cohort carry-forward decisions',
      400,
    );
  }
  if (plan.inputHash !== expectedInputHash) {
    throw new TermRolloverEnrollmentError(
      'STALE_ENROLLMENT_PLAN',
      'Enrollment or decision data changed after this review. Refresh before saving',
      409,
      { expectedInputHash, currentInputHash: plan.inputHash },
    );
  }
  if (!plan.preparationValid) {
    throw new TermRolloverEnrollmentError(
      'ENROLLMENT_STAGING_BLOCKED',
      'Prepared target setup must be valid before decisions can be saved',
      409,
      { issues: plan.issues },
    );
  }

  const normalized = normalizeDecisionInputs(decisions);
  const existingCanonical = canonicalStoredDecisions(plan.context);
  if (fingerprint(normalized) === fingerprint(existingCanonical)) {
    return { plan: publicPlan(plan), reused: true };
  }
  if (plan.staging) {
    throw new TermRolloverEnrollmentError(
      'ENROLLMENT_STAGING_LOCKED',
      'Staged outcomes are fingerprinted and cannot be edited in Phase 8',
    );
  }

  const eligibleByStudentId = new Map(
    plan.context.sourceEnrollments
      .filter(source => source.status === 'ACTIVE' && source.student.status === 'ACTIVE')
      .map(source => [source.studentId, source]),
  );
  for (const decision of normalized) {
    const source = eligibleByStudentId.get(decision.studentId);
    if (!source) {
      throw new TermRolloverEnrollmentError(
        'INVALID_TRANSITION_DECISION',
        `Student ${decision.studentId} is not eligible in the rollover source term`,
        400,
      );
    }
    const mappedTarget = mappedTargetForSourceClass(plan.context, source.classId);
    const validationIssues: RolloverEnrollmentIssue[] = [];
    validateEffectiveDecision(
      plan.context,
      source,
      decision.action,
      decision.targetClassId,
      mappedTarget,
      validationIssues,
    );
    if (validationIssues.some(item => item.severity === 'BLOCKER')) {
      throw new TermRolloverEnrollmentError(
        'INVALID_TRANSITION_DECISION',
        validationIssues[0].message,
        400,
        { issues: validationIssues },
      );
    }
  }

  const submittedStudentIds = normalized.map(decision => decision.studentId);
  await tx.studentTransitionDecision.deleteMany({
    where: {
      rolloverId,
      ...(submittedStudentIds.length > 0 ? { studentId: { notIn: submittedStudentIds } } : {}),
    },
  });
  for (const decision of normalized) {
    const source = eligibleByStudentId.get(decision.studentId) as SourceEnrollment;
    await tx.studentTransitionDecision.upsert({
      where: { rolloverId_studentId: { rolloverId, studentId: decision.studentId } },
      create: {
        rolloverId,
        studentId: decision.studentId,
        sourceEnrollmentId: source.id,
        targetClassId: decision.targetClassId,
        action: decision.action,
        reason: decision.reason,
        decidedByUserId: actorUserId,
      },
      update: {
        sourceEnrollmentId: source.id,
        targetClassId: decision.targetClassId,
        action: decision.action,
        reason: decision.reason,
        decidedByUserId: actorUserId,
      },
    });
  }

  await tx.termRollover.update({
    where: { id: rolloverId },
    data: { version: { increment: 1 } },
  });
  await appendRolloverEvent(tx, rolloverId, 'YEAR_END_DECISIONS_SAVED', actorUserId, {
    decisionCount: normalized.length,
    eligibleCount: eligibleByStudentId.size,
    complete: normalized.length === eligibleByStudentId.size,
  });

  return {
    plan: publicPlan(await buildEnrollmentPlanInternal(tx, rolloverId)),
    reused: false,
  };
});

export const stageTermRolloverEnrollments = async (
  rolloverId: string,
  expectedInputHash: string,
  actorUserId: string,
) => runEnrollmentTransaction(async tx => {
  await lockRollover(tx, rolloverId);
  const plan = await buildEnrollmentPlanInternal(tx, rolloverId);
  if (plan.rolloverStatus !== TermRolloverStatus.PREPARED) {
    throw new TermRolloverEnrollmentError(
      'ROLLOVER_NOT_PREPARED',
      'Enrollment staging is locked after readiness approval begins',
    );
  }
  if (plan.inputHash !== expectedInputHash) {
    throw new TermRolloverEnrollmentError(
      'STALE_ENROLLMENT_PLAN',
      'Enrollment or decision data changed after this review. Refresh before staging',
      409,
      { expectedInputHash, currentInputHash: plan.inputHash },
    );
  }
  if (plan.staged && plan.canStage) {
    await appendRolloverEvent(tx, rolloverId, 'ENROLLMENT_STAGING_REUSED', actorUserId, {
      inputHash: plan.inputHash,
      outcomeHash: plan.currentOutcomeHash,
      eligibleCount: plan.summary.eligibleCount,
    });
    return { plan: publicPlan(plan), reused: true };
  }
  if (plan.staging) {
    throw new TermRolloverEnrollmentError(
      'ENROLLMENT_STAGING_LOCKED',
      'Recorded staged outcomes changed and cannot be overwritten in Phase 8',
      409,
      { issues: plan.issues },
    );
  }
  if (!plan.canStage) {
    throw new TermRolloverEnrollmentError(
      'ENROLLMENT_STAGING_BLOCKED',
      'Enrollment staging is blocked by incomplete or invalid outcomes',
      409,
      { issues: plan.issues },
    );
  }

  await assertTermWriteAllowed(plan.context.rollover.targetTermId, 'SETUP', { client: tx });
  let enrollmentCount = 0;
  let terminalCount = 0;
  for (const outcome of plan.outcomes) {
    if (!outcome.action) continue;
    let decision = plan.context.rollover.transitionDecisions.find(item => item.studentId === outcome.studentId);
    if (!decision) {
      if (plan.transitionType !== TermRolloverType.WITHIN_YEAR
        || outcome.action !== StudentTransitionAction.CARRY_FORWARD
        || !outcome.targetClassId) {
        throw new TermRolloverEnrollmentError(
          'ENROLLMENT_STAGING_BLOCKED',
          `Transition decision is missing for ${outcome.studentName}`,
        );
      }
      decision = await tx.studentTransitionDecision.create({
        data: {
          rolloverId,
          studentId: outcome.studentId,
          sourceEnrollmentId: outcome.sourceEnrollmentId,
          targetClassId: outcome.targetClassId,
          action: outcome.action,
          reason: AUTOMATIC_CARRY_FORWARD_REASON,
          decidedByUserId: actorUserId,
        },
      });
    }

    if (isEnrollmentAction(decision.action)) {
      if (!decision.targetClassId) {
        throw new TermRolloverEnrollmentError(
          'ENROLLMENT_STAGING_BLOCKED',
          `Target class is missing for ${outcome.studentName}`,
        );
      }
      await upsertStudentPlacement(tx, {
        studentId: outcome.studentId,
        academicTermId: plan.context.rollover.targetTermId,
        classId: decision.targetClassId,
        status: 'STAGED',
        startsAt: plan.context.rollover.targetTerm.startDate,
        sourceEnrollmentId: outcome.sourceEnrollmentId,
        transitionAction: decision.action,
        notes: decision.reason,
        changedByUserId: actorUserId,
      });
      enrollmentCount += 1;
    } else {
      terminalCount += 1;
    }
  }

  const refreshed = await buildEnrollmentPlanInternal(tx, rolloverId);
  if (refreshed.summary.completeOutcomeCount !== refreshed.summary.eligibleCount
    || refreshed.issues.some(item => item.severity === 'BLOCKER')) {
    throw new TermRolloverEnrollmentError(
      'ENROLLMENT_STAGING_BLOCKED',
      'Staged outcomes did not reconcile to every eligible source enrollment',
      409,
      { issues: refreshed.issues },
    );
  }
  const metadata: EnrollmentStagingMetadata = {
    sourceHash: refreshed.sourceHash,
    decisionHash: refreshed.decisionHash,
    targetHash: refreshed.targetHash,
    reviewedInputHash: expectedInputHash,
    outcomeHash: refreshed.currentOutcomeHash,
    stagedAt: new Date().toISOString(),
    stagedByUserId: actorUserId,
    eligibleCount: refreshed.summary.eligibleCount,
    enrollmentCount,
    terminalCount,
  };
  const nextConfiguration = configurationRecord(refreshed.context.rollover.configuration);
  nextConfiguration.enrollmentStaging = metadata;
  await tx.termRollover.update({
    where: { id: rolloverId },
    data: {
      configuration: nextConfiguration as Prisma.InputJsonValue,
      version: { increment: 1 },
      failureCode: null,
      failureMessage: null,
    },
  });
  await appendRolloverEvent(tx, rolloverId, 'ENROLLMENT_OUTCOMES_STAGED', actorUserId, {
    inputHash: expectedInputHash,
    outcomeHash: metadata.outcomeHash,
    eligibleCount: metadata.eligibleCount,
    enrollmentCount,
    terminalCount,
  });

  return {
    plan: publicPlan(await buildEnrollmentPlanInternal(tx, rolloverId)),
    reused: false,
  };
});

export const validateTermRolloverEnrollments = async (
  rolloverId: string,
  client: EnrollmentClient = prisma,
) => {
  const plan = await getTermRolloverEnrollmentPlan(rolloverId, client);
  return {
    rolloverId,
    staged: plan.staged,
    sourceChanged: plan.issues.some(item => item.code === 'STAGED_SOURCE_CHANGED'),
    decisionsChanged: plan.issues.some(item => item.code === 'STAGED_DECISIONS_CHANGED'),
    targetMappingsChanged: plan.issues.some(item => item.code === 'STAGED_TARGET_MAPPING_CHANGED'),
    outcomesChanged: plan.issues.some(item => item.code === 'STAGED_OUTCOMES_CHANGED'),
    summary: plan.summary,
    staging: plan.staging,
    issues: plan.issues,
    valid: plan.staged && !plan.issues.some(item => item.severity === 'BLOCKER'),
  };
};
