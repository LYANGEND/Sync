import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from '../src/utils/prisma';
import {
  beginClosingTerm,
  closeTermInTransaction,
  runTermLifecycleTransaction,
  runTermWriteTransaction,
} from '../src/services/termLifecycleService';
import { replaceInstructionalDays } from '../src/controllers/instructionalDayController';
import { recordAttendance } from '../src/controllers/attendanceController';
import { generateSingleStudentReport, verifyReport } from '../src/controllers/reportCardController';
import {
  finalizeClassReports,
  finalizeStudentReport,
  getClassReportReadiness,
  getStudentReportReadiness,
  publishClassReports,
  publishStudentReport,
} from '../src/services/reportFinalizationService';
import {
  applyReportAmendment,
  approveReportAmendment,
  createReportAmendment,
  rejectReportAmendment,
} from '../src/services/reportAmendmentService';

const databaseUrl = process.env.DATABASE_URL ?? '';
const expectedSchema = 'schema=report_finalization_test';

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
    send(body?: unknown) {
      this.body = body;
      return this;
    },
  };
  return value;
};

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

after(async () => {
  await prisma.$disconnect();
});

test('Phase 6 enforces instructional-day readiness, immutable publishing, bulk release, and approved amendments', async () => {
  assert.ok(
    databaseUrl.includes(expectedSchema),
    `Refusing report finalization integration test without an isolated ${expectedSchema} database URL`,
  );
  await clearIsolatedSchema();

  const [requester, approver] = await Promise.all([
    prisma.user.create({
      data: {
        email: 'phase6-requester@example.invalid',
        passwordHash: 'integration-test-only',
        fullName: 'Phase 6 Requester',
        role: 'SUPER_ADMIN',
      },
    }),
    prisma.user.create({
      data: {
        email: 'phase6-approver@example.invalid',
        passwordHash: 'integration-test-only',
        fullName: 'Phase 6 Approver',
        role: 'SUPER_ADMIN',
      },
    }),
  ]);
  const term = await prisma.academicTerm.create({
    data: {
      name: 'Phase 6 Term',
      startDate: new Date('2040-01-01T00:00:00.000Z'),
      endDate: new Date('2040-03-31T00:00:00.000Z'),
      status: 'ACTIVE',
      isActive: true,
      activatedAt: new Date(),
    },
  });
  const classRecord = await prisma.class.create({
    data: {
      name: 'Phase 6 Class',
      gradeLevel: 6,
      teacherId: requester.id,
      academicTermId: term.id,
    },
  });
  const subject = await prisma.subject.create({
    data: {
      name: 'Phase 6 Mathematics',
      code: 'PHASE6-MATH',
      classes: { connect: { id: classRecord.id } },
    },
  });
  await prisma.gradingScale.create({
    data: { grade: 'A', minScore: 0, maxScore: 100, remark: 'Complete' },
  });
  await prisma.schoolSettings.create({ data: { schoolName: 'Phase 6 School' } });

  const students = await Promise.all(['One', 'Two'].map((lastName, index) => (
    prisma.student.create({
      data: {
        admissionNumber: `PHASE6-${index + 1}`,
        firstName: 'Student',
        lastName,
        dateOfBirth: new Date('2030-01-01T00:00:00.000Z'),
        gender: index === 0 ? 'FEMALE' : 'MALE',
        classId: classRecord.id,
      },
    })
  )));
  await prisma.studentTermEnrollment.createMany({
    data: students.map(student => ({
      studentId: student.id,
      academicTermId: term.id,
      classId: classRecord.id,
      status: 'ACTIVE',
      startsAt: term.startDate,
    })),
  });

  const invalidCalendarResponse = response();
  await replaceInstructionalDays({
    params: { id: term.id },
    body: { days: [{ date: '2039-12-31', isInstructional: true }] },
  } as any, invalidCalendarResponse);
  assert.equal(invalidCalendarResponse.statusCode, 400);
  assert.equal(invalidCalendarResponse.body.code, 'DAY_OUTSIDE_TERM');

  const calendarResponse = response();
  await replaceInstructionalDays({
    params: { id: term.id },
    body: {
      days: [
        { date: '2040-01-02', isInstructional: true },
        { date: '2040-01-03', isInstructional: true },
        { date: '2040-01-04', isInstructional: false, label: 'School closure' },
      ],
    },
  } as any, calendarResponse);
  assert.equal(calendarResponse.statusCode, 200);

  const authUser = { userId: requester.id, role: 'SUPER_ADMIN' };
  const rejectedAttendance = response();
  await recordAttendance({
    body: {
      classId: classRecord.id,
      academicTermId: term.id,
      date: '2040-01-04',
      records: students.map(student => ({ studentId: student.id, status: 'PRESENT' })),
    },
    user: authUser,
  } as any, rejectedAttendance);
  assert.equal(rejectedAttendance.statusCode, 400);
  assert.match(rejectedAttendance.body.message, /instructional day/i);

  const recordDay = async (date: string) => {
    const attendanceResponse = response();
    await recordAttendance({
      body: {
        classId: classRecord.id,
        academicTermId: term.id,
        date,
        records: students.map(student => ({ studentId: student.id, status: 'PRESENT' })),
      },
      user: authUser,
    } as any, attendanceResponse);
    assert.equal(attendanceResponse.statusCode, 201);
  };
  await recordDay('2040-01-02');

  const assessment = await prisma.assessment.create({
    data: {
      title: 'Phase 6 Final Assessment',
      type: 'EXAM',
      classId: classRecord.id,
      subjectId: subject.id,
      termId: term.id,
      totalMarks: 100,
      weight: 100,
      date: new Date('2040-01-02T00:00:00.000Z'),
    },
  });
  await prisma.assessmentResult.createMany({
    data: students.map((student, index) => ({
      assessmentId: assessment.id,
      studentId: student.id,
      score: 80 + index,
      gradedByUserId: requester.id,
    })),
  });
  await runTermWriteTransaction(term.id, 'FINALIZATION', async tx => {
    for (const student of students) {
      await generateSingleStudentReport(student.id, term.id, tx);
    }
  });

  const incomplete = await getStudentReportReadiness(students[0].id, term.id);
  assert.equal(incomplete.ready, false);
  assert.ok(incomplete.blockers.some(blocker => blocker.code === 'TERM_NOT_CLOSING'));
  const attendanceBlocker = incomplete.blockers.find(blocker => blocker.code === 'ATTENDANCE_MISSING');
  assert.deepEqual(attendanceBlocker?.dates, ['2040-01-03']);

  await recordDay('2040-01-03');

  const blockedStudentResult = await prisma.assessmentResult.findUniqueOrThrow({
    where: {
      assessmentId_studentId: {
        assessmentId: assessment.id,
        studentId: students[1].id,
      },
    },
  });
  await prisma.assessmentResult.delete({ where: { id: blockedStudentResult.id } });
  const closingTerm = await beginClosingTerm(term.id);
  assert.equal(closingTerm.status, 'CLOSING');

  const blockedClass = await getClassReportReadiness(classRecord.id, term.id);
  assert.equal(blockedClass.ready, false);
  assert.equal(blockedClass.counts.blocked, 1);
  assert.ok(blockedClass.students[1].blockers.some(blocker => blocker.code === 'ASSESSMENT_RESULT_MISSING'));
  await assert.rejects(
    finalizeClassReports(classRecord.id, term.id, requester.id),
    /No reports were finalized/i,
  );
  assert.equal(await prisma.studentTermReport.count({
    where: { termId: term.id, status: { not: 'DRAFT' } },
  }), 0);
  assert.equal(await prisma.studentTermReportVersion.count(), 0);

  await prisma.assessmentResult.create({
    data: {
      assessmentId: assessment.id,
      studentId: students[1].id,
      score: 81,
      gradedByUserId: requester.id,
    },
  });
  const ready = await getClassReportReadiness(classRecord.id, term.id);
  assert.equal(ready.ready, true);
  assert.equal(ready.counts.ready, 2);
  assert.equal(ready.counts.instructionalDays, 2);

  const draftReport = await prisma.studentTermReport.findUniqueOrThrow({
    where: { studentId_termId: { studentId: students[1].id, termId: term.id } },
  });
  const draftVerifyResponse = response();
  await verifyReport({ params: { id: draftReport.id } } as any, draftVerifyResponse);
  assert.equal(draftVerifyResponse.statusCode, 404);

  const concurrentFinalization = await Promise.all([
    finalizeStudentReport(students[0].id, term.id, requester.id),
    finalizeStudentReport(students[0].id, term.id, requester.id),
  ]);
  assert.equal(concurrentFinalization.filter(result => result.changed).length, 1);
  const finalizedReport = await prisma.studentTermReport.findUniqueOrThrow({
    where: { studentId_termId: { studentId: students[0].id, termId: term.id } },
  });
  assert.equal(finalizedReport.status, 'FINALIZED');
  assert.equal(await prisma.studentTermReportVersion.count({ where: { reportId: finalizedReport.id } }), 1);

  await assert.rejects(
    prisma.studentTermReport.update({
      where: { id: finalizedReport.id },
      data: { classTeacherRemark: 'Direct mutation must fail' },
    }),
    /immutable/i,
  );
  await assert.rejects(
    prisma.studentTermReport.delete({ where: { id: finalizedReport.id } }),
    /immutable/i,
  );
  const lockedResult = await prisma.termResult.findFirstOrThrow({
    where: { studentId: students[0].id, termId: term.id },
  });
  await assert.rejects(
    prisma.termResult.update({ where: { id: lockedResult.id }, data: { totalScore: 99 } }),
    /immutable/i,
  );
  await assert.rejects(
    prisma.termResult.delete({ where: { id: lockedResult.id } }),
    /immutable/i,
  );

  const lockedAssessmentResult = await prisma.assessmentResult.findUniqueOrThrow({
    where: {
      assessmentId_studentId: {
        assessmentId: assessment.id,
        studentId: students[0].id,
      },
    },
  });
  await assert.rejects(
    prisma.assessmentResult.update({
      where: { id: lockedAssessmentResult.id },
      data: { score: 99 },
    }),
    /immutable/i,
  );
  await assert.rejects(
    prisma.assessmentResult.delete({ where: { id: lockedAssessmentResult.id } }),
    /immutable/i,
  );

  const stillDraftAssessmentResult = await prisma.assessmentResult.findUniqueOrThrow({
    where: {
      assessmentId_studentId: {
        assessmentId: assessment.id,
        studentId: students[1].id,
      },
    },
  });
  await prisma.assessmentResult.update({
    where: { id: stillDraftAssessmentResult.id },
    data: { score: 82 },
  });
  await prisma.assessmentResult.update({
    where: { id: stillDraftAssessmentResult.id },
    data: { score: 81 },
  });

  const lockedAttendance = await prisma.attendance.findFirstOrThrow({
    where: { studentId: students[0].id, academicTermId: term.id },
  });
  await assert.rejects(
    prisma.attendance.delete({ where: { id: lockedAttendance.id } }),
    /immutable/i,
  );
  await assert.rejects(
    prisma.termInstructionalDay.create({
      data: {
        academicTermId: term.id,
        date: new Date('2040-01-05T00:00:00.000Z'),
        isInstructional: true,
      },
    }),
    /immutable/i,
  );

  const finalizedVerifyResponse = response();
  await verifyReport({ params: { id: finalizedReport.id } } as any, finalizedVerifyResponse);
  assert.equal(finalizedVerifyResponse.statusCode, 404);

  const published = await publishStudentReport(students[0].id, term.id, requester.id);
  assert.equal(published.report.status, 'PUBLISHED');
  assert.equal(published.report.currentVersion, 2);
  const publishedVerifyResponse = response();
  await verifyReport({ params: { id: finalizedReport.id } } as any, publishedVerifyResponse);
  assert.equal(publishedVerifyResponse.statusCode, 200);
  assert.equal(publishedVerifyResponse.body.valid, true);
  assert.equal(publishedVerifyResponse.body.version, 2);

  await assert.rejects(
    publishClassReports(classRecord.id, term.id, requester.id),
    /every class report must be finalized/i,
  );
  assert.equal((await prisma.studentTermReport.findUniqueOrThrow({
    where: { studentId_termId: { studentId: students[1].id, termId: term.id } },
  })).status, 'DRAFT');

  const bulkFinalized = await finalizeClassReports(classRecord.id, term.id, requester.id);
  assert.deepEqual(bulkFinalized, { total: 2, changed: 1, unchanged: 1 });
  const bulkPublished = await publishClassReports(classRecord.id, term.id, requester.id);
  assert.deepEqual(bulkPublished, { total: 2, changed: 1, unchanged: 1 });

  const immutableVersion = await prisma.studentTermReportVersion.findFirstOrThrow({
    where: { reportId: finalizedReport.id, version: 1 },
  });
  await assert.rejects(
    prisma.studentTermReportVersion.update({
      where: { id: immutableVersion.id },
      data: { reason: 'Tamper attempt' },
    }),
    /immutable/i,
  );
  await assert.rejects(
    prisma.studentTermReportVersion.delete({ where: { id: immutableVersion.id } }),
    /immutable/i,
  );

  await prisma.termCloseSnapshot.create({
    data: {
      academicTermId: term.id,
      checksum: 'phase-6-integration-checksum',
      snapshot: { test: true },
      createdByUserId: requester.id,
    },
  });
  await runTermLifecycleTransaction(tx => closeTermInTransaction(tx, term.id, requester.id));

  const amendment = await createReportAmendment(
    term.id,
    'Correct a verified transcription error',
    requester.id,
    [{
      entityType: 'TERM_RESULT',
      entityId: lockedResult.id,
      fieldName: 'totalScore',
      afterValue: 82,
    }],
  );
  await assert.rejects(
    approveReportAmendment(amendment.id, requester.id),
    /requester cannot approve/i,
  );
  await approveReportAmendment(amendment.id, approver.id);
  const applied = await applyReportAmendment(amendment.id, approver.id);
  assert.equal(applied.status, 'APPLIED');
  assert.equal(Number((await prisma.termResult.findUniqueOrThrow({ where: { id: lockedResult.id } })).totalScore), 82);

  const amendedReport = await prisma.studentTermReport.findUniqueOrThrow({ where: { id: finalizedReport.id } });
  assert.equal(amendedReport.status, 'PUBLISHED');
  assert.equal(amendedReport.currentVersion, 3);
  const amendmentVersion = await prisma.studentTermReportVersion.findUniqueOrThrow({
    where: { reportId_version: { reportId: finalizedReport.id, version: 3 } },
  });
  assert.match(amendmentVersion.reason || '', /approved amendment/i);

  const amendedVerifyResponse = response();
  await verifyReport({ params: { id: finalizedReport.id } } as any, amendedVerifyResponse);
  assert.equal(amendedVerifyResponse.statusCode, 200);
  assert.equal(amendedVerifyResponse.body.version, 3);

  const rejectedAmendment = await createReportAmendment(
    term.id,
    'Reject an unsupported historical correction',
    requester.id,
    [{
      entityType: 'STUDENT_TERM_REPORT',
      entityId: finalizedReport.id,
      fieldName: 'principalRemark',
      afterValue: 'This value must never be applied',
    }],
  );
  const rejected = await rejectReportAmendment(rejectedAmendment.id, requester.id);
  assert.equal(rejected.status, 'REJECTED');
  await assert.rejects(
    applyReportAmendment(rejectedAmendment.id, approver.id),
    /must be approved/i,
  );

  const racedAmendment = await createReportAmendment(
    term.id,
    'Serialize competing approval and rejection decisions',
    requester.id,
    [{
      entityType: 'STUDENT_TERM_REPORT',
      entityId: finalizedReport.id,
      fieldName: 'classTeacherRemark',
      afterValue: 'One transition must win',
    }],
  );
  const racedTransitions = await Promise.allSettled([
    approveReportAmendment(racedAmendment.id, approver.id),
    rejectReportAmendment(racedAmendment.id, requester.id),
  ]);
  assert.equal(racedTransitions.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(racedTransitions.filter(result => result.status === 'rejected').length, 1);
  const racedState = await prisma.closedTermAmendment.findUniqueOrThrow({
    where: { id: racedAmendment.id },
  });
  assert.ok(racedState.status === 'APPROVED' || racedState.status === 'REJECTED');
  assert.equal(Boolean(racedState.approvedByUserId), racedState.status === 'APPROVED');
  assert.equal(Boolean(racedState.rejectedByUserId), racedState.status === 'REJECTED');
});
