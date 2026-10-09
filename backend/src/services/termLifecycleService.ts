import { AcademicTerm, AcademicTermStatus, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import {
  canTransitionTerm,
  canWriteToTerm,
  TermWriteCategory,
} from '../utils/termLifecycleRules';

type LifecycleClient = Prisma.TransactionClient | typeof prisma;
type LifecycleOperation<T> = (tx: Prisma.TransactionClient) => Promise<T>;

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export type TermLifecycleErrorCode =
  | 'TERM_NOT_FOUND'
  | 'INVALID_TERM_DATES'
  | 'ACTIVE_TERM_EXISTS'
  | 'TERM_CLOSING_IN_PROGRESS'
  | 'INVALID_TERM_TRANSITION'
  | 'TERM_WRITE_NOT_ALLOWED'
  | 'STALE_TERM_VERSION'
  | 'TERM_CLOSE_SNAPSHOT_REQUIRED'
  | 'TERM_LIFECYCLE_CONFLICT';

export class TermLifecycleError extends Error {
  constructor(
    public readonly code: TermLifecycleErrorCode,
    message: string,
    public readonly statusCode: number = 409,
  ) {
    super(message);
    this.name = 'TermLifecycleError';
  }
}

const lockLifecycle = async (tx: Prisma.TransactionClient) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sync:academic-term-lifecycle'))`;
};

const hasPrismaCode = (error: unknown, code: string): boolean => (
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
);

const isActiveTermUniquenessError = (error: unknown): boolean => {
  if (!hasPrismaCode(error, 'P2002')) return false;

  const knownError = error as Prisma.PrismaClientKnownRequestError;
  return JSON.stringify(knownError.meta ?? {}).includes('academic_terms_one_active_idx')
    || knownError.message.includes('academic_terms_one_active_idx');
};

export const runTermLifecycleTransaction = async <T>(
  operation: LifecycleOperation<T>,
): Promise<T> => {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (hasPrismaCode(error, 'P2034') && attempt < MAX_SERIALIZABLE_ATTEMPTS) {
        continue;
      }
      if (isActiveTermUniquenessError(error)) {
        throw new TermLifecycleError(
          'ACTIVE_TERM_EXISTS',
          'Another academic term is already active',
        );
      }
      if (hasPrismaCode(error, 'P2034')) {
        throw new TermLifecycleError(
          'TERM_LIFECYCLE_CONFLICT',
          'The academic term changed concurrently. Refresh and try again',
        );
      }
      throw error;
    }
  }

  throw new TermLifecycleError(
    'TERM_LIFECYCLE_CONFLICT',
    'The academic term changed concurrently. Refresh and try again',
  );
};

const assertExpectedVersion = (term: AcademicTerm, expectedVersion?: number) => {
  if (expectedVersion !== undefined && term.version !== expectedVersion) {
    throw new TermLifecycleError(
      'STALE_TERM_VERSION',
      `Academic term version ${expectedVersion} is stale; current version is ${term.version}`,
    );
  }
};

const assertValidTermDates = (startDate: Date, endDate: Date) => {
  if (!Number.isFinite(startDate.getTime())
    || !Number.isFinite(endDate.getTime())
    || endDate <= startDate) {
    throw new TermLifecycleError(
      'INVALID_TERM_DATES',
      'Academic term end date must be after its start date',
      400,
    );
  }
};

const setCurrentTerm = async (
  tx: Prisma.TransactionClient,
  termId: string,
  createSettingsIfMissing = true,
) => {
  const settings = await tx.schoolSettings.findFirst({ select: { id: true } });
  if (settings) {
    await tx.schoolSettings.update({
      where: { id: settings.id },
      data: { currentTermId: termId },
    });
  } else if (createSettingsIfMissing) {
    await tx.schoolSettings.create({ data: { currentTermId: termId } });
  }
};

const clearCurrentTerm = async (tx: Prisma.TransactionClient, termId: string) => {
  await tx.schoolSettings.updateMany({
    where: { currentTermId: termId },
    data: { currentTermId: null },
  });
};

export const getActiveTerm = async (client: LifecycleClient = prisma): Promise<AcademicTerm | null> => (
  client.academicTerm.findFirst({ where: { status: AcademicTermStatus.ACTIVE } })
);

export interface CreateTermInput {
  name: string;
  startDate: Date;
  endDate: Date;
  activate?: boolean;
  academicYearId?: string | null;
  sequence?: number | null;
}

export interface UpdateTermInput {
  name: string;
  startDate: Date;
  endDate: Date;
  isActive?: boolean;
  expectedVersion?: number;
}

interface ActivateTermOptions {
  expectedVersion?: number;
  createSettingsIfMissing?: boolean;
}

