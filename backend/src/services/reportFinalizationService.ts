import {
  AcademicTermStatus,
  Prisma,
  StudentTermReportStatus,
} from '@prisma/client';
import { prisma } from '../utils/prisma';
import { buildAverageRankMap } from '../utils/academicValidation';
import { runTermWriteTransaction } from './termLifecycleService';
import { generateSingleStudentReport } from '../controllers/reportCardController';
import { PLACEMENT_ROSTER_STATUSES } from './studentPlacementService';
import { createReportSnapshotChecksum } from '../utils/reportSnapshotIntegrity';

export type ReportLifecycleClient = Prisma.TransactionClient | typeof prisma;

export type ReportReadinessCode =
  | 'TERM_NOT_CLOSING'
  | 'PLACEMENT_MISSING'
  | 'CLASS_MISMATCH'
  | 'REPORT_NOT_GENERATED'
  | 'NO_REQUIRED_SUBJECTS'
  | 'SUBJECT_HAS_NO_ASSESSMENTS'
  | 'SUBJECT_WEIGHT_INCOMPLETE'
  | 'ASSESSMENT_RESULT_MISSING'
  | 'TERM_RESULT_MISSING'
  | 'TERM_RESULT_STALE'
  | 'GRADE_UNRESOLVED'
  | 'NO_INSTRUCTIONAL_DAYS'
  | 'NO_ELIGIBLE_INSTRUCTIONAL_DAYS'
  | 'ATTENDANCE_MISSING'
  | 'DUPLICATE_ATTENDANCE'
  | 'NO_STUDENTS_ENROLLED';

export interface ReportReadinessBlocker {
  code: ReportReadinessCode;
  message: string;
  studentId?: string;
  subjectId?: string;
  assessmentId?: string;
  dates?: string[];
}

export interface StudentReportReadiness {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  termId: string;
  classId: string | null;
  className: string | null;
  reportId: string | null;
  reportStatus: StudentTermReportStatus | 'NOT_GENERATED';
  ready: boolean;
  blockers: ReportReadinessBlocker[];
  metrics: {
    requiredSubjects: number;
    assessments: number;
    recordedResults: number;
    instructionalDays: number;
    attendanceDays: number;
  };
}

export interface ClassReportReadiness {
  termId: string;
  classId: string;
  className: string;
  ready: boolean;
  checkedAt: string;
  counts: {
    students: number;
    ready: number;
    blocked: number;
    instructionalDays: number;
  };
  blockers: ReportReadinessBlocker[];
  students: StudentReportReadiness[];
}

export class ReportLifecycleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ReportLifecycleError';
  }
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

const reportLock = async (
  tx: Prisma.TransactionClient,
  key: string,
) => {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sync:student-term-report:${key}`}))`;
};

const assertClosingTerm = async (
  client: ReportLifecycleClient,
  termId: string,
) => {
  const term = await client.academicTerm.findUnique({
    where: { id: termId },
    select: { status: true },
  });
  if (!term) {
    throw new ReportLifecycleError('TERM_NOT_FOUND', 'Academic term not found', 404);
  }
  if (term.status !== AcademicTermStatus.CLOSING) {
    throw new ReportLifecycleError(
      'TERM_NOT_CLOSING',
      'Reports can only be finalized or published while the academic term is closing',
    );
  }
};

