import { prisma } from '../utils/prisma';
import { getClassEnrollmentsForTerm } from './studentPlacementService';
import { smsService } from './smsService';
import { whatsappService } from './whatsappService';
import { sendEmail } from './emailService';
import { runTermWriteTransaction } from './termLifecycleService';

interface AttendancePattern {
  type: string; // CONSECUTIVE_ABSENCE, DAY_PATTERN, POST_EVENT, CHRONIC
  description: string;
  dates: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface AbsenteeReport {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  totalAbsent: number;
  totalLate: number;
  attendanceRate: number;
  consecutiveAbsences: number;
  patterns: AttendancePattern[];
  parentContact: {
    name: string | null;
    phone: string | null;
    email: string | null;
  };
}

/**
 * Attendance Intelligence Service
 * Detects patterns, triggers alerts, and provides insights
 */
class AttendanceIntelligenceService {

  /**
   * Run daily attendance analysis - call this via a cron job or manual trigger
   */
  async runDailyAnalysis(termId: string): Promise<{
    alertsGenerated: number;
    patternsDetected: number;
    studentsAnalyzed: number;
  }> {
    const term = await prisma.academicTerm.findUnique({ where: { id: termId } });

    if (!term) return { alertsGenerated: 0, patternsDetected: 0, studentsAnalyzed: 0 };

    const enrollments = await prisma.studentTermEnrollment.findMany({
      where: {
        academicTermId: term.id,
        status: 'ACTIVE',
        student: { status: 'ACTIVE' },
      },
      include: {
        class: true,
        student: {
          include: {
            parent: { select: { fullName: true, email: true } },
            attendance: {
              where: { academicTermId: term.id, date: { gte: term.startDate, lte: new Date() } },
              orderBy: { date: 'desc' },
            },
          },
        },
      },
    });
    const students = enrollments.map(enrollment => ({
      ...enrollment.student,
      class: enrollment.class,
    }));

    let alertsGenerated = 0;
    let patternsDetected = 0;

    for (const student of students) {
      const analysis = this.analyzeStudentAttendance(student);

      // Generate alerts for concerning patterns
      for (const pattern of analysis.patterns) {
        if (pattern.severity === 'HIGH' || pattern.severity === 'MEDIUM') {
          await this.createAlert(student.id, term.id, pattern);
          alertsGenerated++;
          patternsDetected++;
        }
      }

      // Check for consecutive absences (3+ days)
      if (analysis.consecutiveAbsences >= 3) {
        await this.createConsecutiveAbsenceAlert(student, term.id, analysis.consecutiveAbsences);
        alertsGenerated++;
      }

      // Check for chronic absenteeism (attendance rate < 80%)
      if (analysis.attendanceRate < 80 && student.attendance.length >= 10) {
        await this.createChronicAbsenteeismAlert(student, term.id, analysis.attendanceRate);
        alertsGenerated++;
      }
    }

    return {
      alertsGenerated,
      patternsDetected,
      studentsAnalyzed: students.length,
    };
  }

  /**
   * Get attendance insights for a class
   */
  async getClassInsights(classId: string, startDate: Date, endDate: Date): Promise<{
    summary: {
      averageAttendance: number;
      chronicAbsentees: number;
      perfectAttendance: number;
      totalStudents: number;
    };
    dayOfWeekAnalysis: { day: string; avgAttendance: number }[];
    trends: { week: string; attendanceRate: number }[];
    alerts: any[];
  }> {
    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      select: { academicTermId: true },
    });
    if (!classInfo) {
      throw new Error('Class not found');
    }

    const students = (await getClassEnrollmentsForTerm(classId, classInfo.academicTermId, {
      statuses: ['ACTIVE'],
    })).map(enrollment => enrollment.student);

    const studentIds = students.map(s => s.id);

