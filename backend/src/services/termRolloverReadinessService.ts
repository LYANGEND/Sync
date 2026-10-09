import { Prisma, TermRollover, TermRolloverStatus } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { createReportSnapshotChecksum, verifyReportSnapshotIntegrity } from '../utils/reportSnapshotIntegrity';
import { validateTermRolloverPreparation } from './termRolloverPreparationService';
import { validateTermRolloverEnrollments } from './termRolloverEnrollmentService';
import { getStudentReportReadiness } from './reportFinalizationService';
import { buildFinanceSettlementReconciliationPlan } from './financeSettlementReconciliationService';
import {
  backupSha256, captureRolloverDatabase, DatabaseTableSnapshot,
  getRolloverBackupStore, rolloverSchemaManifest,
} from './termRolloverBackupStoreService';

export type ReadinessIssue = {
  id: string; code: string; severity: 'BLOCKER' | 'WARNING'; message: string;
  affectedRecords: Array<{ entityType: string; entityId: string }>;
  remediationLink: string;
};
export type RolloverReadinessDTO = {
  rolloverId: string; fingerprint: string; warningHash: string;
  summary: { blockerCount: number; warningCount: number }; issues: ReadinessIssue[];
  evidence: {
    current: boolean; warningsAcknowledged: boolean; backupVerified: boolean; approved: boolean;
    backupReference?: string; backupChecksum?: string; backupVerifiedAt?: string;
  };
  canApprove: boolean;
};
export class TermRolloverReadinessError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) { super(message); }
}
type Snapshot = Pick<RolloverReadinessDTO, 'rolloverId' | 'fingerprint' | 'warningHash' | 'summary' | 'issues'>;
type Acknowledgement = { warningId: string; reason: string };
type Operation = 'preflight' | 'acknowledge' | 'backup' | 'verify' | 'approve';
const hash = createReportSnapshotChecksum;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));

const clearedApproval = { approvedFingerprint: null, approvedByUserId: null, approvedAt: null };
const clearedBackup = {
  backupReference: null, backupChecksum: null, backupFingerprint: null, backupSizeBytes: null,
  backupManifest: Prisma.DbNull, backupCreatedAt: null, backupVerifiedAt: null, backupVerifiedByUserId: null,
};
const clearedEvidence = {
  ...clearedApproval, ...clearedBackup, warningAcknowledgements: Prisma.DbNull,
  warningAcknowledgementHash: null, warningAcknowledgedFingerprint: null,
  warningAcknowledgedByUserId: null, warningAcknowledgedAt: null,
};

async function lock(tx: Prisma.TransactionClient, id: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sync:term-rollover:${id}`}))`;
}
async function event(tx: Prisma.TransactionClient, id: string, type: string, actor: string | null, payload: unknown) {
  const previous = await tx.termRolloverEvent.aggregate({ where: { rolloverId: id }, _max: { sequence: true } });
  await tx.termRolloverEvent.create({ data: {
    rolloverId: id, sequence: (previous._max.sequence ?? 0) + 1, type, actorUserId: actor, payload: json(payload),
  } });
}

/** Conservative full-application fingerprint. Evidence/events and evidence-only
 * rollover timestamps/status transitions are omitted, never academic/finance data.
 * Unrelated application changes intentionally invalidate evidence as a safety bias.
 */
export function rolloverDomainFingerprint(tables: DatabaseTableSnapshot[]): string {
  const excluded = new Set([
    'preflightHash', 'preflightSnapshot', 'preflightGeneratedAt', 'warningHash',
    'warningAcknowledgements', 'warningAcknowledgementHash', 'warningAcknowledgedFingerprint',
    'warningAcknowledgedByUserId', 'warningAcknowledgedAt', 'backupReference', 'backupChecksum',
    'backupFingerprint', 'backupSizeBytes', 'backupManifest', 'backupCreatedAt', 'backupVerifiedAt',
    'backupVerifiedByUserId', 'approvedFingerprint', 'approvedByUserId', 'approvedAt', 'updatedAt', 'version',
  ]);
  return hash(tables.filter(table => table.table !== 'term_rollover_events').map(table => ({
    table: table.table,
    rows: table.table === 'term_rollovers' ? table.rows.map(text => {
      const row = JSON.parse(text) as Record<string, unknown>;
      for (const key of excluded) delete row[key];
      if (row.status === 'READY') row.status = 'PREPARED';
      return JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))));
    }).sort() : [...table.rows].sort(),
  })).sort((a, b) => a.table.localeCompare(b.table)));
}