export const getStudentReportReadiness = async (
  studentId: string,
  termId: string,
  options: { client?: ReportLifecycleClient; expectedClassId?: string } = {},
): Promise<StudentReportReadiness> => {
  const client = options.client ?? prisma;
  const [student, term, placement, report, gradingScales] = await Promise.all([
    client.student.findUnique({
      where: { id: studentId },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true },
    }),
    client.academicTerm.findUnique({
      where: { id: termId },
      select: { id: true, status: true, startDate: true, endDate: true },
    }),
    client.studentTermEnrollment.findUnique({
      where: { studentId_academicTermId: { studentId, academicTermId: termId } },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            academicTermId: true,
            subjects: { select: { id: true, name: true } },
          },
        },
      },
    }),
    client.studentTermReport.findUnique({
      where: { studentId_termId: { studentId, termId } },
      select: { id: true, classId: true, status: true },
    }),
    client.gradingScale.findMany({ orderBy: { minScore: 'desc' } }),
  ]);

  if (!student) {
    throw new ReportLifecycleError('STUDENT_NOT_FOUND', 'Student not found', 404);
  }
  if (!term) {
    throw new ReportLifecycleError('TERM_NOT_FOUND', 'Academic term not found', 404);
  }

  const blockers: ReportReadinessBlocker[] = [];
  if (!placement) {
    blockers.push({
      code: 'PLACEMENT_MISSING',
      message: 'The student has no authoritative placement in this term',
      studentId,
    });
  }

  const classId = placement?.classId ?? null;
  if (placement && placement.class.academicTermId !== termId) {
    blockers.push({
      code: 'CLASS_MISMATCH',
      message: 'The authoritative placement references a class from another term',
      studentId,
    });
  }
  if (placement && options.expectedClassId && placement.classId !== options.expectedClassId) {
    blockers.push({
      code: 'CLASS_MISMATCH',
      message: 'The student is not placed in the selected class for this term',
      studentId,
    });
  }
  if (report && placement && report.classId !== placement.classId) {
    blockers.push({
      code: 'CLASS_MISMATCH',
      message: 'The report class does not match the authoritative term placement',
      studentId,
    });
  }
  if (!report) {
    blockers.push({
      code: 'REPORT_NOT_GENERATED',
      message: 'Generate the draft report before finalization',
      studentId,
    });
  }
  if ((!report || report.status === StudentTermReportStatus.DRAFT)
    && term.status !== AcademicTermStatus.CLOSING) {
    blockers.push({
      code: 'TERM_NOT_CLOSING',
      message: 'Move the term to closing before finalizing reports',
      studentId,
    });
  }

  let assessmentCount = 0;
  let recordedResults = 0;
  let instructionalDayCount = 0;
  let attendanceDayCount = 0;
  const requiredSubjects = placement?.class.subjects ?? [];

  if (placement) {
    if (requiredSubjects.length === 0) {
      blockers.push({
        code: 'NO_REQUIRED_SUBJECTS',
        message: 'The class has no assigned subjects',
        studentId,
      });
    }

    const eligibleStart = placement.startsAt > term.startDate ? placement.startsAt : term.startDate;
    const placementEnd = placement.endsAt ?? term.endDate;
    const eligibleEnd = placementEnd < term.endDate ? placementEnd : term.endDate;

    const [termInstructionalDayCount, instructionalDays, assessments, termResults, attendance] = await Promise.all([
      client.termInstructionalDay.count({
        where: { academicTermId: termId, isInstructional: true },
      }),
      eligibleEnd >= eligibleStart
        ? client.termInstructionalDay.findMany({
          where: {
            academicTermId: termId,
            isInstructional: true,
            date: { gte: eligibleStart, lte: eligibleEnd },
          },
          select: { date: true },
          orderBy: { date: 'asc' },
        })
        : Promise.resolve([]),
      client.assessment.findMany({
        where: { classId: placement.classId, termId },
        select: {
          id: true,
          subjectId: true,
          weight: true,
          totalMarks: true,
          results: {
            where: { studentId },
            select: { id: true, score: true },
          },
        },
      }),
      client.termResult.findMany({
        where: { studentId, termId, classId: placement.classId },
        select: { subjectId: true, totalScore: true, grade: true },
      }),
      eligibleEnd >= eligibleStart
        ? client.attendance.findMany({
          where: {
            studentId,
            classId: placement.classId,
            academicTermId: termId,
            date: { gte: eligibleStart, lte: eligibleEnd },
          },
          select: { date: true },
        })
        : Promise.resolve([]),
    ]);

    assessmentCount = assessments.length;
    recordedResults = assessments.filter(assessment => assessment.results.length > 0).length;
    instructionalDayCount = instructionalDays.length;
    const instructionalKeys = new Set(instructionalDays.map(day => dayKey(day.date)));
    const attendanceCounts = new Map<string, number>();
    attendance.forEach(record => {
      const date = dayKey(record.date);
      if (instructionalKeys.has(date)) {
        attendanceCounts.set(date, (attendanceCounts.get(date) ?? 0) + 1);
      }
    });
    attendanceDayCount = attendanceCounts.size;

    if (termInstructionalDayCount === 0) {
      blockers.push({
        code: 'NO_INSTRUCTIONAL_DAYS',
        message: 'The term has no explicit instructional days',
        studentId,
      });
    } else if (instructionalDays.length === 0) {
      blockers.push({
        code: 'NO_ELIGIBLE_INSTRUCTIONAL_DAYS',
        message: 'The student has no instructional days within the placement dates',
        studentId,
      });
    }

    const duplicateDates = [...attendanceCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([date]) => date);
    if (duplicateDates.length > 0) {
      blockers.push({
        code: 'DUPLICATE_ATTENDANCE',
        message: 'Duplicate attendance records must be reconciled',
        studentId,
        dates: duplicateDates,
      });
    }

    const missingAttendanceDates = instructionalDays
      .map(day => dayKey(day.date))
      .filter(date => !attendanceCounts.has(date));
    if (missingAttendanceDates.length > 0) {
      blockers.push({
        code: 'ATTENDANCE_MISSING',
        message: `Attendance is missing for ${missingAttendanceDates.length} instructional day${missingAttendanceDates.length === 1 ? '' : 's'}`,
        studentId,
        dates: missingAttendanceDates,
      });
    }

    const termResultMap = new Map(termResults.map(result => [result.subjectId, result]));
    for (const subject of requiredSubjects) {
      const subjectAssessments = assessments.filter(assessment => assessment.subjectId === subject.id);
      if (subjectAssessments.length === 0) {
        blockers.push({
          code: 'SUBJECT_HAS_NO_ASSESSMENTS',
          message: `${subject.name} has no assessments`,
          studentId,
          subjectId: subject.id,
        });
        continue;
      }

      const totalWeight = subjectAssessments.reduce(
        (sum, assessment) => sum + Number(assessment.weight),
        0,
      );
      if (Math.abs(totalWeight - 100) > 0.001) {
        blockers.push({
          code: 'SUBJECT_WEIGHT_INCOMPLETE',
          message: `${subject.name} assessment weights total ${totalWeight}%, not 100%`,
          studentId,
          subjectId: subject.id,
        });
      }

      for (const assessment of subjectAssessments) {
        if (assessment.results.length === 0) {
          blockers.push({
            code: 'ASSESSMENT_RESULT_MISSING',
            message: `${subject.name} has an assessment without a recorded result`,
            studentId,
            subjectId: subject.id,
            assessmentId: assessment.id,
          });
        }
      }

      const expectedScore = Math.round(subjectAssessments.reduce((sum, assessment) => {
        const result = assessment.results[0];
        if (!result) return sum;
        return sum + ((Number(result.score) / Number(assessment.totalMarks)) * Number(assessment.weight));
      }, 0));
      const expectedScale = gradingScales.find(scale => (
        expectedScore >= scale.minScore && expectedScore <= scale.maxScore
      ));
      const termResult = termResultMap.get(subject.id);
      if (!termResult) {
        blockers.push({
          code: 'TERM_RESULT_MISSING',
          message: `${subject.name} has no generated term result`,
          studentId,
          subjectId: subject.id,
        });
      } else {
        if (Number(termResult.totalScore) !== expectedScore
          || (expectedScale && termResult.grade !== expectedScale.grade)) {
          blockers.push({
            code: 'TERM_RESULT_STALE',
            message: `${subject.name} must be regenerated from the latest assessment results`,
            studentId,
            subjectId: subject.id,
          });
        }
        if (!expectedScale || termResult.grade === 'N/A') {
          blockers.push({
            code: 'GRADE_UNRESOLVED',
            message: `${subject.name} score is not covered by the grading scale`,
            studentId,
            subjectId: subject.id,
          });
        }
      }
    }
  }

  return {
    studentId,
    studentName: `${student.firstName} ${student.lastName}`,
    admissionNumber: student.admissionNumber,
    termId,
    classId,
    className: placement?.class.name ?? null,
    reportId: report?.id ?? null,
    reportStatus: report?.status ?? 'NOT_GENERATED',
    ready: blockers.length === 0,
    blockers,
    metrics: {
      requiredSubjects: requiredSubjects.length,
      assessments: assessmentCount,
      recordedResults,
      instructionalDays: instructionalDayCount,
      attendanceDays: attendanceDayCount,
    },
  };
};

