import assert from 'node:assert/strict';
import http from 'node:http';
import { after, test } from 'node:test';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/utils/prisma';
import {
  getTermRolloverEnrollmentPlan,
  saveYearEndTransitionDecisions,
  stageTermRolloverEnrollments,
  TermRolloverEnrollmentError,
  validateTermRolloverEnrollments,
} from '../src/services/termRolloverEnrollmentService';
import {
  createTermRollover,
  planTermRollover,
  prepareTermRollover,
  validateTermRolloverPreparation,
} from '../src/services/termRolloverPreparationService';

const databaseUrl = process.env.DATABASE_URL ?? '';
const expectedSchema = 'schema=term_rollover_enrollment_test';

const clearIsolatedSchema = async () => {
  await prisma.$executeRawUnsafe(`
    DO $$
    DECLARE table_record RECORD;
    BEGIN
      FOR table_record IN
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = current_schema()
          AND tablename <> '_prisma_migrations'
      LOOP
        EXECUTE format('TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE', current_schema(), table_record.tablename);
      END LOOP;
    END $$;
  `);
};

const sourcePlacementSnapshot = async (termId: string) => JSON.parse(JSON.stringify({
  enrollments: await prisma.studentTermEnrollment.findMany({
    where: { academicTermId: termId },
    orderBy: { id: 'asc' },
  }),
  students: await prisma.student.findMany({
    where: { termEnrollments: { some: { academicTermId: termId } } },
    select: { id: true, classId: true, status: true, branchId: true },
    orderBy: { id: 'asc' },
  }),
}));

const prohibitedTargetActivity = async (termId: string) => {
  const classes = await prisma.class.findMany({
    where: { academicTermId: termId },
    select: { id: true },
  });
  const classIds = classes.map(item => item.id);
  const assessments = await prisma.assessment.findMany({
    where: { termId },
    select: { id: true },
  });
  const assessmentIds = assessments.map(item => item.id);
  const counts = await Promise.all([
    prisma.attendance.count({ where: { academicTermId: termId } }),
    prisma.attendanceAlert.count({ where: { academicTermId: termId } }),
    prisma.assessment.count({ where: { termId } }),
    assessmentIds.length ? prisma.assessmentResult.count({ where: { assessmentId: { in: assessmentIds } } }) : 0,
    prisma.termResult.count({ where: { termId } }),
    prisma.studentTermReport.count({ where: { termId } }),
    prisma.studentFeeStructure.count({ where: { academicTermId: termId } }),
    prisma.invoice.count({ where: { termId } }),
    prisma.payment.count({ where: { academicTermId: termId } }),
    prisma.termFinancialSummary.count({ where: { academicTermId: termId } }),
    prisma.debtCollectionCampaign.count({ where: { academicTermId: termId } }),
    classIds.length ? prisma.topicProgress.count({ where: { classId: { in: classIds } } }) : 0,
    classIds.length ? prisma.virtualClassroom.count({ where: { classId: { in: classIds } } }) : 0,
  ]);
  return counts.reduce((sum, value) => sum + value, 0);
};

const prepare = async (
  input: Parameters<typeof createTermRollover>[0],
) => {
  const created = await createTermRollover(input);
  const plan = await planTermRollover(created.rollover.id);
  assert.equal(plan.canPrepare, true, JSON.stringify(plan.issues));
  await prepareTermRollover(created.rollover.id, plan.inputHash, input.actorUserId);
  return created.rollover.id;
};

after(async () => {
  await prisma.$disconnect();
});