async function evaluate(tx: Prisma.TransactionClient, rollover: TermRollover, tables: DatabaseTableSnapshot[]): Promise<Snapshot> {
  const issues: ReadinessIssue[] = [];
  const add = (code: string, severity: 'BLOCKER' | 'WARNING', message: string, entityType = 'TermRollover', entityId = rollover.id, section = 'term-preparation') => {
    const affectedRecords = [{ entityType, entityId }];
    const id = hash({ code, severity, affectedRecords });
    const remediationLink = section === 'finance' ? '/finance'
      : section === 'report-readiness' ? '/academics/report-cards'
        : `/academics?tab=${section}&rolloverId=${rollover.id}`;
    if (!issues.some(item => item.id === id)) issues.push({ id, code, severity, message, affectedRecords, remediationLink });
  };
  const terms = await tx.academicTerm.findMany({ where: { id: { in: [rollover.sourceTermId, rollover.targetTermId] } } });
  if (rollover.warningAcknowledgedFingerprint) {
    const acknowledgementEvent = await tx.termRolloverEvent.findFirst({
      where: { rolloverId: rollover.id, type: 'WARNINGS_ACKNOWLEDGED' },
      orderBy: { sequence: 'desc' },
    });
    const payload = acknowledgementEvent?.payload as { fingerprint?: string; acknowledgements?: unknown } | null;
    if (!payload || payload.fingerprint !== rollover.warningAcknowledgedFingerprint
      || acknowledgementEvent?.actorUserId !== rollover.warningAcknowledgedByUserId
      || hash(payload.acknowledgements) !== hash(rollover.warningAcknowledgements)) {
      add('WARNING_EVIDENCE_CHANGED', 'BLOCKER', 'Warning acknowledgement reasons or actor no longer match the immutable audit evidence', 'TermRollover', rollover.id, 'rollover-readiness');
    }
  }
  if (terms.find(term => term.id === rollover.sourceTermId)?.status !== 'CLOSING') add('SOURCE_NOT_CLOSING', 'BLOCKER', 'Source term must be CLOSING', 'AcademicTerm', rollover.sourceTermId);
  if (terms.find(term => term.id === rollover.targetTermId)?.status !== 'DRAFT') add('TARGET_NOT_DRAFT', 'BLOCKER', 'Target term must remain DRAFT', 'AcademicTerm', rollover.targetTermId);
  if (!['PREPARED', 'READY'].includes(rollover.status)) add('ROLLOVER_NOT_PREPARED', 'BLOCKER', 'Target setup must be prepared');
  else {
    const preparation = await validateTermRolloverPreparation(rollover.id, tx);
    const enrollment = await validateTermRolloverEnrollments(rollover.id, tx);
    for (const issue of preparation.issues) {
      add(issue.code, issue.severity, issue.message, issue.entityType ?? 'TermRollover', issue.entityId ?? rollover.id);
    }
    for (const issue of enrollment.issues) {
      add(issue.code, issue.severity, issue.message, issue.studentId ? 'Student' : 'TermRollover', issue.studentId ?? rollover.id, 'enrollment-staging');
    }
    if (!preparation.valid) add('PREPARATION_NOT_VALID', 'BLOCKER', 'Preparation validation must pass');
    if (!enrollment.valid) add('ENROLLMENTS_NOT_STAGED', 'BLOCKER', 'All eligible outcomes must be staged and validated', 'TermRollover', rollover.id, 'enrollment-staging');
  }
  const eligible = await tx.studentTermEnrollment.findMany({ where: { academicTermId: rollover.sourceTermId, status: 'ACTIVE' }, select: { studentId: true, classId: true } });
  const reports = await tx.studentTermReport.findMany({ where: { termId: rollover.sourceTermId }, include: { versions: true } });
  for (const student of eligible) {
    const readiness = await getStudentReportReadiness(student.studentId, rollover.sourceTermId, { client: tx, expectedClassId: student.classId });
    for (const blocker of readiness.blockers) add(blocker.code, 'BLOCKER', blocker.message, 'Student', student.studentId, 'report-readiness');
    const report = reports.find(report => report.studentId === student.studentId);
    const version = report?.versions.find(version => version.version === report.currentVersion);
    const released = version?.snapshot as { report?: { id?: string; studentId?: string; termId?: string; classId?: string; status?: string; currentVersion?: number } } | undefined;
    if (!report || !['FINALIZED', 'PUBLISHED'].includes(report.status) || report.classId !== student.classId
      || !version || version.status !== report.status || !verifyReportSnapshotIntegrity(version.snapshot)
      || released?.report?.id !== report.id || released.report.studentId !== student.studentId
      || released.report.termId !== rollover.sourceTermId || released.report.classId !== student.classId
      || released.report.status !== report.status || released.report.currentVersion !== report.currentVersion
      || !report.finalizedAt || (report.status === 'PUBLISHED' && !report.publishedAt)) {
      add('ACADEMIC_REPORT_NOT_RELEASED', 'BLOCKER', 'Eligible student requires a finalized or published report with a valid current checksum version', 'Student', student.studentId, 'report-readiness');
    }
  }
  const finance = await buildFinanceSettlementReconciliationPlan(tx);
  for (const finding of finance.blockers) add(finding.code, 'BLOCKER', finding.message, finding.entityType, finding.entityId, 'finance');
  for (const finding of finance.warnings) add(finding.code, 'WARNING', finding.message, finding.entityType, finding.entityId, 'finance');
  for (const finding of finance.unlinkedInvoiceItems) add('FINANCE_UNLINKED_INVOICE_ITEM', 'BLOCKER', 'Invoice item must be linked to its canonical obligation', 'InvoiceItem', finding.invoiceItemId, 'finance');
  for (const finding of finance.feeCounterMismatches) add('FINANCE_FEE_COUNTER_MISMATCH', 'BLOCKER', 'Fee settlement counter does not reconcile', 'StudentFeeStructure', finding.studentFeeId, 'finance');
  for (const finding of finance.invoiceCounterMismatches) add('FINANCE_INVOICE_COUNTER_MISMATCH', 'BLOCKER', 'Invoice settlement counter does not reconcile', 'Invoice', finding.invoiceId, 'finance');
  for (const action of finance.actions) add('FINANCE_RECONCILIATION_REQUIRED', 'BLOCKER', 'Canonical payment allocation reconciliation is required', 'Payment', action.paymentId, 'finance');
  const invoiceItems = await tx.invoiceItem.findMany({ include: { invoice: true, studentFee: true } });
  for (const item of invoiceItems) {
    if (item.studentFee && (item.studentFee.studentId !== item.invoice.studentId
      || item.studentFee.academicTermId !== item.invoice.termId
      || item.studentFee.feeTemplateId !== item.feeTemplateId)) {
      add('FINANCE_INVOICE_OWNERSHIP_MISMATCH', 'BLOCKER', 'Invoice item and canonical obligation must share student, obligation term and fee template', 'InvoiceItem', item.id, 'finance');
    }
  }
  const refunds = await tx.refund.findMany({ include: { payment: true, allocationReversals: { include: { paymentAllocation: true } } } });
  for (const refund of refunds) {
    if (refund.studentId !== refund.payment.studentId || refund.allocationReversals.some(reversal => reversal.paymentAllocation.paymentId !== refund.paymentId)) {
      add('FINANCE_REFUND_OWNERSHIP_MISMATCH', 'BLOCKER', 'Refund and allocation reversals must belong to the same student receipt', 'Refund', refund.id, 'finance');
    }
  }
  const outbox = await tx.accountingPostingOutbox.findMany({ where: { status: { not: 'COMPLETED' } }, select: { id: true } });
  for (const item of outbox) add('ACCOUNTING_OUTBOX_UNSETTLED', 'BLOCKER', 'Accounting posting must complete before approval', 'AccountingPostingOutbox', item.id, 'finance');
  const fees = await tx.studentFeeStructure.findMany({ where: { academicTermId: rollover.sourceTermId } });
  for (const fee of fees) if (Number(fee.amountDue) - Number(fee.amountPaid) > 0.005) {
    add('UNPAID_BALANCE', 'WARNING', 'Unpaid balance carries forward; it does not block rollover', 'StudentFeeStructure', fee.id, 'finance');
  }
  if (issues.filter(issue => issue.severity === 'WARNING').length > 10000) {
    add('WARNING_CAPACITY_EXCEEDED', 'BLOCKER', 'Warning volume exceeds the supported acknowledgement limit of 10000; reduce the warning set before approval', 'TermRollover', rollover.id, 'rollover-readiness');
  }
  issues.sort((a, b) => a.id.localeCompare(b.id));
  return {
    rolloverId: rollover.id, fingerprint: hash({ version: 1, domain: rolloverDomainFingerprint(tables), issues }),
    warningHash: hash(issues.filter(issue => issue.severity === 'WARNING').map(issue => issue.id).sort()),
    summary: { blockerCount: issues.filter(issue => issue.severity === 'BLOCKER').length, warningCount: issues.filter(issue => issue.severity === 'WARNING').length }, issues,
  };
}