export const activateTermInTransaction = async (
  tx: Prisma.TransactionClient,
  termId: string,
  options: ActivateTermOptions = {},
): Promise<AcademicTerm> => {
  await lockLifecycle(tx);

  const target = await tx.academicTerm.findUnique({ where: { id: termId } });
  if (!target) {
    throw new TermLifecycleError('TERM_NOT_FOUND', 'Academic term not found', 404);
  }
  assertExpectedVersion(target, options.expectedVersion);

  if (target.status === AcademicTermStatus.ACTIVE) {
    await setCurrentTerm(tx, termId, options.createSettingsIfMissing);
    return target;
  }
  if (!canTransitionTerm(target.status, AcademicTermStatus.ACTIVE)) {
    throw new TermLifecycleError(
      'INVALID_TERM_TRANSITION',
      `Academic term cannot transition from ${target.status} to ACTIVE`,
    );
  }

  const conflictingTerm = await tx.academicTerm.findFirst({
    where: {
      status: { in: [AcademicTermStatus.ACTIVE, AcademicTermStatus.CLOSING] },
      id: { not: termId },
    },
    select: { status: true },
  });
  if (conflictingTerm?.status === AcademicTermStatus.ACTIVE) {
    throw new TermLifecycleError(
      'ACTIVE_TERM_EXISTS',
      'The active academic term must enter closing and close before another term is activated',
    );
  }
  if (conflictingTerm?.status === AcademicTermStatus.CLOSING) {
    throw new TermLifecycleError(
      'TERM_CLOSING_IN_PROGRESS',
      'The closing academic term must close before another term is activated',
    );
  }

  const activatedAt = target.activatedAt ?? new Date();
  const updated = await tx.academicTerm.update({
    where: { id: termId },
    data: {
      status: AcademicTermStatus.ACTIVE,
      isActive: true,
      activatedAt,
      closingStartedAt: null,
      closedAt: null,
      closedByUserId: null,
      version: { increment: 1 },
    },
  });

  await setCurrentTerm(tx, termId, options.createSettingsIfMissing);

  return updated;
};

export const activateTerm = async (
  termId: string,
  expectedVersion?: number,
): Promise<AcademicTerm> => (
  runTermLifecycleTransaction(tx => activateTermInTransaction(tx, termId, { expectedVersion }))
);

export const createTerm = async (input: CreateTermInput): Promise<AcademicTerm> => (
  runTermLifecycleTransaction(async tx => {
    assertValidTermDates(input.startDate, input.endDate);
    await lockLifecycle(tx);
    const created = await tx.academicTerm.create({
      data: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        academicYearId: input.academicYearId,
        sequence: input.sequence,
        status: AcademicTermStatus.DRAFT,
        isActive: false,
      },
    });

    return input.activate
      ? activateTermInTransaction(tx, created.id)
      : created;
  })
);

export const updateTerm = async (
  termId: string,
  input: UpdateTermInput,
): Promise<AcademicTerm> => (
  runTermLifecycleTransaction(async tx => {
    assertValidTermDates(input.startDate, input.endDate);
    await lockLifecycle(tx);
    const current = await tx.academicTerm.findUnique({ where: { id: termId } });
    if (!current) {
      throw new TermLifecycleError('TERM_NOT_FOUND', 'Academic term not found', 404);
    }
    assertExpectedVersion(current, input.expectedVersion);

    if (current.status === AcademicTermStatus.CLOSED) {
      throw new TermLifecycleError(
        'TERM_WRITE_NOT_ALLOWED',
        'Closed academic term details cannot be edited outside an approved amendment',
      );
    }
    if (input.isActive === false && current.status === AcademicTermStatus.ACTIVE) {
      throw new TermLifecycleError(
        'INVALID_TERM_TRANSITION',
        'An active term cannot be deactivated directly. Start the closing workflow instead',
      );
    }

    const updated = await tx.academicTerm.update({
      where: { id: termId },
      data: {
        name: input.name,
        startDate: input.startDate,
        endDate: input.endDate,
        version: { increment: 1 },
      },
    });

    return input.isActive
      ? activateTermInTransaction(tx, termId)
      : updated;
  })
);

