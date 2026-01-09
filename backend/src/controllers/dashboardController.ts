import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

    // --- ADMIN / BURSAR View (Existing) ---

    // 1. Total Revenue (Today) - COMPLETED ONLY
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayPayments = await prisma.payment.aggregate({
      where: {
        paymentDate: {
          gte: today,
        },
        status: 'COMPLETED'
      },
      _sum: {
        amount: true,
      },
    });

    // 2. Active Students
    const activeStudentsCount = await prisma.student.count({
      where: {
        status: 'ACTIVE',
      },
    });

    // 3. Outstanding Fees
    // Calculate total amount due - total revenue (COMPLETED)
    // This ensures consistency with paymentController
    const totalFeesAgg = await prisma.studentFeeStructure.aggregate({
      _sum: { amountDue: true },
    });

    const totalRevenueAgg = await prisma.payment.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
    });

    const totalFeesAssigned = Number(totalFeesAgg._sum.amountDue || 0);
    const totalRevenue = Number(totalRevenueAgg._sum.amount || 0);
    const totalOutstanding = Math.max(0, totalFeesAssigned - totalRevenue);

    // 4. Recent Payments (Last 5) - Include Status
    const recentPayments = await prisma.payment.findMany({
      take: 5,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            class: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    res.json({
      role: 'ADMIN',
      dailyRevenue: Number(todayPayments._sum.amount) || 0,
      activeStudents: activeStudentsCount,
      outstandingFees: totalOutstanding,
      recentPayments: recentPayments.map(p => ({
        ...p,
        amount: Number(p.amount)
      })),
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};