test('Phase 8 stages deterministic within-year and complete year-end outcomes without changing current placement', async () => {
  assert.ok(
    databaseUrl.includes(expectedSchema),
    `Refusing Phase 8 integration test without an isolated ${expectedSchema} database URL`,
  );
  await clearIsolatedSchema();

  const branch = await prisma.branch.create({
    data: { name: 'Phase 8 Main', code: 'PHASE8-MAIN', isMain: true },
  });
  const [administrator, teacher] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'phase8-admin@example.invalid',
        passwordHash: 'integration-test-only',
        fullName: 'Phase 8 Administrator',
        role: 'SUPER_ADMIN',
        branchId: branch.id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'phase8-teacher@example.invalid',
        passwordHash: 'integration-test-only',
        fullName: 'Phase 8 Teacher',
        role: 'TEACHER',
        branchId: branch.id,
      },
    }),
  ]);

  const sourceYear = await prisma.academicYear.create({
    data: {
      name: '2044 Academic Year',
      startDate: new Date('2044-01-01T00:00:00.000Z'),
      endDate: new Date('2044-12-31T00:00:00.000Z'),
      termCount: 3,
      status: 'ACTIVE',
    },
  });
  const [withinSourceTerm, withinTargetTerm, yearEndSourceTerm] = await Promise.all([
    prisma.academicTerm.create({
      data: {
        name: '2044 Term 1',
        startDate: new Date('2044-01-01T00:00:00.000Z'),
        endDate: new Date('2044-03-31T00:00:00.000Z'),
        academicYearId: sourceYear.id,
        sequence: 1,
        status: 'CLOSING',
      },
    }),
    prisma.academicTerm.create({
      data: {
        name: '2044 Term 2',
        startDate: new Date('2044-04-01T00:00:00.000Z'),
        endDate: new Date('2044-06-30T00:00:00.000Z'),
        academicYearId: sourceYear.id,
        sequence: 2,
        status: 'DRAFT',
      },
    }),
    prisma.academicTerm.create({
      data: {
        name: '2044 Term 3',
        startDate: new Date('2044-09-01T00:00:00.000Z'),
        endDate: new Date('2044-12-20T00:00:00.000Z'),
        academicYearId: sourceYear.id,
        sequence: 3,
        status: 'CLOSING',
      },
    }),
  ]);

  const withinCohort = await prisma.classCohort.create({
    data: {
      academicYearId: sourceYear.id,
      name: 'Grade 5A',
      gradeLevel: 5,
      branchId: branch.id,
    },
  });
  const withinSourceClass = await prisma.class.create({
    data: {
      name: 'Grade 5A',
      gradeLevel: 5,
      teacherId: teacher.id,
      academicTermId: withinSourceTerm.id,
      classCohortId: withinCohort.id,
      branchId: branch.id,
    },
  });
  const withinStudents = await Promise.all([
    prisma.student.create({
      data: {
        admissionNumber: 'PHASE8-WITHIN-1',
        firstName: 'Within',
        lastName: 'One',
        dateOfBirth: new Date('2033-01-01T00:00:00.000Z'),
        gender: 'FEMALE',
        classId: withinSourceClass.id,
        branchId: branch.id,
      },
    }),
    prisma.student.create({
      data: {
        admissionNumber: 'PHASE8-WITHIN-2',
        firstName: 'Within',
        lastName: 'Two',
        dateOfBirth: new Date('2033-02-01T00:00:00.000Z'),
        gender: 'MALE',
        classId: withinSourceClass.id,
        branchId: branch.id,
      },
    }),
  ]);
  await prisma.studentTermEnrollment.createMany({
    data: withinStudents.map(student => ({
      studentId: student.id,
      academicTermId: withinSourceTerm.id,
      classId: withinSourceClass.id,
      status: 'ACTIVE' as const,
      startsAt: withinSourceTerm.startDate,
    })),
  });

  const withinRolloverId = await prepare({
    sourceTermId: withinSourceTerm.id,
    targetTermId: withinTargetTerm.id,
    transitionType: 'WITHIN_YEAR',
    idempotencyKey: 'phase8-within-year-enrollment-staging',
    actorUserId: administrator.id,
    configuration: { copyCategories: [] },
  });
  const withinSourceBefore = await sourcePlacementSnapshot(withinSourceTerm.id);
  const withinPlan = await getTermRolloverEnrollmentPlan(withinRolloverId);
  assert.equal(withinPlan.summary.eligibleCount, 2);
  assert.equal(withinPlan.summary.missingDecisionCount, 0);
  assert.equal(withinPlan.canStage, true, JSON.stringify(withinPlan.issues));
  assert.ok(withinPlan.outcomes.every(outcome => (
    outcome.action === 'CARRY_FORWARD'
    && outcome.state === 'READY_TO_STAGE'
    && outcome.targetOptions.length === 1
  )));

  const [withinStagedA, withinStagedB] = await Promise.all([
    stageTermRolloverEnrollments(withinRolloverId, withinPlan.inputHash, administrator.id),
    stageTermRolloverEnrollments(withinRolloverId, withinPlan.inputHash, administrator.id),
  ]);
  assert.equal(withinStagedA.plan.staged, true);
  assert.equal(withinStagedB.plan.staged, true);
  assert.ok(withinStagedA.reused || withinStagedB.reused);

  const firstWithinEnrollments = await prisma.studentTermEnrollment.findMany({
    where: { academicTermId: withinTargetTerm.id },
    orderBy: { studentId: 'asc' },
  });
  assert.equal(firstWithinEnrollments.length, 2);
  assert.ok(firstWithinEnrollments.every(enrollment => (
    enrollment.status === 'STAGED'
    && enrollment.transitionAction === 'CARRY_FORWARD'
    && Boolean(enrollment.sourceEnrollmentId)
  )));
  const withinIds = firstWithinEnrollments.map(enrollment => enrollment.id);
  const withinRetryPlan = await getTermRolloverEnrollmentPlan(withinRolloverId);
  const withinRetry = await stageTermRolloverEnrollments(
    withinRolloverId,
    withinRetryPlan.inputHash,
    administrator.id,
  );
  assert.equal(withinRetry.reused, true);
  assert.deepEqual(
    (await prisma.studentTermEnrollment.findMany({
      where: { academicTermId: withinTargetTerm.id },
      orderBy: { studentId: 'asc' },
    })).map(enrollment => enrollment.id),
    withinIds,
  );
  assert.deepEqual(await sourcePlacementSnapshot(withinSourceTerm.id), withinSourceBefore);
  assert.ok((await prisma.student.findMany({
    where: { id: { in: withinStudents.map(student => student.id) } },
  })).every(student => student.classId === withinSourceClass.id));
  assert.equal(await prohibitedTargetActivity(withinTargetTerm.id), 0);
  const withinValidation = await validateTermRolloverEnrollments(withinRolloverId);
  assert.equal(withinValidation.valid, true, JSON.stringify(withinValidation.issues));
  const withinPreparationValidation = await validateTermRolloverPreparation(withinRolloverId);
  assert.equal(withinPreparationValidation.valid, true);
  assert.equal(withinPreparationValidation.operationalActivity.total, 0);
  assert.equal(withinPreparationValidation.operationalActivity.counts.allowedStagedEnrollments, 2);

  await assert.rejects(
    prisma.studentTransitionDecision.update({
      where: {
        rolloverId_studentId: {
          rolloverId: withinRolloverId,
          studentId: withinStudents[0].id,
        },
      },
      data: { action: 'PROMOTE' },
    }),
    /within-year rollover decisions must carry forward/i,
  );

  const targetYear = await prisma.academicYear.create({
    data: {
      name: '2045 Academic Year',
      startDate: new Date('2045-01-01T00:00:00.000Z'),
      endDate: new Date('2045-12-31T00:00:00.000Z'),
      termCount: 3,
      status: 'DRAFT',
    },
  });
  const yearEndTargetTerm = await prisma.academicTerm.create({
    data: {
      name: '2045 Term 1',
      startDate: new Date('2045-01-01T00:00:00.000Z'),
      endDate: new Date('2045-03-31T00:00:00.000Z'),
      academicYearId: targetYear.id,
      sequence: 1,
      status: 'DRAFT',
    },
  });
  const [grade5Cohort, grade6Cohort] = await Promise.all([
    prisma.classCohort.create({
      data: {
        academicYearId: sourceYear.id,
        name: 'Year-end Grade 5A',
        gradeLevel: 5,
        branchId: branch.id,
      },
    }),
    prisma.classCohort.create({
      data: {
        academicYearId: sourceYear.id,
        name: 'Year-end Grade 6A',
        gradeLevel: 6,
        branchId: branch.id,
      },
    }),
  ]);
  const [grade5SourceClass, grade6SourceClass] = await Promise.all([
    prisma.class.create({
      data: {
        name: 'Year-end Grade 5A',
        gradeLevel: 5,
        teacherId: teacher.id,
        academicTermId: yearEndSourceTerm.id,
        classCohortId: grade5Cohort.id,
        branchId: branch.id,
      },
    }),
    prisma.class.create({
      data: {
        name: 'Year-end Grade 6A',
        gradeLevel: 6,
        teacherId: teacher.id,
        academicTermId: yearEndSourceTerm.id,
        classCohortId: grade6Cohort.id,
        branchId: branch.id,
      },
    }),
  ]);

  const yearEndStudents = await Promise.all([
    ['PROMOTE', 'Promote'],
    ['RETAIN', 'Retain'],
    ['GRADUATE', 'Graduate'],
    ['TRANSFER', 'Transfer'],
    ['WITHDRAW', 'Withdraw'],
  ].map(([code, lastName], index) => prisma.student.create({
    data: {
      admissionNumber: `PHASE8-YEAR-${code}`,
      firstName: 'YearEnd',
      lastName,
      dateOfBirth: new Date(`2032-0${index + 1}-01T00:00:00.000Z`),
      gender: index % 2 ? 'MALE' : 'FEMALE',
      classId: grade6SourceClass.id,
      branchId: branch.id,
    },
  })));
  await prisma.studentTermEnrollment.createMany({
    data: yearEndStudents.map(student => ({
      studentId: student.id,
      academicTermId: yearEndSourceTerm.id,
      classId: grade6SourceClass.id,
      status: 'ACTIVE' as const,
      startsAt: yearEndSourceTerm.startDate,
    })),
  });

  const yearEndRolloverId = await prepare({
    sourceTermId: yearEndSourceTerm.id,
    targetTermId: yearEndTargetTerm.id,
    transitionType: 'YEAR_END',
    idempotencyKey: 'phase8-year-end-enrollment-staging',
    actorUserId: administrator.id,
    configuration: {
      copyCategories: [],
      yearEndMappings: [
        { sourceCohortId: grade5Cohort.id, targetName: '2045 Grade 6A', targetGradeLevel: 6 },
        { sourceCohortId: grade6Cohort.id, targetName: '2045 Grade 7A', targetGradeLevel: 7 },
      ],
    },
  });
  const yearEndSourceBefore = await sourcePlacementSnapshot(yearEndSourceTerm.id);
  const missingPlan = await getTermRolloverEnrollmentPlan(yearEndRolloverId);
  assert.equal(missingPlan.summary.eligibleCount, 5);
  assert.equal(missingPlan.summary.missingDecisionCount, 5);
  assert.equal(missingPlan.canStage, false);
  assert.ok(missingPlan.issues.some(item => item.code === 'YEAR_END_DECISION_SET_INCOMPLETE'));

  const promoteOutcome = missingPlan.outcomes.find(outcome => outcome.studentId === yearEndStudents[0].id)!;
  const retainOutcome = missingPlan.outcomes.find(outcome => outcome.studentId === yearEndStudents[1].id)!;
  const promoteTargetId = promoteOutcome.targetOptions.find(option => option.actions.includes('PROMOTE'))?.id;
  const retainTargetId = retainOutcome.targetOptions.find(option => option.actions.includes('RETAIN'))?.id;
  assert.ok(promoteTargetId);
  assert.ok(retainTargetId);

  await assert.rejects(
    saveYearEndTransitionDecisions(
      yearEndRolloverId,
      [{ studentId: yearEndStudents[0].id, action: 'PROMOTE', targetClassId: retainTargetId }],
      missingPlan.inputHash,
      administrator.id,
    ),
    (error: unknown) => error instanceof TermRolloverEnrollmentError
      && error.code === 'INVALID_TRANSITION_DECISION',
  );

  const firstSave = await saveYearEndTransitionDecisions(
    yearEndRolloverId,
    [
      { studentId: yearEndStudents[0].id, action: 'PROMOTE', targetClassId: promoteTargetId },
      { studentId: yearEndStudents[1].id, action: 'RETAIN', targetClassId: retainTargetId, reason: 'Repeat the grade with targeted support' },
      { studentId: yearEndStudents[2].id, action: 'GRADUATE', reason: 'Programme completed' },
      { studentId: yearEndStudents[3].id, action: 'TRANSFER', reason: 'Transferring to another school' },
    ],
    missingPlan.inputHash,
    administrator.id,
  );
  assert.equal(firstSave.plan.summary.missingDecisionCount, 1);
  assert.equal(firstSave.plan.canStage, false);

  const completeSave = await saveYearEndTransitionDecisions(
    yearEndRolloverId,
    [
      { studentId: yearEndStudents[0].id, action: 'PROMOTE', targetClassId: promoteTargetId },
      { studentId: yearEndStudents[1].id, action: 'RETAIN', targetClassId: retainTargetId, reason: 'Repeat the grade with targeted support' },
      { studentId: yearEndStudents[2].id, action: 'GRADUATE', reason: 'Programme completed' },
      { studentId: yearEndStudents[3].id, action: 'TRANSFER', reason: 'Transferring to another school' },
      { studentId: yearEndStudents[4].id, action: 'WITHDRAW', reason: 'Leaving at guardian request' },
    ],
    firstSave.plan.inputHash,
    administrator.id,
  );
  assert.equal(completeSave.plan.summary.missingDecisionCount, 0);
  assert.equal(completeSave.plan.canStage, true, JSON.stringify(completeSave.plan.issues));

  const stagedYearEnd = await stageTermRolloverEnrollments(
    yearEndRolloverId,
    completeSave.plan.inputHash,
    administrator.id,
  );
  assert.equal(stagedYearEnd.plan.staged, true, JSON.stringify(stagedYearEnd.plan.issues));
  assert.equal(stagedYearEnd.plan.summary.completeOutcomeCount, 5);
  assert.equal(stagedYearEnd.plan.summary.stagedEnrollmentCount, 2);
  assert.equal(stagedYearEnd.plan.summary.terminalOutcomeCount, 3);

  const yearEndTargetEnrollments = await prisma.studentTermEnrollment.findMany({
    where: { academicTermId: yearEndTargetTerm.id },
    orderBy: { studentId: 'asc' },
  });
  assert.equal(yearEndTargetEnrollments.length, 2);
  assert.deepEqual(
    new Set(yearEndTargetEnrollments.map(enrollment => enrollment.transitionAction)),
    new Set(['PROMOTE', 'RETAIN']),
  );
  assert.ok(yearEndTargetEnrollments.every(enrollment => (
    enrollment.status === 'STAGED' && Boolean(enrollment.sourceEnrollmentId)
  )));
  assert.equal(await prisma.studentTransitionDecision.count({ where: { rolloverId: yearEndRolloverId } }), 5);
  assert.deepEqual(await sourcePlacementSnapshot(yearEndSourceTerm.id), yearEndSourceBefore);
  assert.ok((await prisma.student.findMany({
    where: { id: { in: yearEndStudents.map(student => student.id) } },
  })).every(student => student.classId === grade6SourceClass.id && student.status === 'ACTIVE'));
  assert.equal(await prohibitedTargetActivity(yearEndTargetTerm.id), 0);

  const yearEndValidation = await validateTermRolloverEnrollments(yearEndRolloverId);
  assert.equal(yearEndValidation.valid, true, JSON.stringify(yearEndValidation.issues));
  const retry = await stageTermRolloverEnrollments(
    yearEndRolloverId,
    stagedYearEnd.plan.inputHash,
    administrator.id,
  );
  assert.equal(retry.reused, true);
  assert.deepEqual(
    (await prisma.studentTermEnrollment.findMany({
      where: { academicTermId: yearEndTargetTerm.id },
      orderBy: { studentId: 'asc' },
    })).map(enrollment => enrollment.id),
    yearEndTargetEnrollments.map(enrollment => enrollment.id),
  );

  await assert.rejects(
    saveYearEndTransitionDecisions(
      yearEndRolloverId,
      [{ studentId: yearEndStudents[0].id, action: 'GRADUATE' }],
      retry.plan.inputHash,
      administrator.id,
    ),
    (error: unknown) => error instanceof TermRolloverEnrollmentError
      && error.code === 'ENROLLMENT_STAGING_LOCKED',
  );
  await assert.rejects(
    prisma.studentTransitionDecision.update({
      where: {
        rolloverId_studentId: {
          rolloverId: yearEndRolloverId,
          studentId: yearEndStudents[2].id,
        },
      },
      data: { targetClassId: promoteTargetId },
    }),
    /terminal rollover action graduate cannot have a target class/i,
  );
  await assert.rejects(
    prisma.studentTransitionDecision.update({
      where: {
        rolloverId_studentId: {
          rolloverId: yearEndRolloverId,
          studentId: yearEndStudents[0].id,
        },
      },
      data: { targetClassId: retainTargetId },
    }),
    /promotion target must be the approved next-grade successor cohort/i,
  );

  const changedSourceEnrollment = await prisma.studentTermEnrollment.findUniqueOrThrow({
    where: {
      studentId_academicTermId: {
        studentId: yearEndStudents[4].id,
        academicTermId: yearEndSourceTerm.id,
      },
    },
  });
  await prisma.studentTermEnrollment.update({
    where: { id: changedSourceEnrollment.id },
    data: { status: 'COMPLETED', endsAt: yearEndSourceTerm.endDate },
  });
  const staleValidation = await validateTermRolloverEnrollments(yearEndRolloverId);
  assert.equal(staleValidation.valid, false);
  assert.equal(staleValidation.sourceChanged, true);
  assert.ok(staleValidation.issues.some(item => item.code === 'INELIGIBLE_TRANSITION_DECISION'));
  assert.ok(staleValidation.issues.some(item => item.code === 'STAGED_SOURCE_CHANGED'));
  await prisma.studentTermEnrollment.update({
    where: { id: changedSourceEnrollment.id },
    data: { status: 'ACTIVE', endsAt: null },
  });
  assert.equal((await validateTermRolloverEnrollments(yearEndRolloverId)).valid, true);

  await prisma.academicTerm.update({
    where: { id: yearEndSourceTerm.id },
    data: { status: 'CLOSED' },
  });
  await assert.rejects(
    validateTermRolloverEnrollments(yearEndRolloverId),
    (error: unknown) => error instanceof TermRolloverEnrollmentError
      && error.code === 'SOURCE_TERM_NOT_ELIGIBLE',
  );
  await prisma.academicTerm.update({
    where: { id: yearEndSourceTerm.id },
    data: { status: 'CLOSING' },
  });

  await prisma.academicTerm.update({
    where: { id: yearEndTargetTerm.id },
    data: { status: 'ACTIVE', isActive: true },
  });
  await assert.rejects(
    validateTermRolloverEnrollments(yearEndRolloverId),
    (error: unknown) => error instanceof TermRolloverEnrollmentError
      && error.code === 'TARGET_TERM_NOT_DRAFT',
  );
  await prisma.academicTerm.update({
    where: { id: yearEndTargetTerm.id },
    data: { status: 'DRAFT', isActive: false },
  });
  assert.equal((await validateTermRolloverEnrollments(yearEndRolloverId)).valid, true);

  process.env.JWT_SECRET = 'phase-8-http-acceptance-secret';
  const { default: app } = await import('../src/app');
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1/term-rollovers`;
    const adminToken = jwt.sign(
      { userId: administrator.id, role: 'SUPER_ADMIN', branchId: branch.id },
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
    );
    const teacherToken = jwt.sign(
      { userId: teacher.id, role: 'TEACHER', branchId: branch.id },
      process.env.JWT_SECRET,
      { expiresIn: '5m' },
    );

    assert.equal((await fetch(`${baseUrl}/${yearEndRolloverId}/enrollment-plan`)).status, 401);
    assert.equal((await fetch(`${baseUrl}/${yearEndRolloverId}/enrollment-plan`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    })).status, 403);

    const adminHeaders = {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    };
    const planResponse = await fetch(`${baseUrl}/${yearEndRolloverId}/enrollment-plan`, {
      headers: adminHeaders,
    });
    assert.equal(planResponse.status, 200);
    const httpPlan = await planResponse.json() as { inputHash: string; staged: boolean };
    assert.equal(httpPlan.staged, true);

    const stageResponse = await fetch(`${baseUrl}/${yearEndRolloverId}/stage-enrollments`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ expectedInputHash: httpPlan.inputHash }),
    });
    assert.equal(stageResponse.status, 200);
    assert.equal((await stageResponse.json() as { reused: boolean }).reused, true);

    const validationResponse = await fetch(`${baseUrl}/${yearEndRolloverId}/enrollment-validation`, {
      headers: adminHeaders,
    });
    assert.equal(validationResponse.status, 200);
    assert.equal((await validationResponse.json() as { valid: boolean }).valid, true);

    const corsResponse = await fetch(`${baseUrl}/${yearEndRolloverId}/stage-enrollments`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://phase8.example.invalid',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });
    assert.equal(corsResponse.status, 204);
    assert.match(corsResponse.headers.get('access-control-allow-methods') ?? '', /POST/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }

  const finalRollover = await prisma.termRollover.findUniqueOrThrow({
    where: { id: yearEndRolloverId },
  });
  assert.equal(finalRollover.status, 'PREPARED');
  assert.equal(finalRollover.preflightHash, null);
  assert.equal(finalRollover.approvedAt, null);
  assert.equal(finalRollover.executedAt, null);
});