export const beginClosingTermInTransaction = async (
  tx: Prisma.TransactionClient,
  termId: string,
  expectedVersion?: number,
): Promise<AcademicTerm> => {
  await lockLifecycle(tx);
  const target = await tx.academicTerm.findUnique({ where: { id: termId } });
  if (!target) {
    throw new TermLifecycleError('TERM_NOT_FOUND', 'Academic term not found', 404);
  }
  assertExpectedVersion(target, expectedVersion);

  if (target.status === AcademicTermStatus.CLOSING) {
    await clearCurrentTerm(tx, termId);
    return target;
  }
  if (!canTransitionTerm(target.status, AcademicTermStatus.CLOSING)) {
    throw new TermLifecycleError(
      'INVALID_TERM_TRANSITION',
      `Academic term cannot transition from ${target.status} to CLOSING`,
    );
  }

  const updated = await tx.academicTerm.update({
    where: { id: termId },
    data: {
      status: AcademicTermStatus.CLOSING,
      isActive: false,
      closingStartedAt: target.closingStartedAt ?? new Date(),
      version: { increment: 1 },
    },
  });
  await clearCurrentTerm(tx, termId);
  return updated;
};

export const beginClosingTerm = async (
  termId: string,
  expectedVersion?: number,
): Promise<AcademicTerm> => (
  runTermLifecycleTransaction(tx => beginClosingTermInTransaction(tx, termId, expectedVersion))
);

export const closeTermInTransaction = async (
  tx: Prisma.TransactionClient,
  termId: string,
  actorUserId: string,
  expectedVersion?: number,
): Promise<AcademicTerm> => {
  await lockLifecycle(tx);
  const target = await tx.academicTerm.findUnique({ where: { id: termId } });
  if (!target) {
    throw new TermLifecycleError('TERM_NOT_FOUND', 'Academic term not found', 404);
  }
  assertExpectedVersion(target, expectedVersion);

  if (target.status === AcademicTermStatus.CLOSED) return target;
  if (!canTransitionTerm(target.status, AcademicTermStatus.CLOSED)) {
    throw new TermLifecycleError(
      'INVALID_TERM_TRANSITION',
      `Academic term cannot transition from ${target.status} to CLOSED`,
    );
  }

  const snapshot = await tx.termCloseSnapshot.findUnique({
    where: { academicTermId: termId },
    select: { id: true },
  });
  if (!snapshot) {
    throw new TermLifecycleError(
      'TERM_CLOSE_SNAPSHOT_REQUIRED',
      'A checksum-verified close snapshot is required before the term can close',
    );
  }

  const updated = await tx.academicTerm.update({
    where: { id: termId },
    data: {
      status: AcademicTermStatus.CLOSED,
      isActive: false,
      closedAt: new Date(),
      closedByUserId: actorUserId,
      version: { increment: 1 },
    },
  });
  await clearCurrentTerm(tx, termId);
  return updated;
};

export const deleteDraftTerm = async (termId: string): Promise<void> => {
  await runTermLifecycleTransaction(async tx => {
    await lockLifecycle(tx);
    const target = await tx.academicTerm.findUnique({ where: { id: termId } });
    if (!target) {
      throw new TermLifecycleError('TERM_NOT_FOUND', 'Academic term not found', 404);
    }
    if (target.status !== AcademicTermStatus.DRAFT) {
      throw new TermLifecycleError(
        'TERM_WRITE_NOT_ALLOWED',
        'Only draft academic terms can be deleted',
      );
    }
    await tx.academicTerm.delete({ where: { id: termId } });
  });
};

export const assertTermWriteAllowed = async (
  academicTermId: string,
  category: TermWriteCategory,
  options: { approvedAmendmentId?: string; client?: LifecycleClient } = {},
): Promise<AcademicTerm> => {
  const client = options.client ?? prisma;
  const term = await client.academicTerm.findUnique({ where: { id: academicTermId } });
  if (!term) {
    throw new TermLifecycleError('TERM_NOT_FOUND', 'Academic term not found', 404);
  }

  let hasApprovedAmendment = false;
  if (category === 'HISTORICAL_AMENDMENT' && options.approvedAmendmentId) {
    hasApprovedAmendment = Boolean(await client.closedTermAmendment.findFirst({
      where: {
        id: options.approvedAmendmentId,
        academicTermId,
        status: 'APPROVED',
      },
      select: { id: true },
    }));
  }

  if (!canWriteToTerm(term.status, category, hasApprovedAmendment)) {
    throw new TermLifecycleError(
      'TERM_WRITE_NOT_ALLOWED',
      `${category.replace(/_/g, ' ').toLowerCase()} is not allowed while the term is ${term.status}`,
    );
  }

  return term;
};

export const runTermWriteTransaction = async <T>(
  academicTermId: string,
  category: TermWriteCategory,
  operation: LifecycleOperation<T>,
  options: { approvedAmendmentId?: string } = {},
): Promise<T> => (
  runTermLifecycleTransaction(async tx => {
    await lockLifecycle(tx);
    await assertTermWriteAllowed(academicTermId, category, {
      approvedAmendmentId: options.approvedAmendmentId,
      client: tx,
    });
    return operation(tx);
  })
);

