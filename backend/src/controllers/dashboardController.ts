import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import * as metrics from '../services/metricsService';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.userId;
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : '';
    if (!academicTermId || !await prisma.academicTerm.findUnique({ where: { id: academicTermId }, select: { id: true } })) {
      return res.status(400).json({ error: 'A valid academicTermId is required' });
    }

    if (userRole === 'TEACHER') {
      // 1. My Classes
      const myClassRows = await prisma.class.findMany({
        where: { teacherId: userId, academicTermId },
        include: {
          termEnrollments: {
            where: { status: 'ACTIVE' },
            select: { studentId: true },
          },
        },
      });
      const myClasses = myClassRows.map(({ termEnrollments, ...classRecord }) => ({
        ...classRecord,
        _count: { students: termEnrollments.length },
      }));

      const totalStudents = myClasses.reduce((acc, curr) => acc + curr._count.students, 0);

      // 2. Today's Schedule
      const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const todayDay = days[new Date().getDay()];

      const todaySchedule = await prisma.timetablePeriod.findMany({
        where: {
          teacherId: userId,
          academicTermId,
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
          classId: { in: classIds },
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
      metrics.getSchoolHealthSnapshot(academicTermId),
      prisma.payment.findMany({
        where: { academicTermId, status: 'COMPLETED' },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    const paymentPlacements = await prisma.studentTermEnrollment.findMany({
      where: {
        academicTermId,
        studentId: { in: recentPayments.map(payment => payment.studentId) },
      },
      include: { class: { select: { name: true } } },
    });
    const classByStudentId = new Map(
      paymentPlacements.map(placement => [placement.studentId, placement.class]),
    );

    res.json({
      role: 'ADMIN',
      dailyRevenue: health.revenue.todayRevenue,
      activeStudents: health.enrollment.activeStudents,
      outstandingFees: health.fees.outstanding,
      recentPayments: recentPayments.map(payment => ({
        ...payment,
        amount: Number(payment.amount),
        student: {
          ...payment.student,
          class: classByStudentId.get(payment.studentId) ?? null,
        },
      })),
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
