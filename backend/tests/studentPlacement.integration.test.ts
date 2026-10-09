import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from '../src/utils/prisma';
import { getClasses } from '../src/controllers/classController';
import {
  getStudentPlacementForTerm,
  StudentPlacementError,
  upsertStudentPlacement,
} from '../src/services/studentPlacementService';
import {
  runTermWriteTransaction,
  TermLifecycleError,
} from '../src/services/termLifecycleService';

const databaseUrl = process.env.DATABASE_URL ?? '';
const expectedSchema = 'schema=student_placement_test';
const prefix = `Placement integration ${Date.now()}`;

const response = () => {
  const value: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return value;
};

after(async () => {
  await prisma.$disconnect();
});

test('term enrollment is the sole placement authority across lifecycle boundaries', async t => {
  assert.ok(
    databaseUrl.includes(expectedSchema),
    `Refusing placement integration test without an isolated ${expectedSchema} database URL`,
  );

  const branchA = await prisma.branch.create({
    data: { name: `${prefix} branch A`, code: `PA${Date.now()}`, isMain: true },
  });
  const branchB = await prisma.branch.create({
    data: { name: `${prefix} branch B`, code: `PB${Date.now()}` },
  });
  const teacher = await prisma.user.create({
    data: {
      email: `placement-${Date.now()}@example.test`,
      passwordHash: 'integration-test-only',
      fullName: `${prefix} teacher`,
      role: 'TEACHER',
      branchId: branchA.id,
    },
  });
  const historicalTerm = await prisma.academicTerm.create({
    data: {
      name: `${prefix} historical`,
      startDate: new Date('2035-01-01T00:00:00.000Z'),
      endDate: new Date('2035-03-31T00:00:00.000Z'),
      status: 'CLOSED',
      isActive: false,
    },
  });
  const activeTerm = await prisma.academicTerm.create({
    data: {
      name: `${prefix} active`,
      startDate: new Date('2035-04-01T00:00:00.000Z'),
      endDate: new Date('2035-06-30T00:00:00.000Z'),
      status: 'ACTIVE',
      isActive: true,
    },
  });
  const draftTerm = await prisma.academicTerm.create({
    data: {
      name: `${prefix} draft`,
      startDate: new Date('2035-07-01T00:00:00.000Z'),
      endDate: new Date('2035-09-30T00:00:00.000Z'),
      status: 'DRAFT',
      isActive: false,
    },
  });

  const historicalClass = await prisma.class.create({
    data: {
      name: `${prefix} historical class`,
      gradeLevel: 5,
      teacherId: teacher.id,
      academicTermId: historicalTerm.id,
      branchId: branchA.id,
    },
  });
  const activeClass = await prisma.class.create({
    data: {
      name: `${prefix} active class`,
      gradeLevel: 6,
      teacherId: teacher.id,
      academicTermId: activeTerm.id,
      branchId: branchA.id,
    },
  });
  const alternateActiveClass = await prisma.class.create({
    data: {
      name: `${prefix} alternate active class`,
      gradeLevel: 6,
      teacherId: teacher.id,
      academicTermId: activeTerm.id,
      branchId: branchA.id,
    },
  });
  const draftClass = await prisma.class.create({
    data: {
      name: `${prefix} draft class`,
      gradeLevel: 7,
      teacherId: teacher.id,
      academicTermId: draftTerm.id,
      branchId: branchA.id,
    },
  });
  const wrongBranchClass = await prisma.class.create({
    data: {
      name: `${prefix} wrong branch class`,
      gradeLevel: 6,
      teacherId: teacher.id,
      academicTermId: activeTerm.id,
      branchId: branchB.id,
    },
  });
  const student = await prisma.student.create({
    data: {
      admissionNumber: `PLACEMENT-${Date.now()}`,
      firstName: 'Placement',
      lastName: 'Student',
      dateOfBirth: new Date('2020-01-01T00:00:00.000Z'),
      gender: 'FEMALE',
      classId: activeClass.id,
      branchId: branchA.id,
    },
  });
  const otherStudent = await prisma.student.create({
    data: {
      admissionNumber: `PLACEMENT-OTHER-${Date.now()}`,
      firstName: 'Other',
      lastName: 'Student',
      dateOfBirth: new Date('2020-01-01T00:00:00.000Z'),
      gender: 'MALE',
      classId: activeClass.id,
      branchId: branchA.id,
    },
  });

  t.after(async () => {
    await prisma.classMovementLog.deleteMany({ where: { studentId: { in: [student.id, otherStudent.id] } } });
    await prisma.studentTermEnrollment.deleteMany({ where: { studentId: { in: [student.id, otherStudent.id] } } });
    await prisma.student.deleteMany({ where: { id: { in: [student.id, otherStudent.id] } } });
    await prisma.class.deleteMany({ where: { id: { in: [historicalClass.id, activeClass.id, alternateActiveClass.id, draftClass.id, wrongBranchClass.id] } } });
    await prisma.academicTerm.deleteMany({ where: { id: { in: [historicalTerm.id, activeTerm.id, draftTerm.id] } } });
    await prisma.user.delete({ where: { id: teacher.id } });
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } });
  });

  const missingTermResponse = response();
  await getClasses({ query: {}, user: { userId: teacher.id, role: 'SUPER_ADMIN', branchId: null } } as any, missingTermResponse);
  assert.equal(missingTermResponse.statusCode, 400);
  assert.equal(missingTermResponse.body.error, 'Academic term ID is required');

  const historicalEnrollment = await prisma.studentTermEnrollment.create({
    data: {
      studentId: student.id,
      academicTermId: historicalTerm.id,
      classId: historicalClass.id,
      status: 'COMPLETED',
      startsAt: historicalTerm.startDate,
      endsAt: historicalTerm.endDate,
    },
  });
  const historicalPlacement = await getStudentPlacementForTerm(student.id, historicalTerm.id);
  assert.equal(historicalPlacement?.classId, historicalClass.id);
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).classId, activeClass.id);

  await assert.rejects(
    prisma.studentTermEnrollment.create({
      data: {
        studentId: otherStudent.id,
        academicTermId: historicalTerm.id,
        classId: activeClass.id,
        status: 'COMPLETED',
        startsAt: historicalTerm.startDate,
      },
    }),
    (error: any) => error?.meta?.code === '23514'
      || String(error).includes('does not belong to academic term'),
  );

  await runTermWriteTransaction(draftTerm.id, 'SETUP', tx => upsertStudentPlacement(tx, {
    studentId: student.id,
    academicTermId: draftTerm.id,
    classId: draftClass.id,
    status: 'STAGED',
  }));
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).classId, activeClass.id);

  await runTermWriteTransaction(activeTerm.id, 'ACADEMIC_ACTIVITY', tx => upsertStudentPlacement(tx, {
    studentId: student.id,
    academicTermId: activeTerm.id,
    classId: alternateActiveClass.id,
    status: 'ACTIVE',
    sourceEnrollmentId: historicalEnrollment.id,
  }));
  assert.equal((await prisma.student.findUniqueOrThrow({ where: { id: student.id } })).classId, alternateActiveClass.id);
  assert.equal((await getStudentPlacementForTerm(student.id, activeTerm.id))?.classId, alternateActiveClass.id);
  assert.equal((await getStudentPlacementForTerm(student.id, historicalTerm.id))?.classId, historicalClass.id);

  await assert.rejects(
    prisma.$transaction(tx => upsertStudentPlacement(tx, {
      studentId: student.id,
      academicTermId: activeTerm.id,
      classId: draftClass.id,
    })),
    (error: unknown) => error instanceof StudentPlacementError && error.code === 'CLASS_TERM_MISMATCH',
  );

  await assert.rejects(
    prisma.$transaction(tx => upsertStudentPlacement(tx, {
      studentId: student.id,
      academicTermId: activeTerm.id,
      classId: wrongBranchClass.id,
    })),
    (error: unknown) => error instanceof StudentPlacementError && error.code === 'STUDENT_CLASS_BRANCH_MISMATCH',
  );

  await assert.rejects(
    prisma.$transaction(tx => upsertStudentPlacement(tx, {
      studentId: otherStudent.id,
      academicTermId: activeTerm.id,
      classId: activeClass.id,
      sourceEnrollmentId: historicalEnrollment.id,
    })),
    (error: unknown) => error instanceof StudentPlacementError && error.code === 'ENROLLMENT_LINEAGE_MISMATCH',
  );

  await assert.rejects(
    runTermWriteTransaction(historicalTerm.id, 'SETUP', tx => upsertStudentPlacement(tx, {
      studentId: student.id,
      academicTermId: historicalTerm.id,
      classId: historicalClass.id,
    })),
    (error: unknown) => error instanceof TermLifecycleError && error.code === 'TERM_WRITE_NOT_ALLOWED',
  );
});
