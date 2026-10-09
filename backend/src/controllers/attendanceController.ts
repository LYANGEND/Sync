import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { createNotification } from '../services/notificationService';
import { runTermWriteTransaction, TermLifecycleError } from '../services/termLifecycleService';
import { AcademicScopeError, ensureAcademicClassAccess, ensureStudentsBelongToClass } from '../utils/academicScope';
import { hasDuplicateValues, hasValidDateRange, isDateWithinRangeByDay } from '../utils/academicValidation';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import {
  getClassEnrollmentsForTerm,
  getStudentPlacementForTerm,
  StudentPlacementError,
} from '../services/studentPlacementService';

const recordAttendanceSchema = z.object({
  classId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  date: z.string().refine((value) => Number.isFinite(new Date(value).getTime()), 'Invalid attendance date'),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
    reason: z.string().optional(),
    lateMinutes: z.number().int().min(0).optional(),
    notes: z.string().optional(),
  })).min(1),
}).superRefine((payload, ctx) => {
  if (hasDuplicateValues(payload.records.map((record) => record.studentId))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['records'],
      message: 'Each student can only have one attendance record per day',
    });
  }
});

export const recordAttendance = async (req: Request, res: Response) => {
  try {
    const { classId, academicTermId, date, records } = recordAttendanceSchema.parse(req.body);
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const classInfo = await ensureAcademicClassAccess(req as AuthRequest, classId, { academicTermId });
    if (!isDateWithinRangeByDay(date, classInfo.academicTerm.startDate, classInfo.academicTerm.endDate)) {
      return res.status(400).json({ message: 'Attendance date must fall within the selected academic term' });
    }

    const attendanceDate = new Date(date);
    const nextDay = new Date(attendanceDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const result = await runTermWriteTransaction(academicTermId, 'ACADEMIC_ACTIVITY', async (tx) => {
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

      const created = await Promise.all(
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

      return created;
    });

    res.status(201).json({ message: 'Attendance recorded successfully', count: result.length });

    // Auto-notify parents + create alerts (fire and forget)
    (async () => {
      try {
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

      } catch (err) {
        console.error('Auto attendance notification error:', err);
      }
    })();
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
    if (error instanceof AcademicScopeError) return res.status(error.status).json({ message: error.message });
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Record attendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getClassAttendance = async (req: Request, res: Response) => {
  try {
    const { classId, academicTermId, date } = req.query;
    if (!classId || typeof classId !== 'string') return res.status(400).json({ message: 'Class ID is required' });
    if (!academicTermId || typeof academicTermId !== 'string') return res.status(400).json({ message: 'Academic term ID is required' });

    await ensureAcademicClassAccess(req as AuthRequest, classId, { academicTermId });

    const whereClause: any = { classId, academicTermId };
    if (date && typeof date === 'string') {
      const searchDate = new Date(date);
      if (!Number.isFinite(searchDate.getTime())) {
        return res.status(400).json({ message: 'Invalid attendance date' });
      }
      const nextDay = new Date(searchDate);
      nextDay.setDate(nextDay.getDate() + 1);
      whereClause.date = { gte: searchDate, lt: nextDay };
    }

    const attendance = await prisma.attendance.findMany({
      where: whereClause,
      include: {
        student: { select: { firstName: true, lastName: true, admissionNumber: true } },
      },
      orderBy: { student: { lastName: 'asc' } },
    });

    res.json(attendance);
  } catch (error) {
    if (error instanceof AcademicScopeError) return res.status(error.status).json({ message: error.message });
    console.error('Get class attendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStudentAttendance = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const { academicTermId, limit } = req.query;
    if (!academicTermId || typeof academicTermId !== 'string') {
      return res.status(400).json({ message: 'Academic term ID is required' });
    }

    const placement = await getStudentPlacementForTerm(studentId, academicTermId);
    if (!placement) return res.status(404).json({ message: 'Student has no placement in this academic term' });
    await ensureAcademicClassAccess(req as AuthRequest, placement.classId, { academicTermId });

    const parsedLimit = limit === undefined
      ? undefined
      : z.coerce.number().int().min(1).max(365).parse(limit);

    const attendance = await prisma.attendance.findMany({
      where: { studentId, academicTermId },
      orderBy: { date: 'desc' },
      take: parsedLimit,
    });

    res.json(attendance);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
    if (error instanceof AcademicScopeError) return res.status(error.status).json({ message: error.message });
    console.error('Get student attendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAttendanceAnalytics = async (req: Request, res: Response) => {
  try {
    const { classId, academicTermId, startDate, endDate } = req.query;
    if (!classId || !academicTermId || !startDate || !endDate) {
      return res.status(400).json({ message: 'classId, academicTermId, startDate, and endDate are required' });
    }

    const classInfo = await ensureAcademicClassAccess(req as AuthRequest, classId as string, {
      academicTermId: academicTermId as string,
    });

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    if (!hasValidDateRange(start, end, true)) {
      return res.status(400).json({ message: 'startDate must be on or before endDate' });
    }
    if (
      !isDateWithinRangeByDay(start, classInfo.academicTerm.startDate, classInfo.academicTerm.endDate)
      || !isDateWithinRangeByDay(end, classInfo.academicTerm.startDate, classInfo.academicTerm.endDate)
    ) {
      return res.status(400).json({ message: 'Attendance report dates must fall within the selected academic term' });
    }
    end.setHours(23, 59, 59, 999);

    const enrollments = await getClassEnrollmentsForTerm(
      classId as string,
      academicTermId as string,
    );
    const students = enrollments.map(({ student }) => ({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      admissionNumber: student.admissionNumber,
    }));

    const records = await prisma.attendance.findMany({
      where: { classId: classId as string, academicTermId: academicTermId as string, date: { gte: start, lte: end } },
      orderBy: { date: 'asc' },
    });

    // Daily summary
    const dailyMap: Record<string, { present: number; absent: number; late: number; total: number }> = {};
    records.forEach(r => {
      const dateKey = r.date.toISOString().split('T')[0];
      if (!dailyMap[dateKey]) dailyMap[dateKey] = { present: 0, absent: 0, late: 0, total: 0 };
      dailyMap[dateKey].total++;
      if (r.status === 'PRESENT') dailyMap[dateKey].present++;
      else if (r.status === 'ABSENT') dailyMap[dateKey].absent++;
      else if (r.status === 'LATE') dailyMap[dateKey].late++;
    });
    const dailyData = Object.entries(dailyMap).map(([date, data]) => ({ date, ...data }));

    // Per-student summary with streak + sparkline
    const studentData: Record<string, { present: number; absent: number; late: number; reasons: string[] }> = {};
    const studentHistory: Record<string, { date: string; status: string }[]> = {};
    students.forEach(s => { studentData[s.id] = { present: 0, absent: 0, late: 0, reasons: [] }; });

    records.forEach(r => {
      if (!studentHistory[r.studentId]) studentHistory[r.studentId] = [];
      studentHistory[r.studentId].push({ date: r.date.toISOString().split('T')[0], status: r.status });
      if (studentData[r.studentId]) {
        if (r.status === 'PRESENT') studentData[r.studentId].present++;
        else if (r.status === 'ABSENT') {
          studentData[r.studentId].absent++;
          if (r.reason) studentData[r.studentId].reasons.push(r.reason);
        } else if (r.status === 'LATE') studentData[r.studentId].late++;
      }
    });

    const studentSummaries = students.map(s => {
      const d = studentData[s.id] || { present: 0, absent: 0, late: 0, reasons: [] };
      const total = d.present + d.absent + d.late;
      const history = (studentHistory[s.id] || []).sort((a, b) => a.date.localeCompare(b.date));

      // Streak
      let streakType = 'none', streakCount = 0;
      if (history.length > 0) {
        const latest = history[history.length - 1].status;
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].status === latest) streakCount++;
          else break;
        }
        streakType = latest;
      }

      // Sparkline (last 30 entries)
      const sparkline = history.slice(-30).map(h => h.status === 'PRESENT' ? 1 : h.status === 'LATE' ? 0.5 : 0);

      return {
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        admissionNumber: s.admissionNumber,
        presentDays: d.present,
        absentDays: d.absent,
        lateDays: d.late,
        attendanceRate: total > 0 ? (d.present / total) * 100 : 0,
        streak: { type: streakType, count: streakCount },
        sparkline,
        reasons: d.reasons,
      };
    });

    // Active alerts for these students
    const alerts = await prisma.attendanceAlert.findMany({
      where: { studentId: { in: students.map(s => s.id) }, academicTermId: academicTermId as string, isResolved: false },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ dailyData, studentSummaries, totalDays: dailyData.length, alerts });
  } catch (error) {
    if (error instanceof AcademicScopeError) return res.status(error.status).json({ message: error.message });
    console.error('Get attendance analytics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/** School-wide attendance dashboard — today's summary across all classes */
export const getSchoolAttendanceDashboard = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;
    if (!academicTermId) return res.status(400).json({ message: 'Academic term ID is required' });
    if (user.role !== 'SUPER_ADMIN' && !user.branchId) {
      return res.status(403).json({ message: 'No branch is assigned to this account' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const classes = await prisma.class.findMany({
      where: {
        academicTermId,
        ...(user.role === 'SUPER_ADMIN' ? {} : { branchId: user.branchId }),
      },
      select: {
        id: true,
        name: true,
        gradeLevel: true,
        termEnrollments: {
          where: { academicTermId, status: 'ACTIVE' },
          select: { studentId: true },
        },
      },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });
    const classIds = classes.map((classItem) => classItem.id);
    const todayRecords = await prisma.attendance.findMany({
      where: { classId: { in: classIds }, academicTermId, date: { gte: today, lt: tomorrow } },
      select: { classId: true, status: true },
    });

    const classesWithAttendance = new Set(todayRecords.map(r => r.classId));

    const classStats = classes.map(cls => {
      const recs = todayRecords.filter(r => r.classId === cls.id);
      const present = recs.filter(r => r.status === 'PRESENT').length;
      const absent = recs.filter(r => r.status === 'ABSENT').length;
      const late = recs.filter(r => r.status === 'LATE').length;
      return {
        classId: cls.id, className: cls.name, gradeLevel: cls.gradeLevel,
        totalStudents: cls.termEnrollments.length, submitted: classesWithAttendance.has(cls.id),
        present, absent, late, total: recs.length,
        rate: recs.length > 0 ? (present / recs.length) * 100 : 0,
      };
    });

    const totalPresent = todayRecords.filter(r => r.status === 'PRESENT').length;
    const totalAbsent = todayRecords.filter(r => r.status === 'ABSENT').length;
    const totalLate = todayRecords.filter(r => r.status === 'LATE').length;
    const dashboardEnrollments = await prisma.studentTermEnrollment.findMany({
      where: { classId: { in: classIds }, academicTermId },
      select: { studentId: true },
    });
    const alertCount = await prisma.attendanceAlert.count({
      where: {
        academicTermId,
        isResolved: false,
        studentId: { in: dashboardEnrollments.map(enrollment => enrollment.studentId) },
      },
    });

    res.json({
      date: today.toISOString().split('T')[0],
      overall: {
        present: totalPresent, absent: totalAbsent, late: totalLate,
        total: todayRecords.length,
        rate: todayRecords.length > 0 ? (totalPresent / todayRecords.length) * 100 : 0,
        classesSubmitted: classesWithAttendance.size, totalClasses: classes.length,
      },
      classStats,
      unresolvedAlerts: alertCount,
    });
  } catch (error) {
    console.error('School attendance dashboard error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/** Get and resolve attendance alerts */
export const getAttendanceAlerts = async (req: Request, res: Response) => {
  try {
    const { classId, resolved } = req.query;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });
    if (!academicTermId) return res.status(400).json({ message: 'Academic term ID is required' });
    const where: any = { academicTermId };
    if (resolved === 'false') where.isResolved = false;
    if (resolved === 'true') where.isResolved = true;

    if (classId) {
      await ensureAcademicClassAccess(req as AuthRequest, classId as string, { academicTermId });
      const classEnrollments = await getClassEnrollmentsForTerm(classId as string, academicTermId);
      where.studentId = { in: classEnrollments.map(enrollment => enrollment.studentId) };
    } else if (user.role === 'TEACHER') {
      const teacherClasses = await prisma.class.findMany({
        where: {
          academicTermId,
          OR: [
            { teacherId: user.userId },
            { teacherAssignments: { some: { teacherId: user.userId } } },
          ],
        },
        select: { id: true },
      });
      const classEnrollments = await prisma.studentTermEnrollment.findMany({
        where: {
          academicTermId,
          classId: { in: teacherClasses.map((classItem) => classItem.id) },
        },
        select: { studentId: true },
      });
      where.studentId = { in: classEnrollments.map(enrollment => enrollment.studentId) };
    } else if (user.role !== 'SUPER_ADMIN') {
      if (!user.branchId) return res.status(403).json({ message: 'No branch is assigned to this account' });
      const branchEnrollments = await prisma.studentTermEnrollment.findMany({
        where: { academicTermId, student: { branchId: user.branchId } },
        select: { studentId: true },
      });
      where.studentId = { in: branchEnrollments.map(enrollment => enrollment.studentId) };
    }

    const alerts = await prisma.attendanceAlert.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    const studentIds = [...new Set(alerts.map(a => a.studentId))];
    const students = await prisma.studentTermEnrollment.findMany({
      where: { academicTermId, studentId: { in: studentIds } },
      select: {
        classId: true,
        student: { select: { id: true, firstName: true, lastName: true, admissionNumber: true } },
      },
    });
    const studentMap = Object.fromEntries(students.map(({ student, classId: selectedClassId }) => [
      student.id,
      { ...student, classId: selectedClassId },
    ]));
    res.json(alerts.map(a => ({ ...a, student: studentMap[a.studentId] || null })));
  } catch (error) {
    if (error instanceof AcademicScopeError) return res.status(error.status).json({ message: error.message });
    console.error('Get attendance alerts error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const resolveAttendanceAlert = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const userId = (req as any).user?.userId;

    const alert = await prisma.attendanceAlert.findUnique({ where: { id } });
    if (!alert) return res.status(404).json({ message: 'Attendance alert not found' });

    const termAttendance = await prisma.attendance.findFirst({
      where: { studentId: alert.studentId, academicTermId: alert.academicTermId },
      select: { classId: true },
      orderBy: { date: 'desc' },
    });
    if (!termAttendance) return res.status(404).json({ message: 'No term attendance record was found for this alert' });
    await ensureAcademicClassAccess(req as AuthRequest, termAttendance.classId, {
      academicTermId: alert.academicTermId,
    });

    await runTermWriteTransaction(alert.academicTermId, 'ACADEMIC_ACTIVITY', async tx => {
      const currentAlert = await tx.attendanceAlert.findUnique({
        where: { id },
        select: { academicTermId: true },
      });
      if (!currentAlert || currentAlert.academicTermId !== alert.academicTermId) {
        throw new AcademicScopeError(409, 'Attendance alert changed while it was being resolved');
      }
      await tx.attendanceAlert.update({
        where: { id },
        data: { isResolved: true, resolvedBy: userId, resolvedAt: new Date(), resolvedNotes: notes || null },
      });
    });
    res.json({ message: 'Alert resolved' });
  } catch (error) {
    if (error instanceof AcademicScopeError) return res.status(error.status).json({ message: error.message });
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Resolve alert error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

