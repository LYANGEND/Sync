import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

/**
 * Enhanced Analytics Controller
 * Provides trend analysis, AI insights, and school health metrics
 */

export const getAnalyticsDashboard = async (req: AuthRequest, res: Response) => {
  try {
    const { period = '30' } = req.query; // days
    const days = parseInt(period as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Parallel data fetching for performance
    const [
      enrollmentData,
      revenueData,
      attendanceData,
      academicData,
      riskData,
    ] = await Promise.all([
      getEnrollmentTrends(days),
      getRevenueTrends(startDate),
      getAttendanceTrends(startDate),
      getAcademicPerformance(),
      getRiskSummary(),
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
    const { startDate, endDate, groupBy = 'day' } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    const payments = await prisma.payment.findMany({
      where: {
        paymentDate: { gte: start, lte: end },
        status: 'COMPLETED',
      },
      include: {
        student: { include: { class: true } },
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
      percentage: Math.round((amount / payments.reduce((s, p) => s + Number(p.amount), 0)) * 100),
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
    const activeTerm = await prisma.academicTerm.findFirst({ where: { isActive: true } });
    if (!activeTerm) return res.json({ message: 'No active term' });

    const records = await prisma.attendance.findMany({
      where: {
        date: { gte: activeTerm.startDate, lte: new Date() },
      },
      include: {
        student: { include: { class: true } },
      },
    });

    // Overall attendance rate
    const totalRecords = records.length;
    const presentRecords = records.filter(r => r.status !== 'ABSENT').length;
    const overallRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;

    // By class
    const classStats = new Map<string, { name: string; total: number; present: number }>();
    records.forEach(r => {
      const className = r.student?.class?.name || 'Unknown';
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
        where: { isResolved: false },
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
    const [
      studentCount,
      teacherCount,
      classCount,
      activeTerm,
    ] = await Promise.all([
      prisma.student.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'TEACHER', isActive: true } }),
      prisma.class.count(),
      prisma.academicTerm.findFirst({ where: { isActive: true } }),
    ]);

    // Student-teacher ratio
    const studentTeacherRatio = teacherCount > 0 ? Math.round(studentCount / teacherCount) : 0;

    // Fee collection rate
    const totalFees = await prisma.studentFeeStructure.aggregate({ _sum: { amountDue: true } });
    const totalPaid = await prisma.payment.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
    });
    const collectionRate = Number(totalFees._sum.amountDue) > 0
      ? Math.round((Number(totalPaid._sum.amount) / Number(totalFees._sum.amountDue)) * 100)
      : 0;

    // Recent attendance rate (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentAttendance = await prisma.attendance.findMany({
      where: { date: { gte: weekAgo } },
    });
    const weeklyAttendanceRate = recentAttendance.length > 0
      ? Math.round((recentAttendance.filter(r => r.status !== 'ABSENT').length / recentAttendance.length) * 100)
      : 0;

    // Risk students count
    let atRiskCount = 0;
    try {
      atRiskCount = await (prisma as any).studentRiskAssessment.count({
        where: { riskLevel: { in: ['HIGH', 'CRITICAL'] } },
      });
    } catch { /* table may not exist yet */ }

    // Generate AI insights
    const insights = generateHealthInsights({
      studentCount,
      teacherCount,
      studentTeacherRatio,
      collectionRate,
      weeklyAttendanceRate,
      atRiskCount,
    });

    res.json({
      metrics: {
        activeStudents: studentCount,
        activeTeachers: teacherCount,
        totalClasses: classCount,
        studentTeacherRatio,
        feeCollectionRate: collectionRate,
        weeklyAttendanceRate,
        atRiskStudents: atRiskCount,
        currentTerm: activeTerm?.name || 'N/A',
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

async function getEnrollmentTrends(days: number) {
  const statusCounts = await prisma.student.groupBy({
    by: ['status'],
    _count: true,
  });

  const byGrade = await prisma.class.findMany({
    include: { _count: { select: { students: true } } },
    orderBy: { gradeLevel: 'asc' },
  });

  return {
    byStatus: statusCounts.map(s => ({ status: s.status, count: s._count })),
    byGrade: byGrade.map(c => ({
      className: c.name,
      gradeLevel: c.gradeLevel,
      students: c._count.students,
    })),
    total: statusCounts.reduce((sum, s) => sum + s._count, 0),
  };
}

async function getRevenueTrends(startDate: Date) {
  const payments = await prisma.payment.findMany({
    where: {
      paymentDate: { gte: startDate },
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

async function getAttendanceTrends(startDate: Date) {
  const records = await prisma.attendance.findMany({
    where: { date: { gte: startDate } },
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

async function getAcademicPerformance() {
  const activeTerm = await prisma.academicTerm.findFirst({ where: { isActive: true } });
  if (!activeTerm) return { averageScore: 0, passRate: 0, subjectPerformance: [] };

  const results = await prisma.termResult.findMany({
    where: { termId: activeTerm.id },
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

async function getRiskSummary() {
  try {
    const riskCounts = await (prisma as any).studentRiskAssessment.groupBy({
      by: ['riskLevel'],
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
