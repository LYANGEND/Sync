import { Prisma, StudentTermReportStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { runTermWriteTransaction } from './termLifecycleService';
import {
  buildReportSnapshot,
  ReportLifecycleError,
} from './reportFinalizationService';

export type ReportAmendmentEntityType = 'TERM_RESULT' | 'STUDENT_TERM_REPORT';

export interface ReportAmendmentItemInput {
  entityType: ReportAmendmentEntityType;
  entityId: string;
  fieldName: string;
  afterValue: string | number | null;
}

const TERM_RESULT_FIELDS = new Set(['totalScore', 'grade', 'remarks']);
const REPORT_FIELDS = new Set([
  'classTeacherRemark',
  'principalRemark',
  'totalAttendance',
  'totalDays',
]);

const lockReportAmendment = async (
  tx: Prisma.TransactionClient,
  amendmentId: string,
) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sync:report-amendment:${amendmentId}`}))`;
};

const jsonInput = (value: string | number | null) => (
  value === null ? Prisma.JsonNull : value
);

const normalizeStoredValue = (
  entityType: ReportAmendmentEntityType,
  fieldName: string,
  value: unknown,
): string | number | null => {
  if (value === null || value === undefined) return null;
  if (entityType === 'TERM_RESULT' && fieldName === 'totalScore') return Number(value);
  return value as string | number;
};

const assertAllowedValue = (item: ReportAmendmentItemInput) => {
  const allowedFields = item.entityType === 'TERM_RESULT' ? TERM_RESULT_FIELDS : REPORT_FIELDS;
  if (!allowedFields.has(item.fieldName)) {
    throw new ReportLifecycleError(
      'AMENDMENT_FIELD_NOT_ALLOWED',
      `${item.entityType}.${item.fieldName} cannot be amended`,
      400,
    );
  }

  if (item.fieldName === 'totalScore') {
    if (typeof item.afterValue !== 'number'
      || !Number.isFinite(item.afterValue)
      || item.afterValue < 0
      || item.afterValue > 100) {
      throw new ReportLifecycleError(
        'INVALID_AMENDMENT_VALUE',
        'Term result totalScore must be a number from 0 to 100',
        400,
      );
    }
    return;
  }
  if (item.fieldName === 'totalAttendance' || item.fieldName === 'totalDays') {
    if (typeof item.afterValue !== 'number'
      || !Number.isInteger(item.afterValue)
      || item.afterValue < 0) {
      throw new ReportLifecycleError(
        'INVALID_AMENDMENT_VALUE',
        `${item.fieldName} must be a non-negative whole number`,
        400,
      );
    }
    return;
  }
  if (item.afterValue !== null && typeof item.afterValue !== 'string') {
    throw new ReportLifecycleError(
      'INVALID_AMENDMENT_VALUE',
      `${item.fieldName} must be text or null`,
      400,
    );
  }
  if (typeof item.afterValue === 'string' && item.afterValue.length > 2000) {
    throw new ReportLifecycleError(
      'INVALID_AMENDMENT_VALUE',
      `${item.fieldName} is too long`,
      400,
    );
  }
};

const resolveAmendmentTarget = async (
  client: Prisma.TransactionClient | typeof prisma,
  termId: string,
  item: ReportAmendmentItemInput,
) => {
  assertAllowedValue(item);
  if (item.entityType === 'TERM_RESULT') {
    const result = await client.termResult.findUnique({
      where: { id: item.entityId },
      select: {
        id: true,
        studentId: true,
        termId: true,
        totalScore: true,
        grade: true,
        remarks: true,
      },
    });
    if (!result || result.termId !== termId) {
      throw new ReportLifecycleError(
        'AMENDMENT_TARGET_NOT_FOUND',
        'Term result does not belong to the selected academic term',
        404,
      );
    }
    const report = await client.studentTermReport.findUnique({
      where: { studentId_termId: { studentId: result.studentId, termId } },
      select: { id: true, status: true },
    });
    if (!report || report.status === StudentTermReportStatus.DRAFT) {
      throw new ReportLifecycleError(
        'REPORT_NOT_FINALIZED',
        'Only data represented by a finalized report can be amended',
      );
    }
    return {
      reportId: report.id,
      beforeValue: normalizeStoredValue(item.entityType, item.fieldName, result[item.fieldName as keyof typeof result]),
    };
  }

  const report = await client.studentTermReport.findUnique({
    where: { id: item.entityId },
    select: {
      id: true,
      termId: true,
      status: true,
      classTeacherRemark: true,
      principalRemark: true,
      totalAttendance: true,
      totalDays: true,
    },
  });
  if (!report || report.termId !== termId) {
    throw new ReportLifecycleError(
      'AMENDMENT_TARGET_NOT_FOUND',
      'Student report does not belong to the selected academic term',
      404,
    );
  }
  if (report.status === StudentTermReportStatus.DRAFT) {
    throw new ReportLifecycleError(
      'REPORT_NOT_FINALIZED',
      'Draft reports do not require a historical amendment',
    );
  }
  return {
    reportId: report.id,
    beforeValue: normalizeStoredValue(item.entityType, item.fieldName, report[item.fieldName as keyof typeof report]),
  };
};