    const records = await prisma.attendance.findMany({
      where: {
        classId,
        academicTermId: classInfo.academicTermId,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });

    // Day of week analysis
    const dayStats: Record<string, { total: number; present: number }> = {};
    const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

    records.forEach(r => {
      const day = DAYS[r.date.getDay()];
      if (!dayStats[day]) dayStats[day] = { total: 0, present: 0 };
      dayStats[day].total++;
      if (r.status !== 'ABSENT') dayStats[day].present++;
    });

    const dayOfWeekAnalysis = Object.entries(dayStats).map(([day, stats]) => ({
      day,
      avgAttendance: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
    }));

    // Weekly trends
    const weeklyStats = new Map<string, { total: number; present: number }>();
    records.forEach(r => {
      const weekStart = this.getWeekStart(r.date);
      const key = weekStart.toISOString().split('T')[0];
      if (!weeklyStats.has(key)) weeklyStats.set(key, { total: 0, present: 0 });
      const stats = weeklyStats.get(key)!;
      stats.total++;
      if (r.status !== 'ABSENT') stats.present++;
    });

    const trends = Array.from(weeklyStats.entries()).map(([week, stats]) => ({
      week,
      attendanceRate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
    }));

    // Per-student summary for chronic absentees
    const studentAbsences = new Map<string, number>();
    const studentRecordCount = new Map<string, number>();

    records.forEach(r => {
      studentRecordCount.set(r.studentId, (studentRecordCount.get(r.studentId) || 0) + 1);
      if (r.status === 'ABSENT') {
        studentAbsences.set(r.studentId, (studentAbsences.get(r.studentId) || 0) + 1);
      }
    });

    let chronicAbsentees = 0;
    let perfectAttendance = 0;
    let totalAttendanceRate = 0;

    studentIds.forEach(id => {
      const total = studentRecordCount.get(id) || 0;
      const absent = studentAbsences.get(id) || 0;
      const rate = total > 0 ? ((total - absent) / total) * 100 : 100;
      totalAttendanceRate += rate;
      if (rate < 80 && total >= 5) chronicAbsentees++;
      if (absent === 0 && total > 0) perfectAttendance++;
    });

    // Get active alerts
    const alerts = await (prisma as any).attendanceAlert.findMany({
      where: {
        studentId: { in: studentIds },
        academicTermId: classInfo.academicTermId,
        isResolved: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      summary: {
        averageAttendance: studentIds.length > 0 ? Math.round(totalAttendanceRate / studentIds.length) : 0,
        chronicAbsentees,
        perfectAttendance,
        totalStudents: studentIds.length,
      },
      dayOfWeekAnalysis,
      trends,
      alerts,
    };
  }

  /**
   * Get unresolved alerts
   */
  async getAlerts(filters: {
    studentId?: string;
    classId?: string;
    academicTermId: string;
    isResolved?: boolean;
  }): Promise<any[]> {
    const where: any = {};

    if (filters.isResolved !== undefined) where.isResolved = filters.isResolved;
    if (filters.studentId) where.studentId = filters.studentId;
    where.academicTermId = filters.academicTermId;

    if (filters.classId) {
      const enrollments = await getClassEnrollmentsForTerm(filters.classId, filters.academicTermId);
      where.studentId = { in: enrollments.map(enrollment => enrollment.studentId) };
    }

    const alerts = await (prisma as any).attendanceAlert.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Enrich with student data
    const studentIds = alerts.map((a: any) => a.studentId as string).filter((v: string, i: number, arr: string[]) => arr.indexOf(v) === i);
    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: {
        parent: { select: { fullName: true } },
        termEnrollments: {
          where: { academicTermId: filters.academicTermId },
          include: { class: true },
          take: 1,
        },
      },
    });
    const studentMap = new Map(students.map(student => [student.id, {
      ...student,
      class: student.termEnrollments?.[0]?.class ?? null,
      termEnrollments: undefined,
    }]));

    return alerts.map((a: any) => ({
      ...a,
      student: studentMap.get(a.studentId),
    }));
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, userId: string, notes?: string): Promise<void> {
    const alert = await prisma.attendanceAlert.findUnique({
      where: { id: alertId },
      select: { academicTermId: true },
    });
    if (!alert) throw new Error('Alert not found');

    await runTermWriteTransaction(alert.academicTermId, 'ACADEMIC_ACTIVITY', async tx => {
      const current = await tx.attendanceAlert.findUnique({
        where: { id: alertId },
        select: { academicTermId: true },
      });
      if (!current || current.academicTermId !== alert.academicTermId) {
        throw new Error('Attendance alert changed while it was being resolved');
      }
      await tx.attendanceAlert.update({
        where: { id: alertId },
        data: {
          isResolved: true,
          resolvedBy: userId,
          resolvedAt: new Date(),
          resolvedNotes: notes || null,
        },
      });
    });
  }

