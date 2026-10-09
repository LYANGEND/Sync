import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import * as metrics from '../services/metricsService';

/**
 * Enhanced Analytics Controller
 * Provides trend analysis, AI insights, and school health metrics
 */

export const getAnalyticsDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const { period = '30', academicTermId } = req.query; // days
    const term = await getRequiredAcademicTerm(academicTermId);
    if (!term) return res.status(400).json({ error: 'A valid academicTermId is required' });
    const days = parseInt(period as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const effectiveStartDate = startDate > term.startDate ? startDate : term.startDate;

    // Parallel data fetching for performance
    const [
      enrollmentData,
      revenueData,
      attendanceData,
      academicData,
      riskData,
    ] = await Promise.all([
      getEnrollmentTrends(term.id),
      getRevenueTrends(effectiveStartDate, term.id),
      getAttendanceTrends(effectiveStartDate, term.id),
      getAcademicPerformance(term.id),
      getRiskSummary(term.id),
    ]);

    res.json({
      enrollment: enrollmentData,
      revenue: revenueData,
      attendance: attendanceData,
      academic: academicData,
      risk: riskData,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Analytics dashboard error:', error);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
};

export const getRevenueAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, groupBy = 'day', academicTermId } = req.query;
    const term = await getRequiredAcademicTerm(academicTermId);
    if (!term) return res.status(400).json({ error: 'A valid academicTermId is required' });

    const requestedStart = startDate ? new Date(startDate as string) : term.startDate;
    const requestedEnd = endDate ? new Date(endDate as string) : term.endDate;
    if (Number.isNaN(requestedStart.getTime()) || Number.isNaN(requestedEnd.getTime())) {
      return res.status(400).json({ error: 'Invalid analytics date range' });
    }
    const start = requestedStart > term.startDate ? requestedStart : term.startDate;
    const end = requestedEnd < term.endDate ? requestedEnd : term.endDate;

    const payments = await prisma.payment.findMany({
      where: {
        academicTermId: term.id,
        paymentDate: { gte: start, lte: end },
        status: 'COMPLETED',
      },
      orderBy: { paymentDate: 'asc' },
    });

    // Group by time period
    const grouped = new Map<string, { amount: number; count: number }>();
    payments.forEach(p => {
      let key: string;
      const date = p.paymentDate;
      if (groupBy === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        key = weekStart.toISOString().split('T')[0];
      } else if (groupBy === 'month') {
        key = date.toISOString().substring(0, 7);
      } else {
        key = date.toISOString().split('T')[0];
      }

      const current = grouped.get(key) || { amount: 0, count: 0 };
      current.amount += Number(p.amount);
      current.count++;
      grouped.set(key, current);
    });

    const chartData = Array.from(grouped.entries()).map(([date, data]) => ({
      date,
      amount: Math.round(data.amount * 100) / 100,
      count: data.count,
    }));

    // Payment method distribution
    const methodMap = new Map<string, number>();
    payments.forEach(p => {
      methodMap.set(p.method, (methodMap.get(p.method) || 0) + Number(p.amount));
    });

    const methodDistribution = Array.from(methodMap.entries()).map(([method, amount]) => ({
      method,
      amount: Math.round(amount * 100) / 100,
      percentage: payments.length > 0
        ? Math.round((amount / payments.reduce((s, p) => s + Number(p.amount), 0)) * 100)
        : 0,
    }));

    // Total summary
    const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    res.json({
      chartData,
      methodDistribution,
      summary: {
        totalCollected: Math.round(totalCollected * 100) / 100,
        totalTransactions: payments.length,
        averagePayment: payments.length > 0 ? Math.round((totalCollected / payments.length) * 100) / 100 : 0,
      },
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ error: 'Failed to load revenue analytics' });
  }
};

export const getAttendanceAnalyticsDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const term = await getRequiredAcademicTerm(req.query.academicTermId);
    if (!term) return res.status(400).json({ error: 'A valid academicTermId is required' });

    const records = await prisma.attendance.findMany({
      where: { academicTermId: term.id },
      include: { class: true },
    });

    // Overall attendance rate
    const totalRecords = records.length;
    const presentRecords = records.filter(r => r.status !== 'ABSENT').length;
    const overallRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;

    // By class
    const classStats = new Map<string, { name: string; total: number; present: number }>();
    records.forEach(r => {
      const className = r.class?.name || 'Unknown';
      const classId = r.classId;
      if (!classStats.has(classId)) classStats.set(classId, { name: className, total: 0, present: 0 });
      const stats = classStats.get(classId)!;
      stats.total++;
      if (r.status !== 'ABSENT') stats.present++;
    });

    const byClass = Array.from(classStats.entries()).map(([id, stats]) => ({
      classId: id,
      className: stats.name,
      attendanceRate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
      totalRecords: stats.total,
    })).sort((a, b) => a.attendanceRate - b.attendanceRate);

    // Daily trend for last 30 days
    const thirtyDaysAgo = new Date(term.endDate < new Date() ? term.endDate : new Date());
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    if (thirtyDaysAgo < term.startDate) thirtyDaysAgo.setTime(term.startDate.getTime());

    const recentRecords = records.filter(r => r.date >= thirtyDaysAgo);
    const dailyMap = new Map<string, { total: number; present: number }>();
    recentRecords.forEach(r => {
      const date = r.date.toISOString().split('T')[0];
      if (!dailyMap.has(date)) dailyMap.set(date, { total: 0, present: 0 });
      const stats = dailyMap.get(date)!;
      stats.total++;
      if (r.status !== 'ABSENT') stats.present++;
    });

    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, stats]) => ({
        date,
        rate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Get alerts count
    let alertsCount = 0;
    try {
      alertsCount = await (prisma as any).attendanceAlert.count({
        where: { academicTermId: term.id, isResolved: false },
      });
    } catch { /* table may not exist yet */ }

    res.json({
      overallRate,
      byClass,
      dailyTrend,
      alertsCount,
      totalStudentsTracked: new Set(records.map(r => r.studentId)).size,
    });
  } catch (error) {
    console.error('Attendance analytics error:', error);
    res.status(500).json({ error: 'Failed to load attendance analytics' });
  }
};

export const getSchoolHealthDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const term = await getRequiredAcademicTerm(req.query.academicTermId);
    if (!term) return res.status(400).json({ error: 'A valid academicTermId is required' });
    const health = await metrics.getSchoolHealthSnapshot(term.id);

    // Generate text insights from canonical numbers
    const insights = generateHealthInsights({
      studentCount: health.enrollment.activeStudents,
      teacherCount: health.enrollment.activeTeachers,
      studentTeacherRatio: health.enrollment.studentTeacherRatio,
      collectionRate: health.fees.collectionRatePercent,
      weeklyAttendanceRate: health.attendance.ratePercent,
      atRiskCount: health.risk.critical + health.risk.high,
    });

    res.json({
      metrics: {
        activeStudents: health.enrollment.activeStudents,
        activeTeachers: health.enrollment.activeTeachers,
        totalClasses: health.enrollment.totalClasses,
        studentTeacherRatio: health.enrollment.studentTeacherRatio,
        feeCollectionRate: health.fees.collectionRatePercent,
        weeklyAttendanceRate: health.attendance.ratePercent,
        atRiskStudents: health.risk.critical + health.risk.high,
        currentTerm: term.name,
      },
      insights,
    });
  } catch (error) {
    console.error('School health error:', error);
    res.status(500).json({ error: 'Failed to load school health' });
  }
};

// ==========================================
// Helper Functions
// ==========================================

async function getEnrollmentTrends(academicTermId: string) {
  const classes = await prisma.class.findMany({
    where: { academicTermId },
    select: {
      id: true,
      name: true,
      gradeLevel: true,
      termEnrollments: { select: { studentId: true, status: true } },
    },
    orderBy: { gradeLevel: 'asc' },
  });
  const studentsByClass = new Map(classes.map(classRecord => [
    classRecord.id,
    new Set(classRecord.termEnrollments.map(enrollment => enrollment.studentId)),
  ]));
  const statusCountMap = new Map<string, number>();
  classes.flatMap(classRecord => classRecord.termEnrollments).forEach(enrollment => {
    statusCountMap.set(enrollment.status, (statusCountMap.get(enrollment.status) || 0) + 1);
  });

  return {
    byStatus: [...statusCountMap].map(([status, count]) => ({ status, count })),
    byGrade: classes.map(c => ({
      className: c.name,
      gradeLevel: c.gradeLevel,
      students: studentsByClass.get(c.id)?.size || 0,
    })),
    total: [...statusCountMap.values()].reduce((sum, count) => sum + count, 0),
  };
}

