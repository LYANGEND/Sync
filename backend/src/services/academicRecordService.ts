import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import { createNotification } from './notificationService';
import { runTermWriteTransaction } from './termLifecycleService';
import { AcademicScopeError, ensureAcademicClassAccess, ensureStudentRecordAccess, ensureStudentsBelongToClass } from '../utils/academicScope';
import { isDateWithinRangeByDay } from '../utils/academicValidation';

// Writes to attendance, marks and report remarks, shared by the HTTP controllers and Master AI
// so both apply the same access, term and placement rules.

export interface AttendanceEntry {
  studentId: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE';
  reason?: string;
  lateMinutes?: number;
  notes?: string;
}

/** Replace a class's attendance for one day. Raises consecutive-absence alerts. */
export async function recordClassAttendance(
  req: AuthRequest,
  input: { classId: string; academicTermId: string; date: string; records: AttendanceEntry[] },
): Promise<{ count: number; attendanceDate: Date }> {
  const { classId, academicTermId, date, records } = input;
  const userId = req.user!.userId;
  const classInfo = await ensureAcademicClassAccess(req, classId, { academicTermId });
  if (!isDateWithinRangeByDay(date, classInfo.academicTerm.startDate, classInfo.academicTerm.endDate)) {
    throw new AcademicScopeError(400, 'Attendance date must fall within the selected academic term');
  }

  const attendanceDate = new Date(date);
  const nextDay = new Date(attendanceDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const created = await runTermWriteTransaction(academicTermId, 'ACADEMIC_ACTIVITY', async (tx) => {
    const instructionalDay = await tx.termInstructionalDay.findFirst({
      where: {
        academicTermId,
        isInstructional: true,
        date: { gte: attendanceDate, lt: nextDay },
      },
      select: { id: true },
    });
    if (!instructionalDay) {
      throw new AcademicScopeError(
        400,
        'Attendance can only be recorded on an instructional day configured for this term',
      );
    }

    await ensureStudentsBelongToClass(
      classId,
      academicTermId,
      records.map((record) => record.studentId),
      { client: tx },
    );

    await tx.attendance.deleteMany({
      where: { classId, date: { gte: attendanceDate, lt: nextDay } },
    });

    const rows = await Promise.all(
      records.map((record) =>
        tx.attendance.create({
          data: {
            classId,
            academicTermId,
            date: attendanceDate,
            studentId: record.studentId,
            status: record.status,
            reason: record.reason || null,
            lateMinutes: record.status === 'LATE' ? (record.lateMinutes || null) : null,
            notes: record.notes || null,
            recordedByUserId: userId,
          },
        })
      )
    );

    for (const record of records) {
      if (record.status !== 'ABSENT') continue;
      const recentAbsences = await tx.attendance.count({
        where: {
          studentId: record.studentId,
          academicTermId,
          status: 'ABSENT',
          date: { gte: new Date(attendanceDate.getTime() - 14 * 86400000), lte: attendanceDate },
        },
      });

      if (recentAbsences >= 3) {
        const existingAlert = await tx.attendanceAlert.findFirst({
          where: {
            studentId: record.studentId,
            academicTermId,
            isResolved: false,
            type: 'CONSECUTIVE_ABSENCE',
          },
        });
        if (!existingAlert) {
          await tx.attendanceAlert.create({
            data: {
              studentId: record.studentId,
              academicTermId,
              type: 'CONSECUTIVE_ABSENCE',
              message: `Student has been absent ${recentAbsences} times in the last 14 days.`,
              details: { count: recentAbsences },
            },
          });
        }
      }
    }

    return rows;
  });

  return { count: created.length, attendanceDate };
}

/** Tell parents of absent or late learners. Fire and forget: failures are logged, never thrown. */
export function notifyParentsOfAttendance(classId: string, attendanceDate: Date, records: AttendanceEntry[]): void {
  (async () => {
    const absentOrLate = records.filter(r => r.status === 'ABSENT' || r.status === 'LATE');
    if (absentOrLate.length === 0) return;

    const students = await prisma.student.findMany({
      where: { id: { in: absentOrLate.map(r => r.studentId) } },
      include: { parent: { select: { id: true } } },
    });

    const classInfo = await prisma.class.findUnique({ where: { id: classId }, select: { name: true } });
    const className = classInfo?.name || 'their class';
    const dateStr = attendanceDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    for (const student of students) {
      const record = absentOrLate.find(r => r.studentId === student.id);
      if (!record || !student.parentId) continue;

      const statusLabel = record.status === 'ABSENT' ? 'absent from' : 'late to';
      const studentName = `${student.firstName} ${student.lastName}`;
      let msg = `${studentName} was ${statusLabel} ${className} on ${dateStr}.`;
      if (record.reason) msg += ` Reason: ${record.reason}`;
      if (record.status === 'LATE' && record.lateMinutes) msg += ` (${record.lateMinutes} min late)`;

      await createNotification(student.parentId, `Attendance Alert: ${studentName}`, msg, 'WARNING');
    }
  })().catch(err => console.error('Auto attendance notification error:', err));
}

export interface AssessmentResultsUpdate {
  assessmentId: string;
  results: { studentId: string; score: number; remarks?: string }[];
}

/** Check access, placement and maximum marks for a batch of results, then save them in one term transaction. */
export async function saveAssessmentResults(req: AuthRequest, updates: AssessmentResultsUpdate[]): Promise<{ resultCount: number }> {
  const userId = req.user!.userId;
  const assessmentIds = updates.map((update) => update.assessmentId);
  const assessments = await prisma.assessment.findMany({
    where: { id: { in: assessmentIds } },
    select: { id: true, classId: true, subjectId: true, termId: true, totalMarks: true },
  });

  if (assessments.length !== assessmentIds.length) {
    throw new AcademicScopeError(404, 'One or more assessments were not found');
  }

  const assessmentMap = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  const termIds = new Set(assessments.map((assessment) => assessment.termId));
  if (termIds.size !== 1) {
    throw new AcademicScopeError(400, 'Assessment results can only be saved for one academic term at a time');
  }

  for (const update of updates) {
    const assessment = assessmentMap.get(update.assessmentId)!;
    await ensureAcademicClassAccess(req, assessment.classId, {
      subjectId: assessment.subjectId,
      academicTermId: assessment.termId,
    });
    await ensureStudentsBelongToClass(
      assessment.classId,
      assessment.termId,
      update.results.map((result) => result.studentId),
    );

    const invalidScore = update.results.find((result) => result.score > Number(assessment.totalMarks));
    if (invalidScore) {
      throw new AcademicScopeError(
        400,
        `A score exceeds the maximum marks for assessment ${assessment.id}`,
      );
    }
  }

  const academicTermId = [...termIds][0];
  const writes = updates.flatMap((update) => update.results.map((result) => ({
    assessmentId: update.assessmentId,
    studentId: result.studentId,
    score: result.score,
    remarks: result.remarks,
    gradedByUserId: userId,
  })));

  await runTermWriteTransaction(academicTermId, 'FINALIZATION', async tx => {
    const assessmentCount = await tx.assessment.count({
      where: { id: { in: assessmentIds }, termId: academicTermId },
    });
    if (assessmentCount !== assessmentIds.length) {
      throw new AcademicScopeError(409, 'Assessment term ownership changed while results were being saved');
    }
    await Promise.all(writes.map((write) => tx.assessmentResult.upsert({
      where: {
        assessmentId_studentId: {
          assessmentId: write.assessmentId,
          studentId: write.studentId,
        },
      },
      update: {
        score: write.score,
        remarks: write.remarks,
        gradedByUserId: write.gradedByUserId,
      },
      create: write,
    })));
  });

  return { resultCount: writes.length };
}

/** Update remarks on a learner's DRAFT report. Only a super administrator may set the head teacher remark. */
export async function saveDraftReportRemarks(
  req: AuthRequest,
  input: { studentId: string; termId: string; classTeacherRemark?: string; principalRemark?: string },
) {
  const { studentId, termId, classTeacherRemark, principalRemark } = input;
  await ensureStudentRecordAccess(req, studentId, { academicTermId: termId });
  if (principalRemark !== undefined && req.user?.role !== 'SUPER_ADMIN') {
    throw new AcademicScopeError(403, 'Only a super administrator can update the head teacher remark');
  }

  const currentReport = await prisma.studentTermReport.findUnique({
    where: { studentId_termId: { studentId, termId } },
    select: { status: true },
  });
  if (!currentReport) {
    throw new AcademicScopeError(404, 'Report not found');
  }
  if (currentReport.status !== 'DRAFT') {
    throw new AcademicScopeError(409, 'Finalized and published report remarks can only change through an approved amendment');
  }

  return runTermWriteTransaction(termId, 'FINALIZATION', tx => (
    tx.studentTermReport.update({
      where: { studentId_termId: { studentId, termId } },
      data: {
        classTeacherRemark,
        ...(principalRemark !== undefined ? { principalRemark } : {}),
      },
    })
  ));
}