export const getClassReportReadiness = async (
  classId: string,
  termId: string,
  client: ReportLifecycleClient = prisma,
): Promise<ClassReportReadiness> => {
  const [classInfo, enrollments, instructionalDays] = await Promise.all([
    client.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, academicTermId: true },
    }),
    client.studentTermEnrollment.findMany({
      where: {
        classId,
        academicTermId: termId,
        status: { in: PLACEMENT_ROSTER_STATUSES },
      },
      select: { studentId: true },
      orderBy: [{ student: { lastName: 'asc' } }, { student: { firstName: 'asc' } }],
    }),
    client.termInstructionalDay.count({
      where: { academicTermId: termId, isInstructional: true },
    }),
  ]);

  if (!classInfo) {
    throw new ReportLifecycleError('CLASS_NOT_FOUND', 'Class not found', 404);
  }
  if (classInfo.academicTermId !== termId) {
    throw new ReportLifecycleError(
      'CLASS_MISMATCH',
      'Selected class does not belong to the requested academic term',
      400,
    );
  }

  const students: StudentReportReadiness[] = [];
  for (const enrollment of enrollments) {
    students.push(await getStudentReportReadiness(enrollment.studentId, termId, {
      client,
      expectedClassId: classId,
    }));
  }

  const blockers = students.flatMap(student => student.blockers);
  if (students.length === 0) {
    blockers.push({
      code: 'NO_STUDENTS_ENROLLED',
      message: 'The class has no students placed in this term',
    });
  }

  return {
    termId,
    classId,
    className: classInfo.name,
    ready: blockers.length === 0,
    checkedAt: new Date().toISOString(),
    counts: {
      students: students.length,
      ready: students.filter(student => student.ready).length,
      blocked: students.filter(student => !student.ready).length,
      instructionalDays,
    },
    blockers,
    students,
  };
};