export const createReportAmendment = async (
  termId: string,
  reason: string,
  requestedByUserId: string,
  items: ReportAmendmentItemInput[],
) => {
  const normalizedReason = reason.trim();
  if (normalizedReason.length < 10 || normalizedReason.length > 2000) {
    throw new ReportLifecycleError(
      'INVALID_AMENDMENT_REASON',
      'An amendment reason must contain between 10 and 2000 characters',
      400,
    );
  }
  if (items.length < 1 || items.length > 50) {
    throw new ReportLifecycleError(
      'INVALID_AMENDMENT_ITEMS',
      'An amendment must contain between 1 and 50 exact changes',
      400,
    );
  }

  const term = await prisma.academicTerm.findUnique({
    where: { id: termId },
    select: { status: true },
  });
  if (!term) throw new ReportLifecycleError('TERM_NOT_FOUND', 'Academic term not found', 404);
  if (term.status !== 'CLOSED') {
    throw new ReportLifecycleError(
      'TERM_NOT_CLOSED',
      'Historical amendments can only be requested after the academic term is closed',
    );
  }

  const uniqueTargets = new Set(items.map(item => `${item.entityType}:${item.entityId}:${item.fieldName}`));
  if (uniqueTargets.size !== items.length) {
    throw new ReportLifecycleError(
      'DUPLICATE_AMENDMENT_ITEM',
      'An amendment can only change each field once',
      400,
    );
  }

  const resolvedItems = [];
  for (const item of items) {
    const target = await resolveAmendmentTarget(prisma, termId, item);
    if (JSON.stringify(target.beforeValue) === JSON.stringify(item.afterValue)) {
      throw new ReportLifecycleError(
        'AMENDMENT_HAS_NO_CHANGE',
        'Every amendment item must change its target value',
        400,
      );
    }
    resolvedItems.push({ item, target });
  }

  return prisma.closedTermAmendment.create({
    data: {
      academicTermId: termId,
      reason: normalizedReason,
      requestedByUserId,
      items: {
        create: resolvedItems.map(({ item, target }) => ({
          entityType: item.entityType,
          entityId: item.entityId,
          fieldName: item.fieldName,
          beforeValue: jsonInput(target.beforeValue),
          afterValue: jsonInput(item.afterValue),
        })),
      },
    },
    include: { items: true },
  });
};

export const listReportAmendments = async (termId: string) => (
  prisma.closedTermAmendment.findMany({
    where: { academicTermId: termId },
    include: { items: { orderBy: { createdAt: 'asc' } } },
    orderBy: { requestedAt: 'desc' },
  })
);

export const approveReportAmendment = async (
  amendmentId: string,
  approvedByUserId: string,
) => prisma.$transaction(async tx => {
  await lockReportAmendment(tx, amendmentId);
  const amendment = await tx.closedTermAmendment.findUnique({ where: { id: amendmentId } });
  if (!amendment) throw new ReportLifecycleError('AMENDMENT_NOT_FOUND', 'Amendment not found', 404);
  if (amendment.status === 'APPROVED' || amendment.status === 'APPLIED') return amendment;
  if (amendment.status !== 'REQUESTED') {
    throw new ReportLifecycleError('AMENDMENT_NOT_REQUESTED', 'Only requested amendments can be approved');
  }
  if (amendment.requestedByUserId === approvedByUserId) {
    throw new ReportLifecycleError(
      'AMENDMENT_SELF_APPROVAL_FORBIDDEN',
      'The requester cannot approve the same historical amendment',
      403,
    );
  }
  return tx.closedTermAmendment.update({
    where: { id: amendmentId },
    data: {
      status: 'APPROVED',
      approvedByUserId,
      approvedAt: new Date(),
      rejectedByUserId: null,
      rejectedAt: null,
    },
  });
});

export const rejectReportAmendment = async (
  amendmentId: string,
  rejectedByUserId: string,
) => prisma.$transaction(async tx => {
  await lockReportAmendment(tx, amendmentId);
  const amendment = await tx.closedTermAmendment.findUnique({ where: { id: amendmentId } });
  if (!amendment) throw new ReportLifecycleError('AMENDMENT_NOT_FOUND', 'Amendment not found', 404);
  if (amendment.status === 'REJECTED') return amendment;
  if (amendment.status !== 'REQUESTED') {
    throw new ReportLifecycleError('AMENDMENT_NOT_REQUESTED', 'Only requested amendments can be rejected');
  }
  return tx.closedTermAmendment.update({
    where: { id: amendmentId },
    data: {
      status: 'REJECTED',
      rejectedByUserId,
      rejectedAt: new Date(),
    },
  });
});

