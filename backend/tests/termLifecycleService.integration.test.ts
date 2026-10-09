import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { AcademicTermStatus } from '@prisma/client';
import { prisma } from '../src/utils/prisma';
import {
  activateTerm,
  beginClosingTerm,
  closeTermInTransaction,
  createTerm,
  deleteDraftTerm,
  runTermLifecycleTransaction,
  runTermWriteTransaction,
  TermLifecycleError,
} from '../src/services/termLifecycleService';
import { recordAttendance } from '../src/controllers/attendanceController';
import { generateStudentReport } from '../src/controllers/reportCardController';
import { createPayment } from '../src/controllers/paymentController';
import { createFeeTemplate } from '../src/controllers/feeController';
import { cancelInvoice, createInvoice } from '../src/controllers/invoiceController';
import { createTimetablePeriod } from '../src/controllers/timetableController';
import { deleteStudent, updateStudent } from '../src/controllers/studentController';
import { transferStudent } from '../src/controllers/branchController';
import { activateBudget, closeBudget, createBudget } from '../src/controllers/budgetController';
import { createClassroom, startClassroom } from '../src/controllers/virtualClassroomController';
import { saveReport } from '../src/controllers/aiFinancialController';
import { createCampaign } from '../src/services/debtCollectionService';
import attendanceIntelligenceService from '../src/services/attendanceIntelligenceService';
import studentRiskService from '../src/services/studentRiskService';
import autoGradingService from '../src/services/autoGradingService';

const databaseUrl = process.env.DATABASE_URL ?? '';
const expectedSchema = 'schema=term_lifecycle_test';
const testPrefix = `Lifecycle integration ${Date.now()}`;