async function getRevenueTrends(startDate: Date, academicTermId: string) {
  const payments = await prisma.payment.findMany({
    where: {
      paymentDate: { gte: startDate },
      academicTermId,
      status: 'COMPLETED',
    },
    orderBy: { paymentDate: 'asc' },
  });

  const weeklyData = new Map<string, number>();
  payments.forEach(p => {
    const weekStart = new Date(p.paymentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const key = weekStart.toISOString().split('T')[0];
    weeklyData.set(key, (weeklyData.get(key) || 0) + Number(p.amount));
  });

  const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    weeklyTrend: Array.from(weeklyData.entries()).map(([week, amount]) => ({
      week,
      amount: Math.round(amount * 100) / 100,
    })),
    totalRevenue: Math.round(total * 100) / 100,
    transactionCount: payments.length,
  };
}

async function getAttendanceTrends(startDate: Date, academicTermId: string) {
  const records = await prisma.attendance.findMany({
    where: { academicTermId, date: { gte: startDate } },
  });

  const total = records.length;
  const present = records.filter(r => r.status === 'PRESENT').length;
  const late = records.filter(r => r.status === 'LATE').length;
  const absent = records.filter(r => r.status === 'ABSENT').length;

  return {
    rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
    present,
    late,
    absent,
    total,
  };
}

async function getAcademicPerformance(academicTermId: string) {
  const results = await prisma.termResult.findMany({
    where: { termId: academicTermId },
    include: { subject: true },
  });

  const allScores = results.map(r => Number(r.totalScore));
  const averageScore = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
  const passRate = allScores.length > 0 ? (allScores.filter(s => s >= 50).length / allScores.length) * 100 : 0;

  // By subject
  const subjectMap = new Map<string, { name: string; scores: number[] }>();
  results.forEach(r => {
    if (!subjectMap.has(r.subjectId)) {
      subjectMap.set(r.subjectId, { name: r.subject.name, scores: [] });
    }
    subjectMap.get(r.subjectId)!.scores.push(Number(r.totalScore));
  });

  const subjectPerformance = Array.from(subjectMap.values()).map(({ name, scores }) => ({
    subject: name,
    average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    passRate: Math.round((scores.filter(s => s >= 50).length / scores.length) * 100),
    totalStudents: scores.length,
  })).sort((a, b) => a.average - b.average); // Worst performing first

  return {
    averageScore: Math.round(averageScore * 10) / 10,
    passRate: Math.round(passRate),
    subjectPerformance,
  };
}

async function getRiskSummary(academicTermId: string) {
  try {
    const riskCounts = await (prisma as any).studentRiskAssessment.groupBy({
      by: ['riskLevel'],
      where: { termId: academicTermId },
      _count: true,
    });

    return {
      byLevel: riskCounts.map((r: any) => ({ level: r.riskLevel, count: r._count })),
      total: riskCounts.reduce((sum: number, r: any) => sum + r._count, 0),
    };
  } catch {
    return { byLevel: [], total: 0 };
  }
}

async function getRequiredAcademicTerm(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return prisma.academicTerm.findUnique({ where: { id: value } });
}

function generateHealthInsights(data: {
  studentCount: number;
  teacherCount: number;
  studentTeacherRatio: number;
  collectionRate: number;
  weeklyAttendanceRate: number;
  atRiskCount: number;
}): string[] {
  const insights: string[] = [];

  // Student-teacher ratio insight
  if (data.studentTeacherRatio > 40) {
    insights.push(`⚠️ Student-teacher ratio is ${data.studentTeacherRatio}:1, above the recommended 40:1. Consider hiring additional teachers.`);
  } else if (data.studentTeacherRatio > 0) {
    insights.push(`✅ Student-teacher ratio is ${data.studentTeacherRatio}:1, within acceptable range.`);
  }

  // Fee collection insight
  if (data.collectionRate < 50) {
    insights.push(`🔴 Fee collection rate is at ${data.collectionRate}%. Urgent action needed - consider sending bulk reminders.`);
  } else if (data.collectionRate < 75) {
    insights.push(`🟡 Fee collection rate is at ${data.collectionRate}%. Consider targeted reminders to overdue accounts.`);
  } else {
    insights.push(`✅ Fee collection rate is healthy at ${data.collectionRate}%.`);
  }

  // Attendance insight
  if (data.weeklyAttendanceRate < 80) {
    insights.push(`⚠️ Weekly attendance rate is ${data.weeklyAttendanceRate}%. Review attendance alerts for chronic absentees.`);
  } else if (data.weeklyAttendanceRate > 0) {
    insights.push(`✅ Weekly attendance rate is good at ${data.weeklyAttendanceRate}%.`);
  }

  // Risk students
  if (data.atRiskCount > 0) {
    insights.push(`🔔 ${data.atRiskCount} student(s) flagged as high-risk. Review risk assessments for intervention plans.`);
  }

  return insights;
}