function dto(rollover: TermRollover, snapshot: Snapshot): RolloverReadinessDTO {
  const current = rollover.preflightHash === snapshot.fingerprint;
  const acknowledgements = rollover.warningAcknowledgements;
  const actualCoverage = Array.isArray(acknowledgements) && acknowledgements.every(item => (
    item && typeof item === 'object' && !Array.isArray(item)
    && typeof item.warningId === 'string' && typeof item.reason === 'string'
    && item.reason.trim().length > 0 && item.reason.trim().length <= 500
  )) ? hash(acknowledgements.map(item => (item as { warningId: string }).warningId).sort()) : null;
  const warningsAcknowledged = current && (snapshot.summary.warningCount === 0 || (
    rollover.warningAcknowledgementHash === snapshot.warningHash && actualCoverage === snapshot.warningHash
    && rollover.warningAcknowledgedFingerprint === snapshot.fingerprint
  ));
  const backupVerified = current && rollover.backupFingerprint === snapshot.fingerprint && !!rollover.backupVerifiedAt;
  const approved = backupVerified && warningsAcknowledged && rollover.approvedFingerprint === snapshot.fingerprint && !!rollover.approvedAt && rollover.status === 'READY';
  return { ...snapshot, evidence: {
    current, warningsAcknowledged, backupVerified, approved,
    ...(rollover.backupReference ? { backupReference: rollover.backupReference } : {}),
    ...(rollover.backupChecksum ? { backupChecksum: rollover.backupChecksum } : {}),
    ...(rollover.backupVerifiedAt ? { backupVerifiedAt: rollover.backupVerifiedAt.toISOString() } : {}),
  }, canApprove: current && snapshot.summary.blockerCount === 0 && warningsAcknowledged && backupVerified };
}

