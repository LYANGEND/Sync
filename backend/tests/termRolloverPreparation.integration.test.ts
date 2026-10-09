import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from '../src/utils/prisma';
import {
  createTermRollover,
  planTermRollover,
  prepareTermRollover,
  TermRolloverError,
  updateTermRolloverConfiguration,
  validateTermRolloverPreparation,
} from '../src/services/termRolloverPreparationService';

const databaseUrl = process.env.DATABASE_URL ?? '';
const expectedSchema = 'schema=term_rollover_prep_test';

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

const targetOperationalCounts = async (termId: string) => {
  const classes = await prisma.class.findMany({
    where: { academicTermId: termId },
    select: { id: true },
  });
  const classIds = classes.map(classRecord => classRecord.id);
  const assessments = await prisma.assessment.findMany({
    where: { termId },
    select: { id: true },
  });
  const assessmentIds = assessments.map(assessment => assessment.id);

  const [
    enrollments,
    attendance,
    attendanceAlerts,
    assessmentResults,
    termResults,
    reports,
    topicProgress,
    homeworkSubmissions,
    feeObligations,
    invoices,
    payments,
    summaries,
    campaigns,
    campaignMessages,
    virtualClassrooms,
    riskAssessments,
    mastery,
  ] = await Promise.all([
    prisma.studentTermEnrollment.count({ where: { academicTermId: termId } }),
    prisma.attendance.count({ where: { academicTermId: termId } }),
    prisma.attendanceAlert.count({ where: { academicTermId: termId } }),
    assessmentIds.length === 0
      ? Promise.resolve(0)
      : prisma.assessmentResult.count({ where: { assessmentId: { in: assessmentIds } } }),
    prisma.termResult.count({ where: { termId } }),
    prisma.studentTermReport.count({ where: { termId } }),
    classIds.length === 0
      ? Promise.resolve(0)
      : prisma.topicProgress.count({ where: { classId: { in: classIds } } }),
    assessmentIds.length === 0
      ? Promise.resolve(0)
      : prisma.homeworkSubmission.count({ where: { assessmentId: { in: assessmentIds } } }),
    prisma.studentFeeStructure.count({ where: { academicTermId: termId } }),
    prisma.invoice.count({ where: { termId } }),
    prisma.payment.count({ where: { academicTermId: termId } }),
    prisma.termFinancialSummary.count({ where: { academicTermId: termId } }),
    prisma.debtCollectionCampaign.count({ where: { academicTermId: termId } }),
    prisma.campaignMessage.count({ where: { academicTermId: termId } }),
    classIds.length === 0
      ? Promise.resolve(0)
      : prisma.virtualClassroom.count({ where: { classId: { in: classIds } } }),
    prisma.studentRiskAssessment.count({ where: { termId } }),
    classIds.length === 0
      ? Promise.resolve(0)
      : prisma.learningObjectiveMastery.count({ where: { classId: { in: classIds } } }),
  ]);

  return {
    enrollments,
    attendance,
    attendanceAlerts,
    assessments: assessments.length,
    assessmentResults,
    termResults,
    reports,
    topicProgress,
    homeworkSubmissions,
    feeObligations,
    invoices,
    payments,
    summaries,
    campaigns,
    campaignMessages,
    virtualClassrooms,
    riskAssessments,
    mastery,
  };
};

