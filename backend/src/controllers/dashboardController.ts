import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import * as metrics from '../services/metricsService';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.userId;

    if (userRole === 'TEACHER') {
      // 1. My Classes
      const myClasses = await prisma.class.findMany({
        where: { teacherId: userId },
        include: { _count: { select: { students: true } } }
      });

      const totalStudents = myClasses.reduce((acc, curr) => acc + curr._count.students, 0);

      // 2. Today's Schedule
      const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const todayDay = days[new Date().getDay()];

      const todaySchedule = await prisma.timetablePeriod.findMany({
        where: {
          teacherId: userId,
          dayOfWeek: todayDay as any
        },
        include: {
          classes: {
            include: {
              class: true
            }
          },
          subject: true
        },
        orderBy: { startTime: 'asc' }
      });

      // 3. Recent Assessments (Created for my classes)
      const classIds = myClasses.map(c => c.id);
      const recentAssessments = await prisma.assessment.findMany({
        where: {
          classId: { in: classIds }
        },
        take: 5,
        orderBy: { date: 'desc' },
        include: {
          class: true,
          subject: true,
          _count: { select: { results: true } }
        }
      });

      return res.json({
        role: 'TEACHER',
        stats: {
          totalStudents,
          totalClasses: myClasses.length,
          todayScheduleCount: todaySchedule.length
        },
        myClasses,
        todaySchedule,
        recentAssessments
      });
    }

    // --- ADMIN / BURSAR View — uses shared metricsService for canonical numbers ---

    const [health, recentPayments] = await Promise.all([
      metrics.getSchoolHealthSnapshot(),
      prisma.payment.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              class: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    res.json({
      role: 'ADMIN',
      dailyRevenue: health.revenue.todayRevenue,
      activeStudents: health.enrollment.activeStudents,
      outstandingFees: health.fees.outstanding,
      recentPayments: recentPayments.map(p => ({ ...p, amount: Number(p.amount) })),
      intelligence: {
        atRiskCount: health.risk.critical + health.risk.high,
        unresolvedAlerts: health.unresolvedAlerts,
        attendanceRate: health.attendance.ratePercent,
      },
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};