async function verifyArtifact(tx: Prisma.TransactionClient, rollover: TermRollover, snapshot: Snapshot, tables: DatabaseTableSnapshot[]) {
  if (!rollover.backupReference || !rollover.backupChecksum || !rollover.backupManifest || rollover.backupFingerprint !== snapshot.fingerprint) throw new Error('Missing current backup');
  const bytes = await getRolloverBackupStore().read(rollover.backupReference);
  if (backupSha256(bytes) !== rollover.backupChecksum || BigInt(bytes.length).toString() !== rollover.backupSizeBytes?.toString()) throw new Error('Backup bytes do not match stored checksum or size');
  const artifact = JSON.parse(bytes.toString('utf8'));
  const liveDomain = rolloverDomainFingerprint(tables);
  const liveSchema = await rolloverSchemaManifest(tx);
  if (artifact.format !== 'sync-rollover-restore-v1' || artifact.manifest.rolloverId !== rollover.id
    || artifact.manifest.fingerprint !== snapshot.fingerprint || hash(artifact.manifest) !== hash(rollover.backupManifest)
    || artifact.manifest.domainFingerprint !== liveDomain
    || hash({ version: 1, domain: artifact.manifest.domainFingerprint, issues: snapshot.issues }) !== snapshot.fingerprint
    || hash(artifact.schema) !== hash(liveSchema)
    || backupSha256(JSON.stringify(artifact.tables)) !== artifact.manifest.tablesSha256
    || rolloverDomainFingerprint(artifact.tables) !== artifact.manifest.domainFingerprint
    || backupSha256(artifact.schema.schema) !== artifact.schema.schemaSha256
    || hash(artifact.schema) !== artifact.manifest.schemaManifestHash
    || artifact.schema.migrations.some((item: { sql: string; sha256: string }) => backupSha256(item.sql) !== item.sha256)
    || hash(artifact.tables.map((table: DatabaseTableSnapshot) => ({ table: table.table, count: table.rows.length }))) !== hash(artifact.manifest.tables)) {
    throw new Error('Backup manifest binding is invalid');
  }
}