export const buildReportSnapshot = async (
  reportId: string,
  client: ReportLifecycleClient = prisma,
) => {
  const report = await client.studentTermReport.findUnique({
    where: { id: reportId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          admissionNumber: true,
          dateOfBirth: true,
          gender: true,
        },
      },
      class: { select: { id: true, name: true, gradeLevel: true } },
      term: {
        select: { id: true, name: true, startDate: true, endDate: true, status: true },
      },
    },
  });
  if (!report) {
    throw new ReportLifecycleError('REPORT_NOT_FOUND', 'Report not found', 404);
  }

  const [results, classResults, settings] = await Promise.all([
    client.termResult.findMany({
      where: { studentId: report.studentId, termId: report.termId, classId: report.classId },
      include: { subject: { select: { id: true, name: true, code: true } } },
      orderBy: { subject: { name: 'asc' } },
    }),
    client.termResult.findMany({
      where: { termId: report.termId, classId: report.classId },
      select: { studentId: true, totalScore: true },
    }),
    client.schoolSettings.findFirst({
      select: {
        schoolName: true,
        schoolAddress: true,
        schoolPhone: true,
        schoolEmail: true,
        logoUrl: true,
      },
    }),
  ]);

  const totalScore = results.reduce((sum, result) => sum + Number(result.totalScore), 0);
  const averageScore = results.length > 0 ? totalScore / results.length : 0;
  const attendancePercentage = report.totalDays
    ? ((report.totalAttendance ?? 0) / report.totalDays) * 100
    : 0;
  const startYear = report.term.startDate.getUTCFullYear();
  const endYear = report.term.endDate.getUTCFullYear();
  const academicYear = startYear === endYear ? String(startYear) : `${startYear}/${endYear}`;

  const payload = {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    report: {
      id: report.id,
      studentId: report.studentId,
      termId: report.termId,
      classId: report.classId,
      status: report.status,
      currentVersion: report.currentVersion,
      finalizedAt: report.finalizedAt?.toISOString() ?? null,
      finalizedByUserId: report.finalizedByUserId,
      publishedAt: report.publishedAt?.toISOString() ?? null,
      publishedByUserId: report.publishedByUserId,
      classTeacherRemark: report.classTeacherRemark,
      principalRemark: report.principalRemark,
      totalAttendance: report.totalAttendance ?? 0,
      totalDays: report.totalDays ?? 0,
      attendancePercentage,
      totalScore,
      averageScore,
      rank: buildAverageRankMap(classResults).get(report.studentId) ?? null,
      academicYear,
      student: {
        ...report.student,
        dateOfBirth: report.student.dateOfBirth.toISOString(),
      },
      class: report.class,
      term: {
        ...report.term,
        startDate: report.term.startDate.toISOString(),
        endDate: report.term.endDate.toISOString(),
      },
      results: results.map(result => ({
        id: result.id,
        subjectId: result.subjectId,
        subjectName: result.subject.name,
        subjectCode: result.subject.code,
        totalScore: Number(result.totalScore),
        grade: result.grade,
        remarks: result.remarks,
      })),
      school: settings,
    },
  };
  const checksum = createReportSnapshotChecksum(payload);
  return {
    ...payload,
    integrity: { algorithm: 'SHA-256', checksum },
  };
};

