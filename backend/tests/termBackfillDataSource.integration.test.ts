import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { AcademicTermStatus } from '@prisma/client';
import {
  applyTermBackfillReport,
  loadTermBackfillData,
} from '../src/services/termBackfillDataSource';
import { planTermBackfill } from '../src/services/termBackfillPlanner';
import { prisma } from '../src/utils/prisma';

const databaseUrl = process.env.DATABASE_URL ?? '';
const expectedSchema = 'schema=term_backfill_test';
const prefix = `Term backfill integration ${Date.now()}`;

const cleanup = async (): Promise<void> => {
  await prisma.studentTermReport.deleteMany();
  await prisma.studentTermEnrollment.deleteMany();
  await prisma.classMovementLog.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
  await prisma.classCohort.deleteMany();
  await prisma.schoolSettings.deleteMany();
  await prisma.academicTerm.deleteMany();
  await prisma.academicYear.deleteMany();
  await prisma.user.deleteMany();
  await prisma.branch.deleteMany();
};

after(async () => {
  await prisma.$disconnect();
});

test('dry-run, atomic apply, and rerun are deterministic on PostgreSQL', async t => {
  assert.ok(
    databaseUrl.includes(expectedSchema),
    `Refusing backfill integration test without an isolated ${expectedSchema} database URL`,
  );

  await cleanup();
  t.after(cleanup);

  const branch = await prisma.branch.create({
    data: {
      name: `${prefix} branch`,
      code: `TB${Date.now()}`,
      isMain: true,
    },
  });
  const teacher = await prisma.user.create({
    data: {
      email: `term-backfill-${Date.now()}@example.test`,
      passwordHash: 'not-used-in-integration-test',
      fullName: `${prefix} teacher`,
      role: 'TEACHER',
      branchId: branch.id,
    },
  });
  const year = await prisma.academicYear.create({
    data: {
      name: `${prefix} year`,
      startDate: new Date('2032-01-01T00:00:00.000Z'),
      endDate: new Date('2032-12-31T23:59:59.999Z'),
      termCount: 3,
    },
  });
  const terms = await Promise.all([
    prisma.academicTerm.create({
      data: {
        name: `${prefix} term 1`,
        startDate: new Date('2032-01-05T00:00:00.000Z'),
        endDate: new Date('2032-03-25T00:00:00.000Z'),
        status: AcademicTermStatus.CLOSED,
        isActive: false,
      },
    }),
    prisma.academicTerm.create({
      data: {
        name: `${prefix} term 2`,
        startDate: new Date('2032-04-12T00:00:00.000Z'),
        endDate: new Date('2032-06-25T00:00:00.000Z'),
        status: AcademicTermStatus.CLOSED,
        isActive: false,
      },
    }),
    prisma.academicTerm.create({
      data: {
        name: `${prefix} term 3`,
        startDate: new Date('2032-07-12T00:00:00.000Z'),
        endDate: new Date('2032-09-24T00:00:00.000Z'),
        status: AcademicTermStatus.ACTIVE,
        isActive: true,
      },
    }),
  ]);
  await prisma.schoolSettings.create({ data: { currentTermId: terms[2].id } });

  const classes = await Promise.all(terms.map(termRecord => prisma.class.create({
    data: {
      name: 'Form 1A',
      gradeLevel: 1,
      teacherId: teacher.id,
      academicTermId: termRecord.id,
      branchId: branch.id,
    },
  })));
  const student = await prisma.student.create({
    data: {
      admissionNumber: `TB-${Date.now()}`,
      firstName: 'Backfill',
      lastName: 'Student',
      dateOfBirth: new Date('2020-01-01T00:00:00.000Z'),
      gender: 'FEMALE',
      classId: classes[2].id,
      branchId: branch.id,
    },
  });
  await Promise.all([
    prisma.studentTermReport.create({
      data: {
        studentId: student.id,
        termId: terms[0].id,
        classId: classes[0].id,
        createdAt: new Date('2032-03-20T00:00:00.000Z'),
        updatedAt: new Date('2032-03-20T00:00:00.000Z'),
      },
    }),
    prisma.studentTermReport.create({
      data: {
        studentId: student.id,
        termId: terms[1].id,
        classId: classes[1].id,
        createdAt: new Date('2032-06-20T00:00:00.000Z'),
        updatedAt: new Date('2032-06-20T00:00:00.000Z'),
      },
    }),
  ]);

  const loaded = await loadTermBackfillData(prisma);
  const report = planTermBackfill(loaded.input, {
    generatedAt: '2032-10-01T00:00:00.000Z',
  });

  assert.equal(report.canApply, true);
  assert.equal(report.summary.blockers, 0);
  assert.deepEqual(report.summary.proposals, {
    academicYearsToCreate: 0,
    termsToUpdate: 3,
    cohortsToCreate: 1,
    cohortsToUpdate: 0,
    classesToLink: 3,
    enrollmentsToCreate: 3,
    enrollmentsToUpdate: 0,
  });

  await prisma.academicTerm.update({
    where: { id: terms[0].id },
    data: { name: `${terms[0].name} changed after planning` },
  });
  await assert.rejects(
    applyTermBackfillReport(prisma, report, loaded.snapshotFingerprint),
    /source data changed after planning/,
  );
  assert.equal(await prisma.classCohort.count(), 0);
  assert.equal(
    await prisma.academicTerm.count({ where: { academicYearId: { not: null } } }),
    0,
  );
  await prisma.academicTerm.update({
    where: { id: terms[0].id },
    data: { name: terms[0].name },
  });

  const result = await applyTermBackfillReport(
    prisma,
    report,
    loaded.snapshotFingerprint,
  );
  assert.deepEqual(result.counts, report.summary.proposals);

  const persistedTerms = await prisma.academicTerm.findMany({
    where: { id: { in: terms.map(termRecord => termRecord.id) } },
    orderBy: { sequence: 'asc' },
  });
  assert.deepEqual(persistedTerms.map(termRecord => termRecord.sequence), [1, 2, 3]);
  assert.ok(persistedTerms.every(termRecord => termRecord.academicYearId === year.id));

  const persistedClasses = await prisma.class.findMany({
    where: { id: { in: classes.map(classRecord => classRecord.id) } },
  });
  const cohortIds = new Set(persistedClasses.map(classRecord => classRecord.classCohortId));
  assert.equal(cohortIds.size, 1);
  assert.ok(!cohortIds.has(null));

  const persistedEnrollments = await prisma.studentTermEnrollment.findMany({
    where: { studentId: student.id },
    include: { academicTerm: true },
  });
  persistedEnrollments.sort((left, right) => (
    (left.academicTerm.sequence ?? 0) - (right.academicTerm.sequence ?? 0)
  ));
  assert.equal(persistedEnrollments.length, 3);
  assert.equal(persistedEnrollments[0].sourceEnrollmentId, null);
  assert.equal(persistedEnrollments[1].sourceEnrollmentId, persistedEnrollments[0].id);
  assert.equal(persistedEnrollments[2].sourceEnrollmentId, persistedEnrollments[1].id);
  assert.equal(persistedEnrollments[1].transitionAction, 'CARRY_FORWARD');
  assert.equal(persistedEnrollments[2].status, 'ACTIVE');

  const rerunData = await loadTermBackfillData(prisma);
  const rerun = planTermBackfill(rerunData.input, {
    generatedAt: '2032-10-02T00:00:00.000Z',
  });
  assert.equal(rerun.canApply, true);
  assert.equal(rerun.summary.blockers, 0);
  assert.equal(
    Object.values(rerun.summary.proposals).reduce((total, count) => total + count, 0),
    0,
  );
});