  /**
   * Send parent notification for attendance alert
   */
  async notifyParent(alertId: string): Promise<{ emailSent: boolean; smsSent: boolean; whatsappSent: boolean }> {
    const alert = await prisma.attendanceAlert.findUnique({ where: { id: alertId } });
    if (!alert) throw new Error('Alert not found');

    const student = await prisma.student.findUnique({
      where: { id: alert.studentId },
      include: { parent: true },
    });

    if (!student) throw new Error('Student not found');

    const settings = await prisma.schoolSettings.findFirst();
    const schoolName = settings?.schoolName || 'School';
    const studentName = `${student.firstName} ${student.lastName}`;

    const parentEmail = student.parent?.email || student.guardianEmail;
    const parentPhone = student.guardianPhone;
    if (!parentEmail && !parentPhone) {
      return { emailSent: false, smsSent: false, whatsappSent: false };
    }

    const reserved = await runTermWriteTransaction(
      alert.academicTermId,
      'ACADEMIC_ACTIVITY',
      async tx => {
        const current = await tx.attendanceAlert.findUnique({
          where: { id: alertId },
          select: { academicTermId: true, parentNotified: true },
        });
        if (!current || current.academicTermId !== alert.academicTermId) {
          throw new Error('Attendance alert changed while notification was being prepared');
        }
        if (current.parentNotified) return false;
        await tx.attendanceAlert.update({
          where: { id: alertId },
          data: { parentNotified: true, notifiedAt: new Date() },
        });
        return true;
      },
    );
    if (!reserved) throw new Error('Parent notification has already been processed');

    let emailSent = false;
    let smsSent = false;
    let whatsappSent = false;

    // Email
    if (parentEmail) {
      emailSent = await sendEmail(
        parentEmail,
        `Attendance Alert - ${studentName} - ${schoolName}`,
        `<h2>Attendance Alert</h2><p>${alert.message}</p><p>Please contact the school for more information.</p>`,
        { source: 'attendance_intelligence' }
      );
    }

    // SMS
    if (parentPhone) {
      const smsResult = await smsService.sendAttendanceAlert(parentPhone, studentName, 3, schoolName);
      smsSent = smsResult.success;
    }

    // WhatsApp
    if (parentPhone) {
      const waResult = await whatsappService.sendAttendanceAlert(parentPhone, studentName, 3, schoolName);
      whatsappSent = waResult.success;
    }

    if (!emailSent && !smsSent && !whatsappSent) {
      await runTermWriteTransaction(alert.academicTermId, 'ACADEMIC_ACTIVITY', tx => (
        tx.attendanceAlert.update({
          where: { id: alertId },
          data: { parentNotified: false, notifiedAt: null },
        })
      ));
    }

    return { emailSent, smsSent, whatsappSent };
  }

  // ==========================================
  // Private analysis methods
  // ==========================================