const appendReportVersion = async (
  tx: Prisma.TransactionClient,
  reportId: string,
  version: number,
  status: StudentTermReportStatus,
  actorUserId: string,
  reason: string,
) => {
  const snapshot = await buildReportSnapshot(reportId, tx);
  return tx.studentTermReportVersion.create({
    data: {
      reportId,
      version,
      status,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      reason,
      createdByUserId: actorUserId,
    },
  });
};

const finalizeOneInTransaction = async (
  tx: Prisma.TransactionClient,
  studentId: string,
  termId: string,
  actorUserId: string,
) => {
  await reportLock(tx, `${studentId}:${termId}`);
  const current = await tx.studentTermReport.findUnique({
    where: { studentId_termId: { studentId, termId } },
  });
  if (current?.status === StudentTermReportStatus.FINALIZED
    || current?.status === StudentTermReportStatus.PUBLISHED) {
    return { report: current, changed: false };
  }

  await generateSingleStudentReport(studentId, termId, tx);
  const readiness = await getStudentReportReadiness(studentId, termId, { client: tx });
  if (!readiness.ready) {
    throw new ReportLifecycleError(
      'REPORT_NOT_READY',
      'The report cannot be finalized until all readiness blockers are resolved',
      409,
      readiness,
    );
  }

  const draft = await tx.studentTermReport.findUniqueOrThrow({
    where: { studentId_termId: { studentId, termId } },
  });
  const finalizedAt = new Date();
  const report = await tx.studentTermReport.update({
    where: { id: draft.id },
    data: {
      status: StudentTermReportStatus.FINALIZED,
      finalizedAt,
      finalizedByUserId: actorUserId,
      publishedAt: null,
      publishedByUserId: null,
    },
  });
  await appendReportVersion(
    tx,
    report.id,
    report.currentVersion,
    StudentTermReportStatus.FINALIZED,
    actorUserId,
    'Initial report finalization',
  );
  return { report, changed: true };
};

const publishOneInTransaction = async (
  tx: Prisma.TransactionClient,
  studentId: string,
  termId: string,
  actorUserId: string,
) => {
  await reportLock(tx, `${studentId}:${termId}`);
  const current = await tx.studentTermReport.findUnique({
    where: { studentId_termId: { studentId, termId } },
  });
  if (!current) {
    throw new ReportLifecycleError('REPORT_NOT_FOUND', 'Report not found', 404);
  }
  if (current.status === StudentTermReportStatus.PUBLISHED) {
    return { report: current, changed: false };
  }
  if (current.status !== StudentTermReportStatus.FINALIZED) {
    throw new ReportLifecycleError(
      'REPORT_NOT_FINALIZED',
      'Only finalized reports can be published',
    );
  }

  const nextVersion = current.currentVersion + 1;
  const report = await tx.studentTermReport.update({
    where: { id: current.id },
    data: {
      status: StudentTermReportStatus.PUBLISHED,
      currentVersion: nextVersion,
      publishedAt: new Date(),
      publishedByUserId: actorUserId,
    },
  });
  await appendReportVersion(
    tx,
    report.id,
    nextVersion,
    StudentTermReportStatus.PUBLISHED,
    actorUserId,
    'Report published',
  );
  return { report, changed: true };
};

export const finalizeStudentReport = async (
  studentId: string,
  termId: string,
  actorUserId: string,
) => {
  const existing = await prisma.studentTermReport.findUnique({
    where: { studentId_termId: { studentId, termId } },
  });
  if (existing?.status === StudentTermReportStatus.FINALIZED
    || existing?.status === StudentTermReportStatus.PUBLISHED) {
    return { report: existing, changed: false };
  }

  return runTermWriteTransaction(termId, 'FINALIZATION', async tx => {
    await assertClosingTerm(tx, termId);
    return finalizeOneInTransaction(tx, studentId, termId, actorUserId);
  });
};