const storedJsonValue = (value: Prisma.JsonValue | null): string | number | null => {
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  throw new ReportLifecycleError(
    'INVALID_AMENDMENT_VALUE',
    'Amendment values must be text, numbers, or null',
    400,
  );
};

export const applyReportAmendment = async (
  amendmentId: string,
  appliedByUserId: string,
) => {
  const existing = await prisma.closedTermAmendment.findUnique({
    where: { id: amendmentId },
    include: { items: true },
  });
  if (!existing) throw new ReportLifecycleError('AMENDMENT_NOT_FOUND', 'Amendment not found', 404);
  if (existing.status === 'APPLIED') return existing;
  if (existing.status !== 'APPROVED') {
    throw new ReportLifecycleError(
      'AMENDMENT_NOT_APPROVED',
      'The amendment must be approved before it is applied',
    );
  }

  return runTermWriteTransaction(
    existing.academicTermId,
    'HISTORICAL_AMENDMENT',
    async tx => {
      await lockReportAmendment(tx, amendmentId);
      const amendment = await tx.closedTermAmendment.findUnique({
        where: { id: amendmentId },
        include: { items: { orderBy: { createdAt: 'asc' } } },
      });
      if (!amendment) throw new ReportLifecycleError('AMENDMENT_NOT_FOUND', 'Amendment not found', 404);
      if (amendment.status === 'APPLIED') return amendment;
      if (amendment.status !== 'APPROVED') {
        throw new ReportLifecycleError('AMENDMENT_NOT_APPROVED', 'The amendment must be approved before it is applied');
      }

      await tx.$queryRaw`SELECT set_config('sync.approved_report_amendment_id', ${amendmentId}, true)`;

      const reportUpdates = new Map<string, Record<string, string | number | null>>();
      const resultUpdates: Array<{
        id: string;
        fieldName: string;
        afterValue: string | number | null;
        reportId: string;
      }> = [];

      for (const storedItem of amendment.items) {
        const item: ReportAmendmentItemInput = {
          entityType: storedItem.entityType as ReportAmendmentEntityType,
          entityId: storedItem.entityId,
          fieldName: storedItem.fieldName || '',
          afterValue: storedJsonValue(storedItem.afterValue),
        };
        const target = await resolveAmendmentTarget(tx, amendment.academicTermId, item);
        const expectedBefore = storedJsonValue(storedItem.beforeValue);
        if (JSON.stringify(target.beforeValue) !== JSON.stringify(expectedBefore)) {
          throw new ReportLifecycleError(
            'AMENDMENT_TARGET_CHANGED',
            'The amendment target changed after the request was created; submit a new request',
          );
        }

        if (item.entityType === 'TERM_RESULT') {
          resultUpdates.push({
            id: item.entityId,
            fieldName: item.fieldName,
            afterValue: item.afterValue,
            reportId: target.reportId,
          });
        } else {
          const updates = reportUpdates.get(target.reportId) ?? {};
          updates[item.fieldName] = item.afterValue;
          reportUpdates.set(target.reportId, updates);
        }
      }

      for (const update of resultUpdates) {
        await tx.termResult.update({
          where: { id: update.id },
          data: { [update.fieldName]: update.afterValue } as Prisma.TermResultUpdateInput,
        });
        if (!reportUpdates.has(update.reportId)) reportUpdates.set(update.reportId, {});
      }

      const appliedAt = new Date();
      for (const [reportId, fields] of reportUpdates) {
        const current = await tx.studentTermReport.findUniqueOrThrow({ where: { id: reportId } });
        const nextAttendance = fields.totalAttendance === undefined
          ? (current.totalAttendance ?? 0)
          : Number(fields.totalAttendance);
        const nextDays = fields.totalDays === undefined
          ? (current.totalDays ?? 0)
          : Number(fields.totalDays);
        if (nextAttendance > nextDays) {
          throw new ReportLifecycleError(
            'INVALID_AMENDMENT_VALUE',
            'Total attendance cannot exceed total instructional days',
            400,
          );
        }

        const updated = await tx.studentTermReport.update({
          where: { id: reportId },
          data: {
            ...fields,
            currentVersion: { increment: 1 },
          },
        });
        const snapshot = await buildReportSnapshot(reportId, tx);
        await tx.studentTermReportVersion.create({
          data: {
            reportId,
            version: updated.currentVersion,
            status: updated.status,
            snapshot: snapshot as unknown as Prisma.InputJsonValue,
            reason: `Approved amendment: ${amendment.reason}`,
            createdByUserId: appliedByUserId,
          },
        });
      }

      await tx.closedTermAmendmentItem.updateMany({
        where: { amendmentId },
        data: { appliedAt },
      });
      return tx.closedTermAmendment.update({
        where: { id: amendmentId },
        data: {
          status: 'APPLIED',
          appliedByUserId,
          appliedAt,
        },
        include: { items: true },
      });
    },
    { approvedAmendmentId: amendmentId },
  );
};