  private analyzeStudentAttendance(student: any): {
    attendanceRate: number;
    consecutiveAbsences: number;
    patterns: AttendancePattern[];
  } {
    const records = student.attendance || [];
    if (records.length === 0) {
      return { attendanceRate: 100, consecutiveAbsences: 0, patterns: [] };
    }

    const totalRecords = records.length;
    const absentRecords = records.filter((r: any) => r.status === 'ABSENT');
    const attendanceRate = ((totalRecords - absentRecords.length) / totalRecords) * 100;

    // Find consecutive absences
    let maxConsecutive = 0;
    let currentConsecutive = 0;
    const sortedRecords = [...records].sort((a: any, b: any) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    for (const record of sortedRecords) {
      if (record.status === 'ABSENT') {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 0;
      }
    }

    // Detect patterns
    const patterns: AttendancePattern[] = [];

    // Day-of-week pattern
    const dayAbsences: Record<number, number> = {};
    const dayTotals: Record<number, number> = {};
    records.forEach((r: any) => {
      const day = new Date(r.date).getDay();
      dayTotals[day] = (dayTotals[day] || 0) + 1;
      if (r.status === 'ABSENT') dayAbsences[day] = (dayAbsences[day] || 0) + 1;
    });

    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const [day, absences] of Object.entries(dayAbsences)) {
      const total = dayTotals[parseInt(day)] || 1;
      const rate = (absences as number) / total;
      if (rate > 0.5 && (absences as number) >= 3) {
        patterns.push({
          type: 'DAY_PATTERN',
          description: `Frequently absent on ${DAYS[parseInt(day)]}s (${absences}/${total} times)`,
          dates: absentRecords
            .filter((r: any) => new Date(r.date).getDay() === parseInt(day))
            .map((r: any) => new Date(r.date).toISOString().split('T')[0]),
          severity: rate > 0.7 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    return {
      attendanceRate: Math.round(attendanceRate * 10) / 10,
      consecutiveAbsences: maxConsecutive,
      patterns,
    };
  }

  private async createAlert(studentId: string, academicTermId: string, pattern: AttendancePattern) {
    await runTermWriteTransaction(academicTermId, 'ACADEMIC_ACTIVITY', async tx => {
      // Check if similar alert already exists (not resolved) in last 7 days.
      const existingAlert = await tx.attendanceAlert.findFirst({
        where: {
          studentId,
          academicTermId,
          type: pattern.type,
          isResolved: false,
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      });

      if (existingAlert) return;
      await tx.attendanceAlert.create({
        data: {
          studentId,
          academicTermId,
          type: pattern.type,
          message: pattern.description,
          details: { dates: pattern.dates, severity: pattern.severity },
        },
      });
    });
  }

  private async createConsecutiveAbsenceAlert(student: any, academicTermId: string, days: number) {
    await runTermWriteTransaction(academicTermId, 'ACADEMIC_ACTIVITY', async tx => {
      const existing = await tx.attendanceAlert.findFirst({
        where: {
          studentId: student.id,
          academicTermId,
          type: 'CONSECUTIVE_ABSENCE',
          isResolved: false,
          createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        },
      });

      if (existing) return;
      await tx.attendanceAlert.create({
        data: {
          studentId: student.id,
          academicTermId,
          type: 'CONSECUTIVE_ABSENCE',
          message: `${student.firstName} ${student.lastName} has been absent for ${days} consecutive days`,
          details: { consecutiveDays: days, className: student.class?.name },
        },
      });
    });
  }

  private async createChronicAbsenteeismAlert(student: any, academicTermId: string, rate: number) {
    await runTermWriteTransaction(academicTermId, 'ACADEMIC_ACTIVITY', async tx => {
      const existing = await tx.attendanceAlert.findFirst({
        where: {
          studentId: student.id,
          academicTermId,
          type: 'CHRONIC_ABSENTEEISM',
          isResolved: false,
          createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
        },
      });

      if (existing) return;
      await tx.attendanceAlert.create({
        data: {
          studentId: student.id,
          academicTermId,
          type: 'CHRONIC_ABSENTEEISM',
          message: `${student.firstName} ${student.lastName} has a ${rate.toFixed(1)}% attendance rate (below 80% threshold)`,
          details: { attendanceRate: rate, className: student.class?.name },
        },
      });
    });
  }

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }
}

export const attendanceIntelligenceService = new AttendanceIntelligenceService();
export default attendanceIntelligenceService;