export const publishStudentReport = async (
  studentId: string,
  termId: string,
  actorUserId: string,
) => {
  const existing = await prisma.studentTermReport.findUnique({
    where: { studentId_termId: { studentId, termId } },
  });
  if (existing?.status === StudentTermReportStatus.PUBLISHED) {
    return { report: existing, changed: false };
  }

  return runTermWriteTransaction(termId, 'FINALIZATION', async tx => {
    await assertClosingTerm(tx, termId);
    return publishOneInTransaction(tx, studentId, termId, actorUserId);
  });
};

export const finalizeClassReports = async (
  classId: string,
  termId: string,
  actorUserId: string,
) => runTermWriteTransaction(termId, 'FINALIZATION', async tx => {
  await assertClosingTerm(tx, termId);
  await reportLock(tx, `class:${classId}:${termId}`);
  const enrollments = await tx.studentTermEnrollment.findMany({
    where: {
      classId,
      academicTermId: termId,
      status: { in: PLACEMENT_ROSTER_STATUSES },
    },
    select: { studentId: true },
  });
  if (enrollments.length === 0) {
    throw new ReportLifecycleError(
      'NO_STUDENTS_ENROLLED',
      'The class has no students placed in this term',
    );
  }

  const readinessFailures: StudentReportReadiness[] = [];
  for (const enrollment of enrollments) {
    const current = await tx.studentTermReport.findUnique({
      where: { studentId_termId: { studentId: enrollment.studentId, termId } },
      select: { status: true },
    });
    if (current?.status === StudentTermReportStatus.FINALIZED
      || current?.status === StudentTermReportStatus.PUBLISHED) continue;
    await generateSingleStudentReport(enrollment.studentId, termId, tx);
    const readiness = await getStudentReportReadiness(enrollment.studentId, termId, {
      client: tx,
      expectedClassId: classId,
    });
    if (!readiness.ready) readinessFailures.push(readiness);
  }
  if (readinessFailures.length > 0) {
    throw new ReportLifecycleError(
      'CLASS_REPORTS_NOT_READY',
      'No reports were finalized because one or more students have readiness blockers',
      409,
      { students: readinessFailures },
    );
  }

  let changed = 0;
  for (const enrollment of enrollments) {
    const result = await finalizeOneInTransaction(tx, enrollment.studentId, termId, actorUserId);
    if (result.changed) changed += 1;
  }
  return { total: enrollments.length, changed, unchanged: enrollments.length - changed };
});

export const publishClassReports = async (
  classId: string,
  termId: string,
  actorUserId: string,
) => runTermWriteTransaction(termId, 'FINALIZATION', async tx => {
  await assertClosingTerm(tx, termId);
  await reportLock(tx, `class:${classId}:${termId}`);
  const [reports, enrollmentCount] = await Promise.all([
    tx.studentTermReport.findMany({
      where: { classId, termId },
      select: { studentId: true, status: true },
    }),
    tx.studentTermEnrollment.count({
      where: {
        classId,
        academicTermId: termId,
        status: { in: PLACEMENT_ROSTER_STATUSES },
      },
    }),
  ]);
  if (reports.length === 0) {
    throw new ReportLifecycleError('REPORT_NOT_FOUND', 'No class reports were found', 404);
  }
  if (reports.length !== enrollmentCount) {
    throw new ReportLifecycleError(
      'CLASS_REPORTS_MISSING',
      'No reports were published because every enrolled student must have a report',
      409,
      { enrolledStudents: enrollmentCount, reports: reports.length },
    );
  }
  const draftCount = reports.filter(report => report.status === StudentTermReportStatus.DRAFT).length;
  if (draftCount > 0) {
    throw new ReportLifecycleError(
      'CLASS_REPORTS_NOT_FINALIZED',
      'No reports were published because every class report must be finalized first',
      409,
      { draftCount },
    );
  }

  let changed = 0;
  for (const report of reports) {
    const result = await publishOneInTransaction(tx, report.studentId, termId, actorUserId);
    if (result.changed) changed += 1;
  }
  return { total: reports.length, changed, unchanged: reports.length - changed };
});

export const getReportVersions = async (reportId: string) => (
  prisma.studentTermReportVersion.findMany({
    where: { reportId },
    select: {
      id: true,
      reportId: true,
      version: true,
      status: true,
      reason: true,
      createdByUserId: true,
      createdAt: true,
    },
    orderBy: { version: 'desc' },
  })
);

export const getReportVersionSnapshot = async (
  reportId: string,
  version: number,
) => prisma.studentTermReportVersion.findUnique({
  where: { reportId_version: { reportId, version } },
});