const createMockResponse = () => {
  const response: any = {
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
  return response;
};

after(async () => {
  await prisma.$disconnect();
});

test('term lifecycle remains consistent under concurrent activation and close transitions', async t => {
  assert.ok(
    databaseUrl.includes(expectedSchema),
    `Refusing lifecycle integration test without an isolated ${expectedSchema} database URL`,
  );

  t.after(async () => {
    const testTerms = await prisma.academicTerm.findMany({
      where: { name: { startsWith: testPrefix } },
      select: { id: true },
    });
    const termIds = testTerms.map(term => term.id);
    const boundaryStudents = await prisma.student.findMany({
      where: { admissionNumber: { startsWith: `${testPrefix}-` } },
      select: { id: true },
    });
    const boundaryStudentIds = boundaryStudents.map(student => student.id);
    await prisma.virtualClassroom.deleteMany({ where: { title: { startsWith: testPrefix } } });
    await prisma.financialReport.deleteMany({ where: { title: { startsWith: testPrefix } } });
    await prisma.budget.deleteMany({ where: { name: { startsWith: testPrefix } } });
    await prisma.branchTransfer.deleteMany({ where: { entityId: { in: boundaryStudentIds } } });
    await prisma.campaignMessage.deleteMany();
    await prisma.debtCollectionCampaign.deleteMany();
    await prisma.mobileMoneyCollection.deleteMany();
    await prisma.paymentAllocation.deleteMany();
    await prisma.refund.deleteMany({ where: { refundNumber: { startsWith: 'LIFECYCLE-REF-' } } });
    await prisma.payment.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.creditNote.deleteMany({ where: { creditNoteNumber: { startsWith: 'LIFECYCLE-CN-' } } });
    await prisma.invoice.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.attendanceAlert.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.studentRiskAssessment.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.studentResponse.deleteMany();
    await prisma.assessmentSubmission.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.questionOption.deleteMany();
    await prisma.question.deleteMany();
    await prisma.assessment.deleteMany({ where: { termId: { in: termIds } } });
    await prisma.attendance.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.studentTermReport.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.termResult.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.studentFeeStructure.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.classMovementLog.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.studentTermEnrollment.deleteMany({ where: { studentId: { in: boundaryStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: boundaryStudentIds } } });
    await prisma.timetablePeriodClass.deleteMany();
    await prisma.timetablePeriod.deleteMany({ where: { academicTermId: { in: termIds } } });
    await prisma.teacherSubject.deleteMany();
    await prisma.classFeeAssignment.deleteMany({ where: { academicTermId: { in: termIds } } });
    await prisma.class.deleteMany({ where: { name: { startsWith: testPrefix } } });
    await prisma.feeTemplate.deleteMany({ where: { academicTermId: { in: termIds } } });
    await prisma.feeCategory.deleteMany({ where: { code: { startsWith: 'LIFECYCLE-' } } });
    await prisma.subject.deleteMany({ where: { code: { startsWith: 'LIFECYCLE-' } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: 'lifecycle-boundary-' } } });
    await prisma.branch.deleteMany({ where: { name: { startsWith: testPrefix } } });
    await prisma.schoolSettings.deleteMany();
    await prisma.termCloseSnapshot.deleteMany({
      where: { academicTermId: { in: termIds } },
    });
    await prisma.academicTerm.deleteMany({ where: { id: { in: termIds } } });
  });

  await assert.rejects(
    createTerm({
      name: `${testPrefix} invalid dates`,
      startDate: new Date('2030-04-01T00:00:00.000Z'),
      endDate: new Date('2030-01-01T00:00:00.000Z'),
    }),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'INVALID_TERM_DATES',
  );

  const first = await createTerm({
    name: `${testPrefix} A`,
    startDate: new Date('2030-01-01T00:00:00.000Z'),
    endDate: new Date('2030-03-31T00:00:00.000Z'),
  });
  const second = await createTerm({
    name: `${testPrefix} B`,
    startDate: new Date('2030-04-01T00:00:00.000Z'),
    endDate: new Date('2030-06-30T00:00:00.000Z'),
  });

  const boundaryUser = await prisma.user.create({
    data: {
      email: `lifecycle-boundary-${Date.now()}@example.invalid`,
      passwordHash: 'integration-test-only',
      fullName: 'Lifecycle Boundary User',
      role: 'SUPER_ADMIN',
    },
  });
  const boundaryClass = await prisma.class.create({
    data: {
      name: `${testPrefix} boundary class`,
      gradeLevel: 7,
      teacherId: boundaryUser.id,
      academicTermId: first.id,
    },
  });
  const boundaryStudent = await prisma.student.create({
    data: {
      admissionNumber: `${testPrefix}-student`,
      firstName: 'Lifecycle',
      lastName: 'Student',
      dateOfBirth: new Date('2020-01-01T00:00:00.000Z'),
      gender: 'FEMALE',
      classId: boundaryClass.id,
    },
  });
  const boundarySubject = await prisma.subject.create({
    data: {
      name: `${testPrefix} subject`,
      code: `LIFECYCLE-SUBJECT-${Date.now()}`,
      classes: { connect: { id: boundaryClass.id } },
    },
  });
  await prisma.teacherSubject.create({
    data: {
      teacherId: boundaryUser.id,
      subjectId: boundarySubject.id,
      classId: boundaryClass.id,
    },
  });
  const feeCategory = await prisma.feeCategory.create({
    data: {
      name: `${testPrefix} category`,
      code: `LIFECYCLE-CATEGORY-${Date.now()}`,
    },
  });
  const requestUser = {
    userId: boundaryUser.id,
    role: 'SUPER_ADMIN',
    branchId: null,
  };

  const setupResponse = createMockResponse();
  await createFeeTemplate({
    body: {
      name: `${testPrefix} setup fee`,
      amount: 50,
      academicTermId: first.id,
      categoryId: feeCategory.id,
      applicableGrade: 7,
    },
    user: requestUser,
  } as any, setupResponse);
  assert.equal(setupResponse.statusCode, 201);
  assert.equal(
    await prisma.feeTemplate.count({ where: { academicTermId: first.id } }),
    1,
  );

  const budgetResponse = createMockResponse();
  await createBudget({
    body: {
      name: `${testPrefix} draft budget`,
      period: 'term',
      year: 2030,
      termId: first.id,
      startDate: '2030-01-01T00:00:00.000Z',
      endDate: '2030-03-31T00:00:00.000Z',
      items: [{ category: 'SUPPLIES', allocated: 500 }],
    },
    user: requestUser,
  } as any, budgetResponse);
  assert.equal(budgetResponse.statusCode, 201);

  const budgetActivationResponse = createMockResponse();
  await activateBudget({
    params: { id: budgetResponse.body.id },
    user: requestUser,
  } as any, budgetActivationResponse);
  assert.equal(budgetActivationResponse.statusCode, 409);
  assert.equal(budgetActivationResponse.body.code, 'TERM_WRITE_NOT_ALLOWED');
  assert.equal(
    (await prisma.budget.findUniqueOrThrow({ where: { id: budgetResponse.body.id } })).status,
    'DRAFT',
  );

  const classroomResponse = createMockResponse();
  await createClassroom({
    body: {
      title: `${testPrefix} draft classroom`,
      classId: boundaryClass.id,
      subjectId: boundarySubject.id,
      scheduledStart: '2030-01-20T08:00:00.000Z',
      scheduledEnd: '2030-01-20T09:00:00.000Z',
      aiTutorEnabled: false,
    },
    user: requestUser,
  } as any, classroomResponse);
  assert.equal(classroomResponse.statusCode, 201);

  const classroomStartResponse = createMockResponse();
  await startClassroom({
    params: { id: classroomResponse.body.id },
    user: requestUser,
  } as any, classroomStartResponse);
  assert.equal(classroomStartResponse.statusCode, 409);
  assert.equal(classroomStartResponse.body.code, 'TERM_WRITE_NOT_ALLOWED');
  const unchangedClassroom = await prisma.virtualClassroom.findUniqueOrThrow({
    where: { id: classroomResponse.body.id },
  });
  assert.equal(unchangedClassroom.status, 'SCHEDULED');
  assert.equal(unchangedClassroom.actualStart, null);

  const obligationResponse = createMockResponse();
  await createInvoice({
    body: {
      studentId: boundaryStudent.id,
      termId: first.id,
      dueDate: '2030-03-01T00:00:00.000Z',
      items: [{
        description: 'Draft-term tuition',
        quantity: 1,
        unitPrice: 100,
        feeTemplateId: setupResponse.body.id,
      }],
    },
    user: requestUser,
  } as any, obligationResponse);
  assert.equal(obligationResponse.statusCode, 409);
  assert.equal(obligationResponse.body.code, 'TERM_WRITE_NOT_ALLOWED');
  assert.equal(await prisma.invoice.count({ where: { termId: first.id } }), 0);

  const seededInvoice = await prisma.invoice.create({
    data: {
      invoiceNumber: `LIFECYCLE-${Date.now()}`,
      studentId: boundaryStudent.id,
      termId: first.id,
      dueDate: new Date('2030-03-01T00:00:00.000Z'),
      subtotal: 100,
      totalAmount: 100,
      balanceDue: 100,
    },
  });
  const adjustmentResponse = createMockResponse();
  await cancelInvoice({
    params: { id: seededInvoice.id },
    user: requestUser,
  } as any, adjustmentResponse);
  assert.equal(adjustmentResponse.statusCode, 409);
  assert.equal(adjustmentResponse.body.code, 'TERM_WRITE_NOT_ALLOWED');
  assert.equal(
    (await prisma.invoice.findUniqueOrThrow({ where: { id: seededInvoice.id } })).status,
    'DRAFT',
  );

  const financialReportResponse = createMockResponse();
  await saveReport({
    body: {
      title: `${testPrefix} draft financial report`,
      reportType: 'CUSTOM',
      termId: first.id,
    },
    user: requestUser,
  } as any, financialReportResponse);
  assert.equal(financialReportResponse.statusCode, 409);
  assert.equal(financialReportResponse.body.code, 'TERM_WRITE_NOT_ALLOWED');
  assert.equal(
    await prisma.financialReport.count({ where: { title: `${testPrefix} draft financial report` } }),
    0,
  );

  await assert.rejects(
    createCampaign({
      academicTermId: first.id,
      name: `${testPrefix} draft campaign`,
      createdById: boundaryUser.id,
    }),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'TERM_WRITE_NOT_ALLOWED',
  );
  assert.equal(
    await prisma.debtCollectionCampaign.count({ where: { academicTermId: first.id } }),
    0,
  );

  const attendanceResponse = createMockResponse();
  await recordAttendance({
    body: {
      classId: boundaryClass.id,
      academicTermId: first.id,
      date: '2030-01-15T00:00:00.000Z',
      records: [{ studentId: boundaryStudent.id, status: 'PRESENT' }],
    },
    user: requestUser,
  } as any, attendanceResponse);
  assert.equal(attendanceResponse.statusCode, 409);
  assert.equal(attendanceResponse.body.code, 'TERM_WRITE_NOT_ALLOWED');
  assert.equal(await prisma.attendance.count({ where: { studentId: boundaryStudent.id } }), 0);

  const reportResponse = createMockResponse();
  await generateStudentReport({
    body: { studentId: boundaryStudent.id, termId: first.id },
    user: requestUser,
  } as any, reportResponse);
  assert.equal(reportResponse.statusCode, 409);
  assert.equal(reportResponse.body.code, 'TERM_WRITE_NOT_ALLOWED');
  assert.equal(await prisma.studentTermReport.count({ where: { studentId: boundaryStudent.id } }), 0);

  const paymentResponse = createMockResponse();
  await createPayment({
    body: {
      studentId: boundaryStudent.id,
      academicTermId: first.id,
      amount: 100,
      method: 'CASH',
    },
    user: requestUser,
  } as any, paymentResponse);
  assert.equal(paymentResponse.statusCode, 409);
  assert.equal(paymentResponse.body.code, 'TERM_WRITE_NOT_ALLOWED');
  assert.equal(await prisma.payment.count({ where: { studentId: boundaryStudent.id } }), 0);

  const draftAlert = await prisma.attendanceAlert.create({
    data: {
      studentId: boundaryStudent.id,
      academicTermId: first.id,
      type: 'CONSECUTIVE_ABSENCE',
      message: 'Draft-term alert',
    },
  });
  await assert.rejects(
    attendanceIntelligenceService.resolveAlert(draftAlert.id, boundaryUser.id, 'Should not persist'),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'TERM_WRITE_NOT_ALLOWED',
  );
  assert.equal(
    (await prisma.attendanceAlert.findUniqueOrThrow({ where: { id: draftAlert.id } })).isResolved,
    false,
  );

  await assert.rejects(
    studentRiskService.assessStudent(boundaryStudent.id, first.id),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'TERM_WRITE_NOT_ALLOWED',
  );
  assert.equal(
    await prisma.studentRiskAssessment.count({
      where: { studentId: boundaryStudent.id, termId: first.id },
    }),
    0,
  );

  const draftAssessment = await prisma.assessment.create({
    data: {
      title: `${testPrefix} draft assessment`,
      type: 'QUIZ',
      classId: boundaryClass.id,
      subjectId: boundarySubject.id,
      termId: first.id,
      totalMarks: 1,
      weight: 1,
      date: new Date('2030-01-20T00:00:00.000Z'),
      isOnline: true,
    },
  });
  const draftQuestion = await prisma.question.create({
    data: {
      assessmentId: draftAssessment.id,
      text: 'Lifecycle test question',
      type: 'MULTIPLE_CHOICE',
      points: 1,
      options: {
        create: [
          { text: 'Correct', isCorrect: true },
          { text: 'Incorrect', isCorrect: false },
        ],
      },
    },
    include: { options: true },
  });
  const draftSubmission = await prisma.assessmentSubmission.create({
    data: {
      assessmentId: draftAssessment.id,
      studentId: boundaryStudent.id,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      responses: {
        create: {
          questionId: draftQuestion.id,
          selectedOptionId: draftQuestion.options.find(option => option.isCorrect)!.id,
        },
      },
    },
  });
  await assert.rejects(
    autoGradingService.gradeSubmission(draftSubmission.id),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'TERM_WRITE_NOT_ALLOWED',
  );
  const ungradedSubmission = await prisma.assessmentSubmission.findUniqueOrThrow({
    where: { id: draftSubmission.id },
  });
  assert.equal(ungradedSubmission.status, 'SUBMITTED');
  assert.equal(ungradedSubmission.score, null);

  const concurrent = await Promise.allSettled([
    activateTerm(first.id, first.version),
    activateTerm(second.id, second.version),
  ]);
  const successes = concurrent.filter(result => result.status === 'fulfilled');
  const failures = concurrent.filter(result => result.status === 'rejected');
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);

  const rejection = (failures[0] as PromiseRejectedResult).reason;
  assert.ok(rejection instanceof TermLifecycleError);
  assert.equal(rejection.code, 'ACTIVE_TERM_EXISTS');

  const activeTerms = await prisma.academicTerm.findMany({
    where: { status: AcademicTermStatus.ACTIVE },
  });
  assert.equal(activeTerms.length, 1);
  assert.equal(activeTerms[0].isActive, true);

  const settings = await prisma.schoolSettings.findFirst();
  assert.equal(settings?.currentTermId, activeTerms[0].id);

  const activeBudgetResponse = createMockResponse();
  await createBudget({
    body: {
      name: `${testPrefix} active budget`,
      period: 'term',
      year: 2030,
      termId: activeTerms[0].id,
      startDate: activeTerms[0].startDate.toISOString(),
      endDate: activeTerms[0].endDate.toISOString(),
      items: [{ category: 'TECHNOLOGY', allocated: 750 }],
    },
    user: requestUser,
  } as any, activeBudgetResponse);
  assert.equal(activeBudgetResponse.statusCode, 201);

  const activeBudgetActivationResponse = createMockResponse();
  await activateBudget({
    params: { id: activeBudgetResponse.body.id },
    user: requestUser,
  } as any, activeBudgetActivationResponse);
  assert.equal(activeBudgetActivationResponse.statusCode, 200);
  assert.equal(activeBudgetActivationResponse.body.status, 'ACTIVE');

  const sourceBranch = await prisma.branch.create({
    data: {
      name: `${testPrefix} source branch`,
      code: `LCS-${Date.now()}`,
    },
  });
  const targetBranch = await prisma.branch.create({
    data: {
      name: `${testPrefix} target branch`,
      code: `LCT-${Date.now()}`,
    },
  });

  const activeArchiveClass = await prisma.class.create({
    data: {
      name: `${testPrefix} active archive class`,
      gradeLevel: 8,
      teacherId: boundaryUser.id,
      academicTermId: activeTerms[0].id,
      branchId: sourceBranch.id,
    },
  });
  const activeArchiveStudent = await prisma.student.create({
    data: {
      admissionNumber: `${testPrefix}-active-archive`,
      firstName: 'Active',
      lastName: 'Placement',
      dateOfBirth: new Date('2020-02-01T00:00:00.000Z'),
      gender: 'MALE',
      classId: activeArchiveClass.id,
      branchId: sourceBranch.id,
    },
  });
  await prisma.studentTermEnrollment.create({
    data: {
      studentId: activeArchiveStudent.id,
      academicTermId: activeTerms[0].id,
      classId: activeArchiveClass.id,
      status: 'ACTIVE',
      startsAt: activeTerms[0].startDate,
      createdByUserId: boundaryUser.id,
    },
  });

  const genericBranchChangeResponse = createMockResponse();
  await updateStudent({
    params: { id: activeArchiveStudent.id },
    body: { branchId: targetBranch.id },
    user: requestUser,
  } as any, genericBranchChangeResponse);
  assert.equal(genericBranchChangeResponse.statusCode, 409);
  assert.equal(genericBranchChangeResponse.body.code, 'BRANCH_TRANSFER_REQUIRED');

  const branchTransferResponse = createMockResponse();
  await transferStudent({
    params: { id: sourceBranch.id, studentId: activeArchiveStudent.id },
    body: { toBranchId: targetBranch.id, reason: `${testPrefix} guarded transfer` },
    user: requestUser,
  } as any, branchTransferResponse);
  assert.equal(branchTransferResponse.statusCode, 409);
  assert.equal(branchTransferResponse.body.code, 'ACTIVE_PLACEMENT_BRANCH_TRANSFER_FORBIDDEN');
  assert.equal(
    (await prisma.student.findUniqueOrThrow({ where: { id: activeArchiveStudent.id } })).branchId,
    sourceBranch.id,
  );
  assert.equal(
    await prisma.branchTransfer.count({ where: { entityId: activeArchiveStudent.id } }),
    0,
  );

  const archiveResponse = createMockResponse();
  await deleteStudent({ params: { id: activeArchiveStudent.id } } as any, archiveResponse);
  assert.equal(archiveResponse.statusCode, 409);
  assert.equal(archiveResponse.body.code, 'ACTIVE_PLACEMENT_ARCHIVE_FORBIDDEN');
  assert.equal(
    (await prisma.student.findUniqueOrThrow({ where: { id: activeArchiveStudent.id } })).status,
    'ACTIVE',
  );

  const statusStudent = await prisma.student.create({
    data: {
      admissionNumber: `${testPrefix}-status-sync`,
      firstName: 'Status',
      lastName: 'Synchronization',
      dateOfBirth: new Date('2020-03-01T00:00:00.000Z'),
      gender: 'FEMALE',
      classId: activeArchiveClass.id,
      branchId: sourceBranch.id,
    },
  });
  await prisma.studentTermEnrollment.create({
    data: {
      studentId: statusStudent.id,
      academicTermId: activeTerms[0].id,
      classId: activeArchiveClass.id,
      status: 'ACTIVE',
      startsAt: activeTerms[0].startDate,
      createdByUserId: boundaryUser.id,
    },
  });
  const statusResponse = createMockResponse();
  await updateStudent({
    params: { id: statusStudent.id },
    body: {
      academicTermId: activeTerms[0].id,
      status: 'DROPPED_OUT',
      reason: 'Lifecycle integration withdrawal',
    },
    user: requestUser,
  } as any, statusResponse);
  assert.equal(statusResponse.statusCode, 200);
  assert.equal(statusResponse.body.status, 'DROPPED_OUT');
  const synchronizedEnrollment = await prisma.studentTermEnrollment.findUniqueOrThrow({
    where: {
      studentId_academicTermId: {
        studentId: statusStudent.id,
        academicTermId: activeTerms[0].id,
      },
    },
  });
  assert.equal(synchronizedEnrollment.status, 'WITHDRAWN');
  assert.ok(synchronizedEnrollment.endsAt);

  await prisma.schoolSettings.updateMany({ data: { currentTermId: null } });
  const idempotentActivation = await activateTerm(activeTerms[0].id, activeTerms[0].version);
  assert.equal(idempotentActivation.version, activeTerms[0].version);
  assert.equal((await prisma.schoolSettings.findFirst())?.currentTermId, activeTerms[0].id);

  await assert.rejects(
    deleteDraftTerm(activeTerms[0].id),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'TERM_WRITE_NOT_ALLOWED',
  );

  const closing = await beginClosingTerm(activeTerms[0].id, activeTerms[0].version);
  assert.equal(closing.status, AcademicTermStatus.CLOSING);
  assert.equal(closing.isActive, false);
  assert.equal((await prisma.schoolSettings.findFirst())?.currentTermId, null);

  const budgetCloseResponse = createMockResponse();
  await closeBudget({
    params: { id: activeBudgetResponse.body.id },
    user: requestUser,
  } as any, budgetCloseResponse);
  assert.equal(budgetCloseResponse.statusCode, 200);
  assert.equal(budgetCloseResponse.body.status, 'CLOSED');

  const nextTermId = activeTerms[0].id === first.id ? second.id : first.id;

  const snapshotToken = Date.now();
  const closingInvoiceNumber = `LIFECYCLE-CLOSING-${snapshotToken}`;
  const otherInvoiceNumber = `LIFECYCLE-OTHER-${snapshotToken}`;
  const closingInvoice = await prisma.invoice.create({
    data: {
      invoiceNumber: closingInvoiceNumber,
      studentId: boundaryStudent.id,
      termId: closing.id,
      dueDate: closing.endDate,
      subtotal: 125,
      totalAmount: 125,
      balanceDue: 125,
    },
  });
  const otherInvoice = await prisma.invoice.create({
    data: {
      invoiceNumber: otherInvoiceNumber,
      studentId: boundaryStudent.id,
      termId: nextTermId,
      dueDate: new Date('2030-06-30T00:00:00.000Z'),
      subtotal: 225,
      totalAmount: 225,
      balanceDue: 225,
    },
  });
  const closingPayment = await prisma.payment.create({
    data: {
      transactionId: `LIFECYCLE-CLOSING-PAY-${snapshotToken}`,
      studentId: boundaryStudent.id,
      academicTermId: closing.id,
      amount: 50,
      method: 'CASH',
      status: 'COMPLETED',
      recordedByUserId: boundaryUser.id,
    },
  });
  const otherPayment = await prisma.payment.create({
    data: {
      transactionId: `LIFECYCLE-OTHER-PAY-${snapshotToken}`,
      studentId: boundaryStudent.id,
      academicTermId: nextTermId,
      amount: 60,
      method: 'CASH',
      status: 'COMPLETED',
      recordedByUserId: boundaryUser.id,
    },
  });
  const closingRefundNumber = `LIFECYCLE-REF-CLOSING-${snapshotToken}`;
  const otherRefundNumber = `LIFECYCLE-REF-OTHER-${snapshotToken}`;
  await prisma.refund.createMany({
    data: [
      {
        refundNumber: closingRefundNumber,
        paymentId: closingPayment.id,
        studentId: boundaryStudent.id,
        amount: 5,
        reason: 'Closing-term integration refund',
        method: 'cash_back',
        requestedBy: boundaryUser.id,
      },
      {
        refundNumber: otherRefundNumber,
        paymentId: otherPayment.id,
        studentId: boundaryStudent.id,
        amount: 6,
        reason: 'Other-term integration refund',
        method: 'cash_back',
        requestedBy: boundaryUser.id,
      },
    ],
  });
  const closingCreditNoteNumber = `LIFECYCLE-CN-CLOSING-${snapshotToken}`;
  const otherCreditNoteNumber = `LIFECYCLE-CN-OTHER-${snapshotToken}`;
  await prisma.creditNote.createMany({
    data: [
      {
        creditNoteNumber: closingCreditNoteNumber,
        invoiceId: closingInvoice.id,
        amount: 10,
        reason: 'Closing-term integration credit',
        issuedBy: boundaryUser.id,
      },
      {
        creditNoteNumber: otherCreditNoteNumber,
        invoiceId: otherInvoice.id,
        amount: 11,
        reason: 'Other-term integration credit',
        issuedBy: boundaryUser.id,
      },
    ],
  });

  const closingReportResponse = createMockResponse();
  await saveReport({
    body: {
      title: `${testPrefix} closing financial report`,
      reportType: 'CUSTOM',
      termId: closing.id,
    },
    user: requestUser,
  } as any, closingReportResponse);
  assert.equal(closingReportResponse.statusCode, 200);
  assert.equal(closingReportResponse.body.report.termId, closing.id);
  assert.equal(closingReportResponse.body.report.data.academicTermId, closing.id);
  const snapshotInvoiceNumbers = closingReportResponse.body.report.data.invoices.recent
    .map((invoice: { invoiceNumber: string }) => invoice.invoiceNumber);
  assert.ok(snapshotInvoiceNumbers.includes(closingInvoiceNumber));
  assert.ok(!snapshotInvoiceNumbers.includes(otherInvoiceNumber));
  const snapshotRefundNumbers = closingReportResponse.body.report.data.refunds
    .map((refund: { refundNumber: string }) => refund.refundNumber);
  assert.ok(snapshotRefundNumbers.includes(closingRefundNumber));
  assert.ok(!snapshotRefundNumbers.includes(otherRefundNumber));
  const snapshotCreditNoteNumbers = closingReportResponse.body.report.data.creditNotes
    .map((creditNote: { number: string }) => creditNote.number);
  assert.ok(snapshotCreditNoteNumbers.includes(closingCreditNoteNumber));
  assert.ok(!snapshotCreditNoteNumbers.includes(otherCreditNoteNumber));

  await assert.rejects(
    activateTerm(nextTermId),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'TERM_CLOSING_IN_PROGRESS',
  );

  await prisma.termCloseSnapshot.create({
    data: {
      academicTermId: closing.id,
      checksum: 'integration-source-close-checksum',
      snapshot: { source: 'term-lifecycle-integration-test' },
      createdByUserId: 'integration-test-user',
    },
  });
  await runTermLifecycleTransaction(tx => closeTermInTransaction(
    tx,
    closing.id,
    'integration-test-user',
    closing.version,
  ));

  const nextTerm = await prisma.academicTerm.findUniqueOrThrow({ where: { id: nextTermId } });
  const activatedNext = await activateTerm(nextTermId, nextTerm.version);
  assert.equal(activatedNext.status, AcademicTermStatus.ACTIVE);

  await assert.rejects(
    beginClosingTerm(nextTermId, activatedNext.version - 1),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'STALE_TERM_VERSION',
  );

  const firstClosingAttempt = await beginClosingTerm(nextTermId, activatedNext.version);
  const reopened = await activateTerm(nextTermId, firstClosingAttempt.version);
  assert.equal(reopened.status, AcademicTermStatus.ACTIVE);
  assert.equal(reopened.isActive, true);
  assert.equal((await prisma.schoolSettings.findFirst())?.currentTermId, reopened.id);

  const nextClosing = await beginClosingTerm(nextTermId, reopened.version);
  await assert.rejects(
    runTermLifecycleTransaction(tx => closeTermInTransaction(
      tx,
      nextTermId,
      'integration-test-user',
      nextClosing.version,
    )),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'TERM_CLOSE_SNAPSHOT_REQUIRED',
  );

  await prisma.termCloseSnapshot.create({
    data: {
      academicTermId: nextTermId,
      checksum: 'integration-test-checksum',
      snapshot: { source: 'term-lifecycle-integration-test' },
      createdByUserId: 'integration-test-user',
    },
  });
  const closed = await runTermLifecycleTransaction(tx => closeTermInTransaction(
    tx,
    nextTermId,
    'integration-test-user',
    nextClosing.version,
  ));
  assert.equal(closed.status, AcademicTermStatus.CLOSED);
  assert.equal(closed.isActive, false);
  assert.equal(closed.closedByUserId, 'integration-test-user');

  const timetableResponse = createMockResponse();
  await createTimetablePeriod({
    body: {
      classIds: [boundaryClass.id],
      subjectId: boundarySubject.id,
      teacherId: boundaryUser.id,
      dayOfWeek: 'MONDAY',
      startTime: '08:00',
      endTime: '08:40',
      academicTermId: first.id,
    },
    user: requestUser,
  } as any, timetableResponse);
  assert.equal(timetableResponse.statusCode, 409);
  assert.equal(timetableResponse.body.code, 'TERM_WRITE_NOT_ALLOWED');
  assert.equal(
    await prisma.timetablePeriod.count({ where: { academicTermId: first.id } }),
    0,
  );

  await assert.rejects(
    runTermWriteTransaction(nextTermId, 'ACADEMIC_ACTIVITY', async () => true),
    (error: unknown) => error instanceof TermLifecycleError
      && error.code === 'TERM_WRITE_NOT_ALLOWED',
  );
  assert.equal(
    await runTermWriteTransaction(nextTermId, 'FINANCIAL_RECEIPT', async () => true),
    true,
  );

  const createdActive = await createTerm({
    name: `${testPrefix} create active`,
    startDate: new Date('2030-09-01T00:00:00.000Z'),
    endDate: new Date('2030-12-15T00:00:00.000Z'),
    activate: true,
  });
  assert.equal(createdActive.status, AcademicTermStatus.ACTIVE);
  assert.equal(createdActive.isActive, true);
  assert.equal((await prisma.schoolSettings.findFirst())?.currentTermId, createdActive.id);

  const disposableDraft = await createTerm({
    name: `${testPrefix} disposable draft`,
    startDate: new Date('2031-01-01T00:00:00.000Z'),
    endDate: new Date('2031-03-31T00:00:00.000Z'),
  });
  await deleteDraftTerm(disposableDraft.id);
  assert.equal(
    await prisma.academicTerm.findUnique({ where: { id: disposableDraft.id } }),
    null,
  );
});