async function invalidateAfterFailure(id: string, actor: string | null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await prisma.$transaction(async tx => {
    await lock(tx, id);
    const rollover = await tx.termRollover.findUnique({ where: { id } });
    if (!rollover || !['DRAFT', 'PREPARED', 'READY'].includes(rollover.status)) return;
    await tx.termRollover.update({ where: { id }, data: {
      ...clearedEvidence, preflightHash: null, preflightSnapshot: Prisma.DbNull, preflightGeneratedAt: null, warningHash: null,
      ...(rollover.status === 'READY' ? { status: 'PREPARED' } : {}),
    } });
    await event(tx, id, 'READINESS_INVALIDATED', actor, { reason: 'READINESS_OPERATION_FAILED' });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue;
      throw new TermRolloverReadinessError('READINESS_INVALIDATION_FAILED', 'Database failure prevented readiness invalidation; approval must not be relied upon until preflight succeeds', 503);
    }
  }
}

async function operate(id: string, operation: Operation, actor: string | null = null, expected?: string, acknowledgements: Acknowledgement[] = []): Promise<RolloverReadinessDTO> {
  for (let attempt = 0; attempt < 3; attempt++) {
    let uploaded: string | undefined;
    try {
      const outcome = await prisma.$transaction(async tx => {
        await lock(tx, id);
        let rollover = await tx.termRollover.findUnique({ where: { id } });
        if (!rollover) throw new TermRolloverReadinessError('ROLLOVER_NOT_FOUND', 'Rollover not found', 404);
        if (!['DRAFT', 'PREPARED', 'READY'].includes(rollover.status)) throw new TermRolloverReadinessError('ROLLOVER_READINESS_LOCKED', 'Readiness cannot modify this rollover state');
        const tables = await captureRolloverDatabase(tx);
        const snapshot = await evaluate(tx, rollover, tables);
        const changed = rollover.preflightHash !== snapshot.fingerprint;
        const reset = changed || (rollover.status === 'READY'
          && (snapshot.summary.blockerCount > 0 || !dto(rollover, snapshot).evidence.approved));
        // Commit invalidation BEFORE reporting stale/failed requests to the caller.
        rollover = await tx.termRollover.update({ where: { id }, data: {
          preflightHash: snapshot.fingerprint, preflightSnapshot: json(snapshot), preflightGeneratedAt: new Date(), warningHash: snapshot.warningHash,
          ...(reset ? { ...clearedEvidence, ...(rollover.status === 'READY' ? { status: 'PREPARED' } : {}) } : {}),
        } });
        if (reset) await event(tx, id, 'PREFLIGHT_REFRESHED', actor, { fingerprint: snapshot.fingerprint, warningHash: snapshot.warningHash, summary: snapshot.summary });
        const fail = async (code: string, message: string, backupFailure = false) => {
          rollover = await tx.termRollover.update({ where: { id }, data: {
            ...clearedApproval, ...(backupFailure ? clearedBackup : {}),
            ...(rollover!.status === 'READY' ? { status: 'PREPARED' } : {}),
          } });
          await event(tx, id, 'READINESS_REJECTED', actor, { code, fingerprint: snapshot.fingerprint });
          return { error: new TermRolloverReadinessError(code, message), report: dto(rollover, snapshot) };
        };
        if (operation === 'preflight') return { report: dto(rollover, snapshot) };
        if (!actor) return fail('ACTOR_REQUIRED', 'Authenticated actor is required');
        if (!expected || expected !== snapshot.fingerprint) return fail('STALE_PREFLIGHT', 'Refresh preflight and review its current fingerprint');
        if (operation === 'acknowledge') {
          const expectedIds = snapshot.issues.filter(issue => issue.severity === 'WARNING').map(issue => issue.id).sort();
          const receivedIds = acknowledgements.map(item => item.warningId).sort();
          if (hash(receivedIds) !== hash(expectedIds) || acknowledgements.some(item => !item.reason.trim() || item.reason.trim().length > 500)) return fail('WARNING_COVERAGE_REQUIRED', 'A unique acknowledgement and reason is required for every current warning');
          rollover = await tx.termRollover.update({ where: { id }, data: {
            ...clearedApproval, ...(rollover.status === 'READY' ? { status: 'PREPARED' } : {}),
            warningAcknowledgements: json(acknowledgements), warningAcknowledgementHash: snapshot.warningHash,
            warningAcknowledgedFingerprint: snapshot.fingerprint, warningAcknowledgedByUserId: actor, warningAcknowledgedAt: new Date(),
          } });
          await event(tx, id, 'WARNINGS_ACKNOWLEDGED', actor, { fingerprint: snapshot.fingerprint, warningHash: snapshot.warningHash, acknowledgements });
        } else if (operation === 'backup') {
          if (snapshot.summary.blockerCount) return fail('PREFLIGHT_BLOCKED', 'Resolve blockers before creating readiness backup');
          try {
            const schema = await rolloverSchemaManifest(tx);
            const manifest = {
              rolloverId: id, fingerprint: snapshot.fingerprint, createdAt: new Date().toISOString(),
              domainFingerprint: rolloverDomainFingerprint(tables),
              tables: tables.map(table => ({ table: table.table, count: table.rows.length })),
              tablesSha256: backupSha256(JSON.stringify(tables)), schemaManifestHash: hash(schema),
            };
            const bytes = Buffer.from(JSON.stringify({ format: 'sync-rollover-restore-v1', manifest, schema, tables }));
            uploaded = await getRolloverBackupStore().put(bytes);
            rollover = await tx.termRollover.update({ where: { id }, data: {
              ...clearedApproval, ...(rollover.status === 'READY' ? { status: 'PREPARED' } : {}),
              backupReference: uploaded, backupChecksum: backupSha256(bytes), backupFingerprint: snapshot.fingerprint,
              backupManifest: json(manifest), backupSizeBytes: new Prisma.Decimal(bytes.length), backupCreatedAt: new Date(),
              backupVerifiedAt: null, backupVerifiedByUserId: null,
            } });
            await event(tx, id, 'BACKUP_CREATED', actor, { fingerprint: snapshot.fingerprint, reference: uploaded, checksum: rollover.backupChecksum });
          } catch { return fail('BACKUP_CREATION_FAILED', 'Protected restore backup could not be created; check storage and migration configuration', true); }
        } else {
          if (operation === 'approve' && (snapshot.summary.blockerCount || !dto(rollover, snapshot).evidence.warningsAcknowledged || !dto(rollover, snapshot).evidence.backupVerified)) return fail('READINESS_EVIDENCE_REQUIRED', 'Approval requires zero blockers, complete warning coverage and a verified current backup');
          try { await verifyArtifact(tx, rollover, snapshot, tables); }
          catch { return fail('BACKUP_VERIFICATION_FAILED', 'Backup byte checksum or manifest verification failed', true); }
          rollover = await tx.termRollover.update({ where: { id }, data: {
            ...(operation === 'approve' ? { status: TermRolloverStatus.READY, approvedFingerprint: snapshot.fingerprint, approvedByUserId: actor, approvedAt: new Date() } : {}),
            backupVerifiedAt: new Date(), backupVerifiedByUserId: actor,
          } });
          await event(tx, id, operation === 'approve' ? 'ROLLOVER_APPROVED' : 'BACKUP_VERIFIED', actor, { fingerprint: snapshot.fingerprint, checksum: rollover.backupChecksum });
        }
        return { report: dto(rollover, snapshot) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 120000 });
      if ('error' in outcome) {
        if (uploaded) await getRolloverBackupStore().remove(uploaded).catch(() => console.error('Orphaned rollover backup requires protected storage retention cleanup'));
        throw outcome.error;
      }
      return outcome.report;
    } catch (error) {
      // Only clean uncommitted uploads on confirmed rollback (P2034). Other commit
      // outcomes may be ambiguous: retain rather than delete a possibly referenced backup.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        if (uploaded) await getRolloverBackupStore().remove(uploaded).catch(() => console.error('Orphaned rollover backup requires protected storage retention cleanup'));
        if (attempt < 2) continue;
      }
      if (!(error instanceof TermRolloverReadinessError)) {
        await invalidateAfterFailure(id, actor);
        throw new TermRolloverReadinessError('READINESS_FAILED', 'Readiness evaluation failed; readiness evidence was invalidated', 503);
      }
      throw error;
    }
  }
  throw new TermRolloverReadinessError('READINESS_CONFLICT', 'Concurrent changes prevented readiness evaluation');
}

export const preflightTermRollover = (id: string, actor: string | null = null) => operate(id, 'preflight', actor);
export const acknowledgeTermRolloverWarnings = (id: string, expected: string, acknowledgements: Acknowledgement[], actor: string) => operate(id, 'acknowledge', actor, expected, acknowledgements);
export const backupTermRollover = (id: string, expected: string, actor: string) => operate(id, 'backup', actor, expected);
export const verifyTermRolloverBackup = (id: string, expected: string, actor: string) => operate(id, 'verify', actor, expected);
export const approveTermRollover = (id: string, expected: string, actor: string) => operate(id, 'approve', actor, expected);