import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { createNotification } from '../services/notificationService';
import { AcademicScopeError, ensureAcademicClassAccess, ensureStudentsBelongToClass } from '../utils/academicScope';

const recordAttendanceSchema = z.object({
  classId: z.string().uuid(),
  date: z.string(),
  records: z.array(z.object({
    studentId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
    reason: z.string().optional(),
    lateMinutes: z.number().int().min(0).optional(),
    notes: z.string().optional(),
  })),
});

export const recordAttendance = async (req: Request, res: Response) => {
  try {
    const { classId, date, records } = recordAttendanceSchema.parse(req.body);
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    await ensureAcademicClassAccess(req as AuthRequest, classId);
    await ensureStudentsBelongToClass(classId, records.map((record) => record.studentId));

    const attendanceDate = new Date(date);
    const nextDay = new Date(attendanceDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const result = await prisma.$transaction(async (prisma) => {
      await prisma.attendance.deleteMany({
        where: { classId, date: { gte: attendanceDate, lt: nextDay } },
      });

      return Promise.all(
        records.map((record) =>
          prisma.attendance.create({
            data: {
              classId,
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

        // Create alerts for consecutive absences
        for (const record of absentOrLate) {
          if (record.status !== 'ABSENT') continue;
          const recentAbsences = await prisma.attendance.count({
            where: {
              studentId: record.studentId,
              status: 'ABSENT',
              date: { gte: new Date(attendanceDate.getTime() - 14 * 86400000), lte: attendanceDate },
            },
          });

          if (recentAbsences >= 3) {
            const existingAlert = await prisma.attendanceAlert.findFirst({
              where: { studentId: record.studentId, isResolved: false, type: 'CONSECUTIVE_ABSENCE' },
            });
            if (!existingAlert) {
              await prisma.attendanceAlert.create({
                data: {
                  studentId: record.studentId,
                  type: 'CONSECUTIVE_ABSENCE',
                  message: `Student has been absent ${recentAbsences} times in the last 14 days.`,
                  details: { count: recentAbsences },
                },
              });
            }
          }
        }
      } catch (err) {
        console.error('Auto attendance notification error:', err);
      }
    })();
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
    if (error instanceof AcademicScopeError) return res.status(error.status).json({ message: error.message });
    console.error('Record attendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getClassAttendance = async (req: Request, res: Response) => {
  try {
    const { classId, date } = req.query;
    if (!classId || typeof classId !== 'string') return res.status(400).json({ message: 'Class ID is required' });

    await ensureAcademicClassAccess(req as AuthRequest, classId);

    const whereClause: any = { classId };
    if (date && typeof date === 'string') {
      const searchDate = new Date(date);
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
    const { limit } = req.query;

    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { classId: true } });
    if (!student?.classId) return res.status(404).json({ message: 'Student not found in a class' });
    await ensureAcademicClassAccess(req as AuthRequest, student.classId);

    const attendance = await prisma.attendance.findMany({
      where: { studentId },
      orderBy: { date: 'desc' },
      take: limit ? parseInt(limit as string) : undefined,
    });

    res.json(attendance);
  } catch (error) {
    if (error instanceof AcademicScopeError) return res.status(error.status).json({ message: error.message });
    console.error('Get student attendance error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getAttendanceAnalytics = async (req: Request, res: Response) => {
  try {
    const { classId, startDate, endDate } = req.query;
    if (!classId || !startDate || !endDate) return res.status(400).json({ message: 'classId, startDate, and endDate are required' });

    await ensureAcademicClassAccess(req as AuthRequest, classId as string);

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);

    const students = await prisma.student.findMany({
      where: { classId: classId as string, status: 'ACTIVE' },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true },
    });

    const records = await prisma.attendance.findMany({
      where: { classId: classId as string, date: { gte: start, lte: end } },
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
      where: { studentId: { in: students.map(s => s.id) }, isResolved: false },
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayRecords = await prisma.attendance.findMany({
      where: { date: { gte: today, lt: tomorrow } },
      select: { classId: true, status: true },
    });

    const classes = await prisma.class.findMany({
      select: { id: true, name: true, gradeLevel: true, _count: { select: { students: true } } },
      orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    });

    const classesWithAttendance = new Set(todayRecords.map(r => r.classId));

    const classStats = classes.map(cls => {
      const recs = todayRecords.filter(r => r.classId === cls.id);
      const present = recs.filter(r => r.status === 'PRESENT').length;
      const absent = recs.filter(r => r.status === 'ABSENT').length;
      const late = recs.filter(r => r.status === 'LATE').length;
      return {
        classId: cls.id, className: cls.name, gradeLevel: cls.gradeLevel,
        totalStudents: cls._count.students, submitted: classesWithAttendance.has(cls.id),
        present, absent, late, total: recs.length,
        rate: recs.length > 0 ? (present / recs.length) * 100 : 0,
      };
    });

    const totalPresent = todayRecords.filter(r => r.status === 'PRESENT').length;
    const totalAbsent = todayRecords.filter(r => r.status === 'ABSENT').length;
    const totalLate = todayRecords.filter(r => r.status === 'LATE').length;
    const alertCount = await prisma.attendanceAlert.count({ where: { isResolved: false } });

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
    const where: any = {};
    if (resolved === 'false') where.isResolved = false;
    if (resolved === 'true') where.isResolved = true;

    if (classId) {
      await ensureAcademicClassAccess(req as AuthRequest, classId as string);
      const classStudents = await prisma.student.findMany({ where: { classId: classId as string }, select: { id: true } });
      where.studentId = { in: classStudents.map(s => s.id) };
    }

    const alerts = await prisma.attendanceAlert.findMany({ where, orderBy: { createdAt: 'desc' }, take: 50 });
    const studentIds = [...new Set(alerts.map(a => a.studentId))];
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, firstName: true, lastName: true, admissionNumber: true, classId: true },
    });
    const studentMap = Object.fromEntries(students.map(s => [s.id, s]));
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

    await prisma.attendanceAlert.update({
      where: { id },
      data: { isResolved: true, resolvedBy: userId, resolvedAt: new Date(), resolvedNotes: notes || null },
    });
    res.json({ message: 'Alert resolved' });
  } catch (error) {
    console.error('Resolve alert error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

