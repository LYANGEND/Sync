import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/utils/prisma';
import { generateSingleStudentReport } from '../src/controllers/reportCardController';
import { finalizeStudentReport, getStudentReportReadiness } from '../src/services/reportFinalizationService';
import { runTermWriteTransaction } from '../src/services/termLifecycleService';
import { createTermRollover, getTermRollover, listTermRollovers, planTermRollover, prepareTermRollover } from '../src/services/termRolloverPreparationService';
import { getTermRolloverEnrollmentPlan, stageTermRolloverEnrollments } from '../src/services/termRolloverEnrollmentService';
import {
  acknowledgeTermRolloverWarnings, approveTermRollover, backupTermRollover,
  preflightTermRollover, rolloverDomainFingerprint, RolloverReadinessDTO, TermRolloverReadinessError, verifyTermRolloverBackup,
} from '../src/services/termRolloverReadinessService';
import { backupSha256, captureRolloverDatabase, DatabaseTableSnapshot, getRolloverBackupStore, rolloverSchemaManifest } from '../src/services/termRolloverBackupStoreService';
import { createReportSnapshotChecksum } from '../src/utils/reportSnapshotIntegrity';

// This suite is intentionally NOT part of npm test: it needs a disposable migrated DB.
// Fail closed before any query, and check current_schema again before destructive cleanup.
const schema = 'term_rollover_readiness_test';
const assertIsolatedDatabase = () => {
  const url = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(url.protocol, 'postgresql:');
  assert.equal(url.hostname, 'localhost');
  assert.equal(url.port, '55432');
  assert.equal(url.pathname, '/postgres');
  assert.equal(url.username, 'sync_user');
  assert.equal(url.password, 'sync_password');
  assert.deepEqual(url.searchParams.getAll('schema'), [schema]);
  assert.deepEqual([...url.searchParams.keys()], ['schema']);
  assert.equal(process.env.NODE_ENV, 'test');
};
const clearIsolatedSchema = async () => {
  assertIsolatedDatabase();
  const current = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_schema() AS name`;
  assert.equal(current[0].name, schema);
  await prisma.$executeRawUnsafe(`DO $$ DECLARE r RECORD; BEGIN
    FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = '${schema}' AND tablename <> '_prisma_migrations'
    LOOP EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', '${schema}', r.tablename); END LOOP;
  END $$;`);
};
let storageDirectory: string | undefined;
const previousEnvironment = Object.fromEntries([
  'ROLLOVER_BACKUP_DIRECTORY', 'ROLLOVER_BACKUP_PROVIDER', 'ROLLOVER_BACKUP_WINDOWS_ACL_PROTECTED', 'JWT_SECRET',
].map(key => [key, process.env[key]]));
after(async () => {
  await prisma.$disconnect();
  if (storageDirectory) await fs.rm(storageDirectory, { recursive: true, force: true });
  for (const [key, value] of Object.entries(previousEnvironment)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
});
const rejectsCode = async (operation: Promise<unknown>, code: string) => {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof TermRolloverReadinessError);
    assert.equal(error.code, code);
    return true;
  });
};
const snapshotDomain = async () => prisma.$transaction(async tx => (
  (await captureRolloverDatabase(tx)).filter(table => !['term_rollovers', 'term_rollover_events'].includes(table.table))
), { isolationLevel: 'Serializable', timeout: 120000 });

test('Phase 9 real DB readiness acceptance (no cutover)', { timeout: 240000 }, async t => {
  assertIsolatedDatabase();
  await clearIsolatedSchema();
  const migrations = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert.equal(Number(migrations[0].count), 53);

  storageDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'sync-phase9-protected-'));
  if (process.platform === 'win32') {
    // Only execute the trusted Windows utility with arguments, never a shell or user path.
    const executable = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'icacls.exe');
    const whoami = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'whoami.exe');
    const user = execFileSync(whoami, [], { encoding: 'utf8' }).trim();
    execFileSync(executable, [storageDirectory, '/inheritance:r', '/grant:r', `${user}:(OI)(CI)F`]);
    process.env.ROLLOVER_BACKUP_WINDOWS_ACL_PROTECTED = 'true';
  } else await fs.chmod(storageDirectory, 0o700);
  process.env.ROLLOVER_BACKUP_DIRECTORY = storageDirectory;
  process.env.ROLLOVER_BACKUP_PROVIDER = 'filesystem';

  const branch = await prisma.branch.create({ data: { name: 'Phase 9 Main', code: 'PHASE9', isMain: true } });
  const admin = await prisma.user.create({ data: { email: 'phase9-admin@example.invalid', fullName: 'Readiness Admin', passwordHash: 'test-only', role: 'SUPER_ADMIN', branchId: branch.id } });
  const teacher = await prisma.user.create({ data: { email: 'phase9-teacher@example.invalid', fullName: 'Readiness Teacher', passwordHash: 'test-only', role: 'TEACHER', branchId: branch.id } });
  const year = await prisma.academicYear.create({ data: { name: '2046 Year', startDate: new Date('2046-01-01Z'), endDate: new Date('2046-12-31Z'), termCount: 3, status: 'ACTIVE' } });
  const source = await prisma.academicTerm.create({ data: { name: '2046 Term 1', startDate: new Date('2046-01-01Z'), endDate: new Date('2046-03-31Z'), academicYearId: year.id, sequence: 1, status: 'ACTIVE', isActive: true } });
  const target = await prisma.academicTerm.create({ data: { name: '2046 Term 2', startDate: new Date('2046-04-01Z'), endDate: new Date('2046-06-30Z'), academicYearId: year.id, sequence: 2, status: 'DRAFT' } });
  const cohort = await prisma.classCohort.create({ data: { academicYearId: year.id, name: 'Grade 5A', gradeLevel: 5, branchId: branch.id } });
  const classroom = await prisma.class.create({ data: { name: 'Grade 5A', gradeLevel: 5, teacherId: teacher.id, academicTermId: source.id, classCohortId: cohort.id, branchId: branch.id } });
  const student = await prisma.student.create({ data: { admissionNumber: 'PHASE9-1', firstName: 'Real', lastName: 'Student', dateOfBirth: new Date('2035-01-01Z'), gender: 'FEMALE', classId: classroom.id, branchId: branch.id } });
  await prisma.studentTermEnrollment.create({ data: { studentId: student.id, academicTermId: source.id, classId: classroom.id, status: 'ACTIVE', startsAt: source.startDate } });
  const subject = await prisma.subject.create({ data: { name: 'Mathematics', code: 'PHASE9-MATH', classes: { connect: { id: classroom.id } } } });
  await prisma.gradingScale.create({ data: { grade: 'A', minScore: 0, maxScore: 100, remark: 'Complete' } });
  const settings = await prisma.schoolSettings.create({ data: { schoolName: 'Phase 9 School' } });
  const day = new Date('2046-01-02Z');
  await prisma.termInstructionalDay.create({ data: { academicTermId: source.id, date: day } });
  const assessment = await prisma.assessment.create({ data: { title: 'Final', type: 'EXAM', classId: classroom.id, subjectId: subject.id, termId: source.id, totalMarks: 100, weight: 100, date: day } });
  await prisma.assessmentResult.create({ data: { assessmentId: assessment.id, studentId: student.id, score: 80, gradedByUserId: teacher.id } });
  const template = await prisma.feeTemplate.create({ data: { name: 'Tuition', amount: 100, academicTermId: source.id, applicableGrade: 5 } });
  await prisma.studentFeeStructure.create({ data: { studentId: student.id, feeTemplateId: template.id, academicTermId: source.id, amountDue: 100 } });
  await prisma.academicTerm.update({ where: { id: source.id }, data: { status: 'CLOSING', isActive: false } });

  // Real Phase 7 preparation and Phase 8 staging, rather than hand-written rollover metadata.
  const created = await createTermRollover({ sourceTermId: source.id, targetTermId: target.id, transitionType: 'WITHIN_YEAR', idempotencyKey: 'phase9-readiness-acceptance', actorUserId: admin.id, configuration: { copyCategories: ['SUBJECT_LINKS', 'TEACHER_ASSIGNMENTS'] } });
  const id = created.rollover.id;
  const plan = await planTermRollover(id);
  assert.equal(plan.canPrepare, true, JSON.stringify(plan.issues));
  await prepareTermRollover(id, plan.inputHash, admin.id);
  const enrollmentPlan = await getTermRolloverEnrollmentPlan(id);
  assert.equal(enrollmentPlan.canStage, true, JSON.stringify(enrollmentPlan.issues));
  await stageTermRolloverEnrollments(id, enrollmentPlan.inputHash, admin.id);
  const row = () => prisma.termRollover.findUniqueOrThrow({ where: { id } });
  const acknowledge = (dto: RolloverReadinessDTO) => acknowledgeTermRolloverWarnings(id, dto.fingerprint,
    dto.issues.filter(issue => issue.severity === 'WARNING').map(issue => ({ warningId: issue.id, reason: 'Debt reviewed and remains collectible after rollover.' })), admin.id);
  const verified = async () => {
    const dto = await preflightTermRollover(id, admin.id);
    assert.equal(dto.summary.blockerCount, 0, JSON.stringify(dto.issues));
    await acknowledge(dto);
    await backupTermRollover(id, dto.fingerprint, admin.id);
    return verifyTermRolloverBackup(id, dto.fingerprint, admin.id);
  };
  const approved = async () => {
    const dto = await verified();
    return approveTermRollover(id, dto.fingerprint, admin.id);
  };
  const assertCleared = async () => {
    const persisted = await row();
    assert.equal(persisted.status, 'PREPARED');
    assert.equal(persisted.approvedAt, null);
    assert.equal(persisted.approvedFingerprint, null);
    assert.equal(persisted.approvedByUserId, null);
    return persisted;
  };

  await t.test('academic blockers prevent backup and approval until real report readiness passes', async () => {
    const blocked = await preflightTermRollover(id, admin.id);
    for (const code of ['REPORT_NOT_GENERATED', 'ATTENDANCE_MISSING', 'ACADEMIC_REPORT_NOT_RELEASED']) {
      assert.ok(blocked.issues.some(issue => issue.code === code), code);
    }
    assert.equal(blocked.canApprove, false);
    await rejectsCode(backupTermRollover(id, blocked.fingerprint, admin.id), 'PREFLIGHT_BLOCKED');
    await rejectsCode(approveTermRollover(id, blocked.fingerprint, admin.id), 'READINESS_EVIDENCE_REQUIRED');
    await assertCleared();
    await prisma.attendance.create({ data: { studentId: student.id, classId: classroom.id, academicTermId: source.id, date: day, status: 'PRESENT', recordedByUserId: teacher.id } });
    await runTermWriteTransaction(source.id, 'FINALIZATION', tx => generateSingleStudentReport(student.id, source.id, tx));
    assert.equal((await getStudentReportReadiness(student.id, source.id)).ready, true);
    assert.ok((await preflightTermRollover(id)).issues.some(issue => issue.code === 'ACADEMIC_REPORT_NOT_RELEASED'));
    await finalizeStudentReport(student.id, source.id, admin.id);
    const ready = await preflightTermRollover(id, admin.id);
    assert.equal(ready.summary.blockerCount, 0, JSON.stringify(ready.issues));
    assert.ok(ready.issues.some(issue => issue.code === 'UNPAID_BALANCE' && issue.severity === 'WARNING'));
  });

  await t.test('warnings require complete unique IDs, nonempty bounded reasons and current fingerprint', async () => {
    const dto = await preflightTermRollover(id);
    const warnings = dto.issues.filter(issue => issue.severity === 'WARNING').map(issue => ({ warningId: issue.id, reason: 'Reviewed debt' }));
    assert.ok(warnings.length > 0);
    for (const invalid of [[], [...warnings, warnings[0]], warnings.map(item => ({ ...item, warningId: 'f'.repeat(64) })), warnings.map(item => ({ ...item, reason: '   ' })), warnings.map(item => ({ ...item, reason: 'x'.repeat(501) }))]) {
      await rejectsCode(acknowledgeTermRolloverWarnings(id, dto.fingerprint, invalid, admin.id), 'WARNING_COVERAGE_REQUIRED');
      assert.equal((await row()).warningAcknowledgements, null);
    }
    await rejectsCode(acknowledgeTermRolloverWarnings(id, '0'.repeat(64), warnings, admin.id), 'STALE_PREFLIGHT');
    await rejectsCode(approveTermRollover(id, dto.fingerprint, ''), 'ACTOR_REQUIRED');
    const acknowledged = await acknowledge(dto);
    assert.equal(acknowledged.evidence.warningsAcknowledged, true);
    assert.equal((await row()).warningAcknowledgedFingerprint, dto.fingerprint);
    await rejectsCode(approveTermRollover(id, dto.fingerprint, admin.id), 'READINESS_EVIDENCE_REQUIRED');
  });

  await t.test('backup creation is unverified PREPARED; verify then approve reaches READY without cutover', async () => {
    const before = await snapshotDomain();
    const dto = await preflightTermRollover(id);
    await acknowledge(dto);
    const backup = await backupTermRollover(id, dto.fingerprint, admin.id);
    assert.equal(backup.evidence.backupVerified, false);
    assert.equal(backup.canApprove, false);
    assert.equal((await row()).status, 'PREPARED');
    assert.equal((await row()).backupVerifiedAt, null);
    await rejectsCode(approveTermRollover(id, dto.fingerprint, admin.id), 'READINESS_EVIDENCE_REQUIRED');
    const bytes = await getRolloverBackupStore().read(backup.evidence.backupReference!);
    const artifact = JSON.parse(bytes.toString());
    assert.equal(backupSha256(bytes), backup.evidence.backupChecksum);
    assert.equal(artifact.format, 'sync-rollover-restore-v1');
    assert.equal(artifact.manifest.rolloverId, id);
    assert.equal(artifact.manifest.fingerprint, dto.fingerprint);
    assert.equal(artifact.schema.migrations.length, 53);
    assert.ok(artifact.tables.some((table: { table: string }) => table.table === '_ClassSubjects'));
    assert.ok(artifact.tables.some((table: { table: string }) => table.table === '_prisma_migrations'));
    const verification = await verifyTermRolloverBackup(id, dto.fingerprint, admin.id);
    assert.equal(verification.evidence.backupVerified, true);
    assert.equal(verification.canApprove, true);
    assert.equal((await row()).status, 'PREPARED');
    const result = await approveTermRollover(id, dto.fingerprint, admin.id);
    assert.equal(result.evidence.approved, true);
    assert.equal((await row()).status, 'READY');
    assert.equal((await row()).executedAt, null);
    assert.deepEqual(await snapshotDomain(), before);
    assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).classId, classroom.id);
    assert.equal((await prisma.academicTerm.findUniqueOrThrow({ where: { id: source.id } })).status, 'CLOSING');
    assert.equal((await prisma.academicTerm.findUniqueOrThrow({ where: { id: target.id } })).status, 'DRAFT');
    assert.equal(await prisma.studentTermEnrollment.count({ where: { academicTermId: target.id, status: 'ACTIVE' } }), 0);
    assert.equal(await prisma.studentTermEnrollment.count({ where: { academicTermId: target.id, status: 'STAGED' } }), 1);
    await assert.rejects(prisma.assessmentResult.update({ where: { assessmentId_studentId: { assessmentId: assessment.id, studentId: student.id } }, data: { score: 99 } }), /immutable/i);
  });

  await t.test('SQL reason-only warning tamper with unchanged IDs durably invalidates READY and prevents approval', async () => {
    const dto = await approved();
    const original = await row();
    assert.equal(original.status, 'READY');
    const acknowledgements = original.warningAcknowledgements as Array<{ warningId: string; reason: string }>;
    assert.ok(acknowledgements.length > 0);
    const tampered = acknowledgements.map(item => ({ ...item, reason: 'Different nonempty reason written outside the reviewed audit event.' }));
    assert.deepEqual(tampered.map(item => item.warningId), acknowledgements.map(item => item.warningId));
    assert.notDeepEqual(tampered, acknowledgements);
    try {
      // Real SQL bypasses the service while retaining valid READY constraint coverage.
      assert.equal(await prisma.$executeRaw`UPDATE "term_rollovers"
        SET "warningAcknowledgements" = ${JSON.stringify(tampered)}::jsonb WHERE id = ${id}`, 1);
      const damaged = await row();
      assert.equal(damaged.status, 'READY');
      assert.deepEqual(damaged.warningAcknowledgements, tampered);
      assert.equal(damaged.warningAcknowledgementHash, original.warningAcknowledgementHash);
      assert.equal(damaged.warningAcknowledgedFingerprint, dto.fingerprint);
      const audit = await prisma.termRolloverEvent.findFirstOrThrow({
        where: { rolloverId: id, type: 'WARNINGS_ACKNOWLEDGED' }, orderBy: { sequence: 'desc' },
      });
      assert.deepEqual((audit.payload as { acknowledgements: unknown }).acknowledgements, acknowledgements);

      const fresh = await preflightTermRollover(id, admin.id);
      assert.ok(fresh.issues.some(issue => issue.code === 'WARNING_EVIDENCE_CHANGED' && issue.severity === 'BLOCKER'));
      assert.equal(fresh.canApprove, false);
      assert.equal(fresh.evidence.approved, false);
      assert.equal(fresh.evidence.warningsAcknowledged, false);
      const persisted = await assertCleared();
      assert.equal(persisted.preflightHash, fresh.fingerprint);
      assert.notEqual(persisted.preflightHash, dto.fingerprint);
      assert.equal(persisted.warningAcknowledgements, null);
      assert.equal(persisted.warningAcknowledgementHash, null);
      assert.equal(persisted.warningAcknowledgedFingerprint, null);
      assert.equal(persisted.backupReference, null);
      assert.equal(persisted.backupVerifiedAt, null);
      // Clearing the damaged acknowledgements also removes the audit mismatch
      // blocker on reevaluation; the old domain fingerprint cannot restore evidence.
      await rejectsCode(approveTermRollover(id, dto.fingerprint, admin.id), 'READINESS_EVIDENCE_REQUIRED');
      const current = await preflightTermRollover(id, admin.id);
      await rejectsCode(approveTermRollover(id, current.fingerprint, admin.id), 'READINESS_EVIDENCE_REQUIRED');
      await assertCleared();
    } finally {
      // If an assertion exposes a defect before invalidation, restore only the
      // still-bound reasons, never resurrect approval/evidence cleared by the service.
      await prisma.$executeRaw`UPDATE "term_rollovers"
        SET "warningAcknowledgements" = ${JSON.stringify(acknowledgements)}::jsonb
        WHERE id = ${id} AND "warningAcknowledgedFingerprint" = ${dto.fingerprint}`;
    }
  });

  await t.test('stale input rejection durably clears READY and all fingerprint-bound evidence', async () => {
    const old = await approved();
    await prisma.schoolSettings.update({ where: { id: settings.id }, data: { schoolName: 'Phase 9 School Revised' } });
    await rejectsCode(approveTermRollover(id, old.fingerprint, admin.id), 'STALE_PREFLIGHT');
    const persisted = await assertCleared();
    assert.notEqual(persisted.preflightHash, old.fingerprint);
    assert.equal(persisted.backupReference, null);
    assert.equal(persisted.warningAcknowledgements, null);
    const fresh = await preflightTermRollover(id);
    assert.equal(fresh.evidence.approved, false);
    assert.equal(fresh.evidence.backupVerified, false);
    assert.equal(fresh.evidence.warningsAcknowledged, false);
  });

  await t.test('default-client getTermRollover demotes stale READY before returning after source fee drift', async () => {
    const fee = await prisma.studentFeeStructure.findUniqueOrThrow({ where: { studentId_feeTemplateId_academicTermId: { studentId: student.id, feeTemplateId: template.id, academicTermId: source.id } } });
    const dto = await approved();
    const original = await row();
    assert.equal(original.status, 'READY');
    assert.equal(original.approvedFingerprint, dto.fingerprint);
    assert.ok(original.approvedAt);
    assert.equal(original.approvedByUserId, admin.id);
    try {
      // Change only the unpaid obligation; keep payment counters reconciled.
      await prisma.studentFeeStructure.update({ where: { id: fee.id }, data: { amountDue: Number(fee.amountDue) + 1 } });
      assert.equal((await row()).status, 'READY', 'Drift alone must leave approval persisted until the read');
      const result = await getTermRollover(id);
      assert.equal(result.status, 'PREPARED');
      assert.equal(result.approvedAt, null);
      assert.equal(result.approvedFingerprint, null);
      assert.equal(result.approvedByUserId, null);
      assert.notEqual(result.preflightHash, dto.fingerprint);
      const persisted = await assertCleared();
      assert.equal(persisted.preflightHash, result.preflightHash);
    } finally {
      await prisma.studentFeeStructure.update({ where: { id: fee.id }, data: { amountDue: fee.amountDue } });
    }
  });

  await t.test('listTermRollovers independently demotes stale READY before returning after source fee drift', async () => {
    const fee = await prisma.studentFeeStructure.findUniqueOrThrow({ where: { studentId_feeTemplateId_academicTermId: { studentId: student.id, feeTemplateId: template.id, academicTermId: source.id } } });
    const dto = await approved();
    const original = await row();
    assert.equal(original.status, 'READY');
    assert.equal(original.approvedFingerprint, dto.fingerprint);
    assert.ok(original.approvedAt);
    assert.equal(original.approvedByUserId, admin.id);
    try {
      await prisma.studentFeeStructure.update({ where: { id: fee.id }, data: { amountDue: Number(fee.amountDue) + 1 } });
      assert.equal((await row()).status, 'READY', 'Drift alone must leave approval persisted until the read');
      // Do not call getTermRollover: the list read must perform its own preflight.
      const result = (await listTermRollovers()).find(rollover => rollover.id === id);
      assert.ok(result, 'The list must contain the independently re-approved rollover');
      assert.equal(result.status, 'PREPARED');
      assert.equal(result.approvedAt, null);
      assert.equal(result.approvedFingerprint, null);
      assert.equal(result.approvedByUserId, null);
      assert.notEqual(result.preflightHash, dto.fingerprint);
      const persisted = await assertCleared();
      assert.equal(persisted.preflightHash, result.preflightHash);
    } finally {
      await prisma.studentFeeStructure.update({ where: { id: fee.id }, data: { amountDue: fee.amountDue } });
    }
  });

  for (const damage of ['corrupt', 'missing'] as const) {
    await t.test(`${damage} backup fails re-approval and durably clears READY`, async () => {
      const dto = await approved();
      const reference = dto.evidence.backupReference!;
      const file = path.join(storageDirectory!, `${reference.slice('rollover-backup:'.length)}.json`);
      if (damage === 'corrupt') await fs.appendFile(file, 'corruption'); else await fs.unlink(file);
      await rejectsCode(approveTermRollover(id, dto.fingerprint, admin.id), 'BACKUP_VERIFICATION_FAILED');
      const persisted = await assertCleared();
      assert.equal(persisted.backupReference, null);
      assert.equal(persisted.backupVerifiedAt, null);
      assert.equal((await preflightTermRollover(id)).canApprove, false);
    });
  }

  await t.test('valid byte checksum cannot disguise a tampered restore manifest', async () => {
    const dto = await approved();
    const persisted = await row();
    const file = path.join(storageDirectory!, `${dto.evidence.backupReference!.slice('rollover-backup:'.length)}.json`);
    const artifact = JSON.parse((await fs.readFile(file)).toString());
    artifact.manifest.fingerprint = '0'.repeat(64);
    const bytes = Buffer.from(JSON.stringify(artifact));
    await fs.writeFile(file, bytes);
    // Simulate corrupted stored checksum metadata, not a fake backup adapter.
    await prisma.termRollover.update({ where: { id }, data: { backupChecksum: backupSha256(bytes), backupSizeBytes: bytes.length } });
    assert.equal((await row()).backupFingerprint, persisted.backupFingerprint);
    await rejectsCode(approveTermRollover(id, dto.fingerprint, admin.id), 'BACKUP_VERIFICATION_FAILED');
    assert.equal((await assertCleared()).backupReference, null);
  });

  for (const damage of ['domain', 'schema'] as const) {
    await t.test(`internally consistent ${damage} artifact rebound to current metadata fails live verification`, async () => {
      const dto = await approved();
      const original = await row();
      const file = path.join(storageDirectory!, `${dto.evidence.backupReference!.slice('rollover-backup:'.length)}.json`);
      const originalBytes = await fs.readFile(file);
      const artifact = JSON.parse(originalBytes.toString());
      const live = await prisma.$transaction(async tx => ({
        domain: rolloverDomainFingerprint(await captureRolloverDatabase(tx)),
        schema: await rolloverSchemaManifest(tx),
      }), { isolationLevel: 'Serializable', timeout: 120000 });
      assert.equal(artifact.manifest.domainFingerprint, live.domain);
      assert.deepEqual(artifact.schema, live.schema);
      try {
        if (damage === 'domain') {
          const table = (artifact.tables as DatabaseTableSnapshot[]).find(table => table.table === 'school_settings');
          assert.ok(table, 'Restore artifact must contain the real school settings table');
          const index = table.rows.findIndex(text => JSON.parse(text).id === settings.id);
          assert.notEqual(index, -1);
          const restoredSettings = JSON.parse(table.rows[index]);
          restoredSettings.schoolName = 'Forged restore-only school name';
          table.rows[index] = JSON.stringify(restoredSettings);
          artifact.manifest.domainFingerprint = rolloverDomainFingerprint(artifact.tables);
          assert.notEqual(artifact.manifest.domainFingerprint, live.domain);
        } else {
          // A valid schema comment changes the restore manifest, not local files
          // or the live DB, and all internal schema hashes are recomputed below.
          artifact.schema.schema += '\n// Restore-only tampered schema manifest\n';
          artifact.schema.schemaSha256 = backupSha256(artifact.schema.schema);
          assert.notEqual(createReportSnapshotChecksum(artifact.schema), createReportSnapshotChecksum(live.schema));
          assert.equal(artifact.manifest.domainFingerprint, live.domain);
        }
        artifact.manifest.fingerprint = dto.fingerprint;
        artifact.manifest.tables = (artifact.tables as DatabaseTableSnapshot[]).map(table => ({ table: table.table, count: table.rows.length }));
        artifact.manifest.tablesSha256 = backupSha256(JSON.stringify(artifact.tables));
        artifact.manifest.schemaManifestHash = createReportSnapshotChecksum(artifact.schema);
        const bytes = Buffer.from(JSON.stringify(artifact));
        await fs.writeFile(file, bytes);
        await prisma.termRollover.update({ where: { id }, data: {
          backupManifest: artifact.manifest, backupChecksum: backupSha256(bytes),
          backupSizeBytes: bytes.length, backupFingerprint: dto.fingerprint,
        } });

        // Prove this is not a byte/size/stored-manifest or internal hash mismatch.
        const rebound = await row();
        assert.equal(rebound.status, 'READY');
        assert.equal(rebound.preflightHash, dto.fingerprint);
        assert.equal(rebound.backupFingerprint, dto.fingerprint);
        assert.equal(rebound.approvedFingerprint, dto.fingerprint);
        assert.equal(rebound.backupChecksum, backupSha256(await getRolloverBackupStore().read(rebound.backupReference!)));
        assert.equal(rebound.backupSizeBytes?.toString(), String(bytes.length));
        assert.deepEqual(rebound.backupManifest, artifact.manifest);
        assert.equal(artifact.manifest.tablesSha256, backupSha256(JSON.stringify(artifact.tables)));
        assert.equal(artifact.manifest.domainFingerprint, rolloverDomainFingerprint(artifact.tables));
        assert.equal(artifact.schema.schemaSha256, backupSha256(artifact.schema.schema));
        assert.equal(artifact.manifest.schemaManifestHash, createReportSnapshotChecksum(artifact.schema));
        if (damage === 'schema') {
          assert.equal(createReportSnapshotChecksum({ version: 1, domain: artifact.manifest.domainFingerprint, issues: dto.issues }), dto.fingerprint);
        }
        for (const migration of artifact.schema.migrations as Array<{ sql: string; sha256: string }>) {
          assert.equal(migration.sha256, backupSha256(migration.sql));
        }
        assert.equal((await preflightTermRollover(id, admin.id)).fingerprint, dto.fingerprint);
        await rejectsCode(verifyTermRolloverBackup(id, dto.fingerprint, admin.id), 'BACKUP_VERIFICATION_FAILED');
        const persisted = await assertCleared();
        assert.equal(persisted.preflightHash, dto.fingerprint);
        assert.equal(persisted.backupReference, null);
        assert.equal(persisted.backupManifest, null);
        assert.equal(persisted.backupChecksum, null);
        assert.equal(persisted.backupFingerprint, null);
        assert.equal(persisted.backupVerifiedAt, null);
        assert.equal(persisted.backupVerifiedByUserId, null);
        await rejectsCode(approveTermRollover(id, dto.fingerprint, admin.id), 'READINESS_EVIDENCE_REQUIRED');
        await assertCleared();
      } finally {
        await fs.writeFile(file, originalBytes);
        // Restore metadata only if verification failed to clear the original
        // reference; a successful invalidation must remain durable.
        await prisma.termRollover.updateMany({ where: { id, backupReference: original.backupReference }, data: {
          backupManifest: JSON.parse(originalBytes.toString()).manifest,
          backupChecksum: original.backupChecksum, backupSizeBytes: original.backupSizeBytes,
          backupFingerprint: original.backupFingerprint,
        } });
      }
    });
  }

  await t.test('evaluation failure on changed source lifecycle durably invalidates previous approval', async () => {
    const dto = await approved();
    await prisma.academicTerm.update({ where: { id: source.id }, data: { status: 'CLOSED' } });
    try {
      await rejectsCode(approveTermRollover(id, dto.fingerprint, admin.id), 'READINESS_FAILED');
      const persisted = await assertCleared();
      assert.equal(persisted.preflightHash, null);
      assert.equal(persisted.preflightSnapshot, null);
      assert.equal(persisted.backupReference, null);
      assert.equal(persisted.warningAcknowledgements, null);
      assert.ok(await prisma.termRolloverEvent.findFirst({ where: { rolloverId: id, type: 'READINESS_INVALIDATED' } }));
    } finally {
      await prisma.academicTerm.update({ where: { id: source.id }, data: { status: 'CLOSING' } });
    }
  });

  await t.test('SQL constraints reject missing/null/partial evidence and mismatched fingerprints on READY', async sqlTest => {
    // No service mocks: each statement is checked by the actual migrated PostgreSQL constraints.
    await assert.rejects(prisma.$executeRaw`UPDATE "term_rollovers" SET status = 'READY' WHERE id = ${id}`, /check constraint/i);
    const dto = await approved();
    const assignments = [
      '"preflightHash" = NULL', '"preflightSnapshot" = NULL', '"preflightSnapshot" = \'null\'::jsonb',
      '"preflightSnapshot" = \'{}\'::jsonb', '"preflightGeneratedAt" = NULL', '"warningHash" = NULL',
      '"warningAcknowledgementHash" = NULL', '"warningAcknowledgedFingerprint" = NULL',
      '"warningAcknowledgements" = NULL', '"warningAcknowledgements" = \'null\'::jsonb',
      '"warningAcknowledgedByUserId" = NULL', '"warningAcknowledgedAt" = NULL',
      '"backupReference" = NULL', '"backupChecksum" = NULL', '"backupManifest" = NULL',
      '"backupManifest" = \'null\'::jsonb', '"backupSizeBytes" = NULL', '"backupCreatedAt" = NULL',
      '"backupFingerprint" = NULL', '"backupVerifiedAt" = NULL', '"backupVerifiedByUserId" = NULL',
      '"approvedFingerprint" = NULL', '"approvedByUserId" = NULL', '"approvedAt" = NULL',
      `"approvedFingerprint" = '${'0'.repeat(64)}'`,
      '"preflightSnapshot" = jsonb_set("preflightSnapshot", \'{summary,blockerCount}\', \'1\')',
    ];
    for (const assignment of assignments) {
      await sqlTest.test(assignment, async () => {
        // Even a constraint defect must not poison the shared legitimate fixture.
        await assert.rejects(prisma.$transaction(async tx => {
          await tx.$executeRawUnsafe(`UPDATE "term_rollovers" SET ${assignment} WHERE id = $1`, id);
          throw new Error(`UNSAFE_SQL_ACCEPTED: ${assignment}`);
        }), /check constraint/i, assignment);
      });
    }
    assert.equal((await row()).approvedFingerprint, dto.fingerprint);
    assert.equal((await row()).status, 'READY');
  });

  await t.test('unreconciled fee counter is a finance blocker, not an acknowledgeable unpaid warning', async () => {
    const fee = await prisma.studentFeeStructure.findUniqueOrThrow({ where: { studentId_feeTemplateId_academicTermId: { studentId: student.id, feeTemplateId: template.id, academicTermId: source.id } } });
    await prisma.studentFeeStructure.update({ where: { id: fee.id }, data: { amountPaid: 1 } });
    try {
      const dto = await preflightTermRollover(id);
      assert.ok(dto.issues.some(item => item.code === 'FINANCE_FEE_COUNTER_MISMATCH' && item.severity === 'BLOCKER'), JSON.stringify(dto.issues));
      await acknowledge(dto);
      await rejectsCode(approveTermRollover(id, dto.fingerprint, admin.id), 'READINESS_EVIDENCE_REQUIRED');
      await rejectsCode(backupTermRollover(id, dto.fingerprint, admin.id), 'PREFLIGHT_BLOCKED');
      await assertCleared();
    } finally {
      await prisma.studentFeeStructure.update({ where: { id: fee.id }, data: { amountPaid: 0 } });
    }
  });

  await t.test('same-fingerprint concurrent preflights and approvals serialize with durable evidence', async () => {
    const dto = await verified();
    const preflights = await Promise.all([preflightTermRollover(id, admin.id), preflightTermRollover(id, admin.id)]);
    assert.ok(preflights.every(item => item.fingerprint === dto.fingerprint));
    const results = await Promise.all([approveTermRollover(id, dto.fingerprint, admin.id), approveTermRollover(id, dto.fingerprint, admin.id)]);
    assert.ok(results.every(item => item.evidence.approved));
    const events = await prisma.termRolloverEvent.findMany({ where: { rolloverId: id }, orderBy: { sequence: 'asc' } });
    assert.equal(new Set(events.map(item => item.sequence)).size, events.length);
    assert.ok(events.every((item, index) => item.sequence === index + 1));
    assert.equal((await row()).status, 'READY');
  });

  await t.test('production refuses filesystem backup and clears prior approval', async () => {
    const dto = await approved();
    process.env.NODE_ENV = 'production';
    try { await rejectsCode(backupTermRollover(id, dto.fingerprint, admin.id), 'BACKUP_CREATION_FAILED'); }
    finally { process.env.NODE_ENV = 'test'; }
    assert.equal((await assertCleared()).backupReference, null);
  });

  await t.test('actual app readiness routes enforce authentication, role, payload, CORS and full approval flow', async () => {
    process.env.JWT_SECRET = 'phase9-http-acceptance-test-only';
    const { default: app } = await import('../src/app');
    const server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      assert.ok(address && typeof address !== 'string');
      assert.notEqual(address.port, 4400);
      const base = `http://127.0.0.1:${address.port}/api/v1/term-rollovers/${id}`;
      const token = (userId: string, role: string) => jwt.sign({ userId, role, branchId: branch.id }, process.env.JWT_SECRET!, { expiresIn: '5m' });
      const headers = { Authorization: `Bearer ${token(admin.id, 'SUPER_ADMIN')}`, 'Content-Type': 'application/json' };
      const endpoints = [['POST', 'preflight'], ['PUT', 'warning-acknowledgements'], ['POST', 'backup'], ['POST', 'verify-backup'], ['POST', 'approve']];
      for (const [method, endpoint] of endpoints) {
        assert.equal((await fetch(`${base}/${endpoint}`, { method })).status, 401);
        assert.equal((await fetch(`${base}/${endpoint}`, { method, headers: { Authorization: `Bearer ${token(teacher.id, 'TEACHER')}` } })).status, 403);
        const cors = await fetch(`${base}/${endpoint}`, { method: 'OPTIONS', headers: { Origin: 'https://phase9.example.invalid', 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization,content-type' } });
        assert.equal(cors.status, 204);
        assert.ok((cors.headers.get('access-control-allow-methods') ?? '').includes(method));
        assert.match(cors.headers.get('access-control-allow-headers') ?? '', /Authorization/i);
        assert.equal(cors.headers.get('access-control-allow-origin'), '*');
      }
      const call = async (endpoint: string, method = 'POST', payload?: unknown) => {
        const result = await fetch(`${base}/${endpoint}`, { method, headers, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
        const body = await result.json() as RolloverReadinessDTO & { code?: string };
        return { status: result.status, body };
      };
      assert.equal((await call('approve', 'POST', {})).status, 400);
      assert.equal((await call('backup', 'POST', { expectedFingerprint: 'bad' })).status, 400);
      const dto = (await call('preflight')).body;
      assert.equal((await call('preflight', 'GET')).body.fingerprint, dto.fingerprint);
      assert.equal((await call('approve', 'POST', { expectedFingerprint: dto.fingerprint })).status, 409);
      const warnings = dto.issues.filter(item => item.severity === 'WARNING').map(item => ({ warningId: item.id, reason: 'Debt reviewed via authenticated API' }));
      assert.equal((await call('warning-acknowledgements', 'PUT', { expectedFingerprint: dto.fingerprint, acknowledgements: warnings })).status, 200);
      assert.equal((await call('backup', 'POST', { expectedFingerprint: dto.fingerprint })).status, 200);
      assert.equal((await call('verify-backup', 'POST', { expectedFingerprint: dto.fingerprint })).status, 200);
      const result = await call('approve', 'POST', { expectedFingerprint: dto.fingerprint });
      assert.equal(result.status, 200);
      assert.equal(result.body.evidence.approved, true);
      assert.equal((await row()).status, 'READY');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});