const sourceSnapshot = async (termId: string) => {
  const [classes, feeTemplates, timetablePeriods, lessonPlans, enrollments, attendance, results, reports, payments] = await Promise.all([
    prisma.class.findMany({
      where: { academicTermId: termId },
      include: {
        subjects: { select: { id: true }, orderBy: { id: 'asc' } },
        teacherAssignments: { orderBy: { id: 'asc' } },
        classFeeAssignments: { orderBy: { id: 'asc' } },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.feeTemplate.findMany({ where: { academicTermId: termId }, orderBy: { id: 'asc' } }),
    prisma.timetablePeriod.findMany({
      where: { academicTermId: termId },
      include: { classes: { orderBy: { classId: 'asc' } } },
      orderBy: { id: 'asc' },
    }),
    prisma.lessonPlan.findMany({ where: { termId }, orderBy: { id: 'asc' } }),
    prisma.studentTermEnrollment.findMany({ where: { academicTermId: termId }, orderBy: { id: 'asc' } }),
    prisma.attendance.findMany({ where: { academicTermId: termId }, orderBy: { id: 'asc' } }),
    prisma.termResult.findMany({ where: { termId }, orderBy: { id: 'asc' } }),
    prisma.studentTermReport.findMany({ where: { termId }, orderBy: { id: 'asc' } }),
    prisma.payment.findMany({ where: { academicTermId: termId }, orderBy: { id: 'asc' } }),
  ]);

  return JSON.parse(JSON.stringify({
    classes,
    feeTemplates,
    timetablePeriods,
    lessonPlans,
    enrollments,
    attendance,
    results,
    reports,
    payments,
  }));
};

after(async () => {
  await prisma.$disconnect();
});

test('Phase 7 prepares target setup deterministically without copying operational activity', async () => {
  assert.ok(
    databaseUrl.includes(expectedSchema),
    `Refusing rollover preparation integration test without an isolated ${expectedSchema} database URL`,
  );
  await clearIsolatedSchema();

  const branch = await prisma.branch.create({
    data: { name: 'Phase 7 Main', code: 'PHASE7-MAIN', isMain: true },
  });
  const [administrator, homeroomTeacher, subjectTeacher] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'phase7-admin@example.invalid',
        passwordHash: 'integration-test-only',
        fullName: 'Phase 7 Administrator',
        role: 'SUPER_ADMIN',
        branchId: branch.id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'phase7-homeroom@example.invalid',
        passwordHash: 'integration-test-only',
        fullName: 'Phase 7 Homeroom',
        role: 'TEACHER',
        branchId: branch.id,
      },
    }),
    prisma.user.create({
      data: {
        email: 'phase7-subject@example.invalid',
        passwordHash: 'integration-test-only',
        fullName: 'Phase 7 Subject Teacher',
        role: 'TEACHER',
        branchId: branch.id,
      },
    }),
  ]);

  const academicYear = await prisma.academicYear.create({
    data: {
      name: '2042 Academic Year',
      startDate: new Date('2042-01-01T00:00:00.000Z'),
      endDate: new Date('2042-12-31T00:00:00.000Z'),
      termCount: 3,
      status: 'ACTIVE',
    },
  });
  const [sourceTerm, targetTerm, nonAdjacentTerm] = await Promise.all([
    prisma.academicTerm.create({
      data: {
        name: '2042 Term 1',
        startDate: new Date('2042-01-01T00:00:00.000Z'),
        endDate: new Date('2042-03-31T00:00:00.000Z'),
        academicYearId: academicYear.id,
        sequence: 1,
        status: 'CLOSING',
        isActive: false,
        closingStartedAt: new Date(),
      },
    }),
    prisma.academicTerm.create({
      data: {
        name: '2042 Term 2',
        startDate: new Date('2042-04-01T00:00:00.000Z'),
        endDate: new Date('2042-06-30T00:00:00.000Z'),
        academicYearId: academicYear.id,
        sequence: 2,
        status: 'DRAFT',
        isActive: false,
      },
    }),
    prisma.academicTerm.create({
      data: {
        name: '2042 Term 3',
        startDate: new Date('2042-07-01T00:00:00.000Z'),
        endDate: new Date('2042-09-30T00:00:00.000Z'),
        academicYearId: academicYear.id,
        sequence: 3,
        status: 'DRAFT',
        isActive: false,
      },
    }),
  ]);

  const [cohortA, cohortB] = await Promise.all([
    prisma.classCohort.create({
      data: {
        academicYearId: academicYear.id,
        name: 'Grade 6A',
        gradeLevel: 6,
        branchId: branch.id,
      },
    }),
    prisma.classCohort.create({
      data: {
        academicYearId: academicYear.id,
        name: 'Grade 6B',
        gradeLevel: 6,
        branchId: branch.id,
      },
    }),
  ]);
  const [sourceClassA, sourceClassB] = await Promise.all([
    prisma.class.create({
      data: {
        name: 'Grade 6A',
        gradeLevel: 6,
        teacherId: homeroomTeacher.id,
        academicTermId: sourceTerm.id,
        classCohortId: cohortA.id,
        branchId: branch.id,
      },
    }),
    prisma.class.create({
      data: {
        name: 'Grade 6B',
        gradeLevel: 6,
        teacherId: homeroomTeacher.id,
        academicTermId: sourceTerm.id,
        classCohortId: cohortB.id,
        branchId: branch.id,
      },
    }),
  ]);
  const existingTargetClass = await prisma.class.create({
    data: {
      name: sourceClassA.name,
      gradeLevel: sourceClassA.gradeLevel,
      teacherId: sourceClassA.teacherId,
      academicTermId: targetTerm.id,
      classCohortId: cohortA.id,
      branchId: branch.id,
    },
  });

  const [mathematics, science] = await Promise.all([
    prisma.subject.create({ data: { name: 'Phase 7 Mathematics', code: 'PHASE7-MATH' } }),
    prisma.subject.create({ data: { name: 'Phase 7 Science', code: 'PHASE7-SCI' } }),
  ]);
  await Promise.all([
    prisma.class.update({
      where: { id: sourceClassA.id },
      data: { subjects: { connect: [{ id: mathematics.id }] } },
    }),
    prisma.class.update({
      where: { id: sourceClassB.id },
      data: { subjects: { connect: [{ id: mathematics.id }, { id: science.id }] } },
    }),
  ]);
  await prisma.teacherSubject.createMany({
    data: [
      { classId: sourceClassA.id, subjectId: mathematics.id, teacherId: subjectTeacher.id },
      { classId: sourceClassB.id, subjectId: mathematics.id, teacherId: subjectTeacher.id },
      { classId: sourceClassB.id, subjectId: science.id, teacherId: homeroomTeacher.id },
    ],
  });

  const feeCategory = await prisma.feeCategory.create({
    data: { name: 'Phase 7 Tuition', code: 'PHASE7-TUITION' },
  });
  const [tuitionA, tuitionB] = await Promise.all([
    prisma.feeTemplate.create({
      data: {
        name: 'Phase 7 Tuition A',
        amount: 1200,
        academicTermId: sourceTerm.id,
        applicableGrade: 6,
        categoryId: feeCategory.id,
      },
    }),
    prisma.feeTemplate.create({
      data: {
        name: 'Phase 7 Tuition B',
        amount: 1250,
        academicTermId: sourceTerm.id,
        applicableGrade: 6,
        categoryId: feeCategory.id,
      },
    }),
  ]);
  const existingTargetTemplate = await prisma.feeTemplate.create({
    data: {
      name: tuitionA.name,
      amount: tuitionA.amount,
      academicTermId: targetTerm.id,
      applicableGrade: tuitionA.applicableGrade,
      categoryId: tuitionA.categoryId,
    },
  });
  await prisma.classFeeAssignment.createMany({
    data: [
      {
        classId: sourceClassA.id,
        feeTemplateId: tuitionA.id,
        academicTermId: sourceTerm.id,
        categoryId: feeCategory.id,
        dueDate: new Date('2042-02-15T00:00:00.000Z'),
      },
      {
        classId: sourceClassB.id,
        feeTemplateId: tuitionB.id,
        academicTermId: sourceTerm.id,
        categoryId: feeCategory.id,
        dueDate: new Date('2042-02-20T00:00:00.000Z'),
      },
    ],
  });

  await prisma.timetablePeriod.create({
    data: {
      subjectId: mathematics.id,
      teacherId: subjectTeacher.id,
      dayOfWeek: 'MONDAY',
      startTime: '08:00',
      endTime: '08:40',
      academicTermId: sourceTerm.id,
      classes: {
        create: [{ classId: sourceClassA.id }, { classId: sourceClassB.id }],
      },
    },
  });
  await prisma.lessonPlan.create({
    data: {
      teacherId: subjectTeacher.id,
      classId: sourceClassA.id,
      subjectId: mathematics.id,
      termId: sourceTerm.id,
      weekStartDate: new Date('2042-01-06T00:00:00.000Z'),
      title: 'Phase 7 Algebra Plan',
      content: 'Editable source planning structure',
    },
  });

  const student = await prisma.student.create({
    data: {
      admissionNumber: 'PHASE7-STUDENT',
      firstName: 'Phase',
      lastName: 'Seven',
      dateOfBirth: new Date('2031-01-01T00:00:00.000Z'),
      gender: 'FEMALE',
      classId: sourceClassA.id,
      branchId: branch.id,
    },
  });
  await prisma.studentTermEnrollment.create({
    data: {
      studentId: student.id,
      academicTermId: sourceTerm.id,
      classId: sourceClassA.id,
      status: 'ACTIVE',
      startsAt: sourceTerm.startDate,
    },
  });
  await prisma.termInstructionalDay.create({
    data: {
      academicTermId: sourceTerm.id,
      date: new Date('2042-01-08T00:00:00.000Z'),
      isInstructional: true,
    },
  });
  await prisma.attendance.create({
    data: {
      studentId: student.id,
      classId: sourceClassA.id,
      academicTermId: sourceTerm.id,
      date: new Date('2042-01-08T00:00:00.000Z'),
      status: 'PRESENT',
      recordedByUserId: homeroomTeacher.id,
    },
  });
  const assessment = await prisma.assessment.create({
    data: {
      title: 'Phase 7 Source Assessment',
      type: 'EXAM',
      classId: sourceClassA.id,
      subjectId: mathematics.id,
      termId: sourceTerm.id,
      totalMarks: 100,
      weight: 100,
      date: new Date('2042-03-01T00:00:00.000Z'),
    },
  });
  await prisma.assessmentResult.create({
    data: {
      assessmentId: assessment.id,
      studentId: student.id,
      score: 84,
      gradedByUserId: homeroomTeacher.id,
    },
  });
  await prisma.termResult.create({
    data: {
      studentId: student.id,
      classId: sourceClassA.id,
      subjectId: mathematics.id,
      termId: sourceTerm.id,
      totalScore: 84,
      grade: 'A',
    },
  });
  await prisma.studentTermReport.create({
    data: {
      studentId: student.id,
      classId: sourceClassA.id,
      termId: sourceTerm.id,
      totalAttendance: 1,
      totalDays: 1,
    },
  });
  const sourceFee = await prisma.studentFeeStructure.create({
    data: {
      studentId: student.id,
      feeTemplateId: tuitionA.id,
      academicTermId: sourceTerm.id,
      amountDue: 1200,
      amountPaid: 0,
    },
  });
  await prisma.payment.create({
    data: {
      studentId: student.id,
      academicTermId: sourceTerm.id,
      amount: 100,
      method: 'CASH',
      status: 'COMPLETED',
      recordedByUserId: administrator.id,
      idempotencyKey: 'phase7-source-payment',
    },
  });

  await assert.rejects(
    createTermRollover({
      sourceTermId: sourceTerm.id,
      targetTermId: nonAdjacentTerm.id,
      transitionType: 'WITHIN_YEAR',
      idempotencyKey: 'phase7-non-adjacent',
      actorUserId: administrator.id,
    }),
    (error: unknown) => error instanceof TermRolloverError
      && error.code === 'TERMS_NOT_ADJACENT',
  );

  const created = await createTermRollover({
    sourceTermId: sourceTerm.id,
    targetTermId: targetTerm.id,
    transitionType: 'WITHIN_YEAR',
    idempotencyKey: 'phase7-within-year-preparation',
    actorUserId: administrator.id,
  });
  assert.equal(created.reused, false);

  const retriedCreate = await createTermRollover({
    sourceTermId: sourceTerm.id,
    targetTermId: targetTerm.id,
    transitionType: 'WITHIN_YEAR',
    idempotencyKey: 'phase7-within-year-preparation',
    actorUserId: administrator.id,
  });
  assert.equal(retriedCreate.reused, true);
  assert.equal(retriedCreate.rollover.id, created.rollover.id);

  await assert.rejects(
    createTermRollover({
      sourceTermId: sourceTerm.id,
      targetTermId: targetTerm.id,
      transitionType: 'WITHIN_YEAR',
      idempotencyKey: 'phase7-conflicting-open-rollover',
      actorUserId: administrator.id,
    }),
    (error: unknown) => error instanceof TermRolloverError
      && error.code === 'ROLLOVER_ALREADY_OPEN',
  );

  const sourceBefore = await sourceSnapshot(sourceTerm.id);
  const targetConfigBefore = {
    classes: await prisma.class.count({ where: { academicTermId: targetTerm.id } }),
    fees: await prisma.feeTemplate.count({ where: { academicTermId: targetTerm.id } }),
    tasks: await prisma.termRolloverTask.count({ where: { rolloverId: created.rollover.id } }),
  };

  const firstPlan = await planTermRollover(created.rollover.id);
  const secondPlan = await planTermRollover(created.rollover.id);
  assert.equal(firstPlan.canPrepare, true);
  assert.equal(firstPlan.inputHash, secondPlan.inputHash);
  assert.deepEqual(firstPlan.counts, secondPlan.counts);
  assert.equal(firstPlan.counts.CLASS_OFFERINGS.planned, 2);
  assert.equal(firstPlan.counts.CLASS_OFFERINGS.create, 1);
  assert.equal(firstPlan.counts.CLASS_OFFERINGS.reuse, 1);
  assert.equal(firstPlan.counts.FEE_TEMPLATES.planned, 2);
  assert.equal(firstPlan.counts.FEE_TEMPLATES.create, 1);
  assert.equal(firstPlan.counts.FEE_TEMPLATES.reuse, 1);
  assert.deepEqual(
    {
      classes: await prisma.class.count({ where: { academicTermId: targetTerm.id } }),
      fees: await prisma.feeTemplate.count({ where: { academicTermId: targetTerm.id } }),
      tasks: await prisma.termRolloverTask.count({ where: { rolloverId: created.rollover.id } }),
    },
    targetConfigBefore,
  );

  const [preparedA, preparedB] = await Promise.all([
    prepareTermRollover(created.rollover.id, firstPlan.inputHash, administrator.id),
    prepareTermRollover(created.rollover.id, firstPlan.inputHash, administrator.id),
  ]);
  assert.equal(preparedA.rollover.status, 'PREPARED');
  assert.equal(preparedB.rollover.status, 'PREPARED');

  const completedTasks = await prisma.termRolloverTask.findMany({
    where: { rolloverId: created.rollover.id },
    orderBy: { operationKey: 'asc' },
  });
  assert.ok(completedTasks.length > 0);
  assert.ok(completedTasks.every(task => task.status === 'COMPLETED' && task.targetEntityId));
  const firstMappings = completedTasks.map(task => ({
    operationKey: task.operationKey,
    targetEntityId: task.targetEntityId,
  }));
  const classATask = completedTasks.find(task => task.operationKey === `class:${sourceClassA.id}`);
  const feeATask = completedTasks.find(task => task.operationKey === `fee-template:${tuitionA.id}`);
  assert.equal(classATask?.targetEntityId, existingTargetClass.id);
  assert.equal(feeATask?.targetEntityId, existingTargetTemplate.id);

  const targetClasses = await prisma.class.findMany({
    where: { academicTermId: targetTerm.id },
    include: {
      subjects: true,
      teacherAssignments: true,
      classFeeAssignments: true,
    },
  });
  assert.equal(targetClasses.length, 2);
  assert.equal(await prisma.timetablePeriod.count({ where: { academicTermId: targetTerm.id } }), 1);
  assert.equal(await prisma.lessonPlan.count({ where: { termId: targetTerm.id } }), 1);
  assert.deepEqual(await targetOperationalCounts(targetTerm.id), {
    enrollments: 0,
    attendance: 0,
    attendanceAlerts: 0,
    assessments: 0,
    assessmentResults: 0,
    termResults: 0,
    reports: 0,
    topicProgress: 0,
    homeworkSubmissions: 0,
    feeObligations: 0,
    invoices: 0,
    payments: 0,
    summaries: 0,
    campaigns: 0,
    campaignMessages: 0,
    virtualClassrooms: 0,
    riskAssessments: 0,
    mastery: 0,
  });
  assert.deepEqual(await sourceSnapshot(sourceTerm.id), sourceBefore);
  assert.equal(await prisma.studentFeeStructure.count({ where: { id: sourceFee.id } }), 1);

  const validation = await validateTermRolloverPreparation(created.rollover.id);
  assert.equal(validation.prepared, true);
  assert.equal(validation.manualChangesDetected, false);
  assert.equal(validation.operationalActivity.total, 0);

  const event = await prisma.termRolloverEvent.findFirstOrThrow({
    where: { rolloverId: created.rollover.id },
    orderBy: { sequence: 'asc' },
  });
  await assert.rejects(
    prisma.termRolloverEvent.update({
      where: { id: event.id },
      data: { type: 'MUTATED' },
    }),
    /append-only/i,
  );

  await prisma.class.update({
    where: { id: existingTargetClass.id },
    data: { name: 'Administrator edited target class' },
  });
  const changedValidation = await validateTermRolloverPreparation(created.rollover.id);
  assert.equal(changedValidation.manualChangesDetected, true);
  assert.ok(changedValidation.issues.some(issue => issue.code === 'PREPARED_TARGET_CHANGED'));

  const preparedAgain = await prepareTermRollover(
    created.rollover.id,
    firstPlan.inputHash,
    administrator.id,
  );
  assert.equal(preparedAgain.manualChangesDetected, true);
  assert.equal(
    (await prisma.class.findUniqueOrThrow({ where: { id: existingTargetClass.id } })).name,
    'Administrator edited target class',
  );
  assert.deepEqual(
    (await prisma.termRolloverTask.findMany({
      where: { rolloverId: created.rollover.id },
      orderBy: { operationKey: 'asc' },
    })).map(task => ({ operationKey: task.operationKey, targetEntityId: task.targetEntityId })),
    firstMappings,
  );

  await prisma.studentTermEnrollment.create({
    data: {
      studentId: student.id,
      academicTermId: targetTerm.id,
      classId: existingTargetClass.id,
      status: 'STAGED',
      startsAt: targetTerm.startDate,
      sourceEnrollmentId: (await prisma.studentTermEnrollment.findUniqueOrThrow({
        where: { studentId_academicTermId: { studentId: student.id, academicTermId: sourceTerm.id } },
      })).id,
    },
  });
  const activityValidation = await validateTermRolloverPreparation(created.rollover.id);
  assert.equal(activityValidation.operationalActivity.total, 1);
  assert.ok(activityValidation.issues.some(issue => issue.code === 'TARGET_OPERATIONAL_ACTIVITY'));

  const finalYear = await prisma.academicYear.create({
    data: {
      name: '2043 Academic Year',
      startDate: new Date('2043-01-01T00:00:00.000Z'),
      endDate: new Date('2043-12-31T00:00:00.000Z'),
      termCount: 3,
      status: 'DRAFT',
    },
  });
  const yearEndSource = await prisma.academicTerm.update({
    where: { id: nonAdjacentTerm.id },
    data: {
      name: '2042 Final Term',
      startDate: new Date('2042-10-01T00:00:00.000Z'),
      endDate: new Date('2042-12-20T00:00:00.000Z'),
      status: 'CLOSING',
      isActive: false,
      closingStartedAt: new Date(),
    },
  });
  const yearEndTarget = await prisma.academicTerm.create({
    data: {
      name: '2043 Term 1',
      startDate: new Date('2043-01-01T00:00:00.000Z'),
      endDate: new Date('2043-03-31T00:00:00.000Z'),
      academicYearId: finalYear.id,
      sequence: 1,
      status: 'DRAFT',
      isActive: false,
    },
  });
  const graduatingCohort = await prisma.classCohort.create({
    data: {
      academicYearId: academicYear.id,
      name: 'Grade 7A',
      gradeLevel: 7,
      branchId: branch.id,
    },
  });
  await prisma.class.create({
    data: {
      name: 'Grade 7A',
      gradeLevel: 7,
      teacherId: homeroomTeacher.id,
      academicTermId: yearEndSource.id,
      classCohortId: graduatingCohort.id,
      branchId: branch.id,
    },
  });

  const yearEndRollover = await createTermRollover({
    sourceTermId: yearEndSource.id,
    targetTermId: yearEndTarget.id,
    transitionType: 'YEAR_END',
    idempotencyKey: 'phase7-year-end-preparation',
    actorUserId: administrator.id,
    configuration: { copyCategories: [] },
  });
  const unmappedPlan = await planTermRollover(yearEndRollover.rollover.id);
  assert.equal(unmappedPlan.canPrepare, false);
  assert.ok(unmappedPlan.issues.some(issue => issue.code === 'YEAR_END_MAPPING_REQUIRED'));
  assert.equal(unmappedPlan.yearEndMappings.length, 1);

  await updateTermRolloverConfiguration(
    yearEndRollover.rollover.id,
    {
      copyCategories: [],
      yearEndMappings: [{
        sourceCohortId: graduatingCohort.id,
        targetName: 'Grade 8A',
        targetGradeLevel: 8,
      }],
    },
    administrator.id,
    yearEndRollover.rollover.version,
  );
  const mappedPlan = await planTermRollover(yearEndRollover.rollover.id);
  assert.equal(mappedPlan.canPrepare, true);
  const yearEndPrepared = await prepareTermRollover(
    yearEndRollover.rollover.id,
    mappedPlan.inputHash,
    administrator.id,
  );
  assert.equal(yearEndPrepared.rollover.status, 'PREPARED');
  const successor = await prisma.classCohort.findFirstOrThrow({
    where: { predecessorCohortId: graduatingCohort.id, academicYearId: finalYear.id },
  });
  assert.equal(successor.name, 'Grade 8A');
  assert.equal(successor.gradeLevel, 8);
  assert.equal(await prisma.class.count({
    where: { academicTermId: yearEndTarget.id, classCohortId: successor.id },
  }), 1);
  assert.equal((await targetOperationalCounts(yearEndTarget.id)).enrollments, 0);
});
