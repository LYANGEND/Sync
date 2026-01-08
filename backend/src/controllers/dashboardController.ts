import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TenantRequest, getTenantId, getUserId, getUserRole, handleControllerError } from '../utils/tenantContext';

const prisma = new PrismaClient();

export const getDashboardStats = async (req: TenantRequest, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const userRole = getUserRole(req);
    const userId = getUserId(req);

    if (userRole === 'TEACHER') {
      // 1. My Classes
      const myClasses = await prisma.class.findMany({
        where: { tenantId, teacherId: userId },
        include: { _count: { select: { students: true } } }
      });

      const totalStudents = myClasses.reduce((acc, curr) => acc + curr._count.students, 0);

      // 2. Today's Schedule
      const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
      const todayDay = days[new Date().getDay()];

      const todaySchedule = await prisma.timetablePeriod.findMany({
        where: {
          tenantId,
          teacherId: userId,
          dayOfWeek: todayDay as any
        },
        include: {
          class: true,
          subject: true
        },
        orderBy: { startTime: 'asc' }
      });

      // 3. Recent Assessments (Created for my classes)
      const classIds = myClasses.map(c => c.id);
      const recentAssessments = await prisma.assessment.findMany({
        where: {
          tenantId,
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

    // --- ADMIN / BURSAR View ---

    // 1. Total Revenue (Today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayPayments = await prisma.payment.aggregate({
      where: {
        tenantId,
        paymentDate: {
          gte: today,
        },
      },
      _sum: {
        amount: true,
      },
    });

    // 2. Active Students
    const activeStudentsCount = await prisma.student.count({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
    });

    // 3. Get student IDs for this tenant for fee calculations
    const students = await prisma.student.findMany({
      where: { tenantId },
      select: { id: true }
    });
    const studentIds = students.map(s => s.id);

    // 4. Outstanding Fees
    const feeStats = await prisma.studentFeeStructure.aggregate({
      where: { studentId: { in: studentIds } },
      _sum: {
        amountDue: true,
        amountPaid: true,
      },
    });

    const totalOutstanding = (Number(feeStats._sum.amountDue) || 0) - (Number(feeStats._sum.amountPaid) || 0);

    // 5. Recent Payments (Last 5)
    const recentPayments = await prisma.payment.findMany({
      where: { tenantId },
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

    // 6. Additional stats for admin
    const totalClasses = await prisma.class.count({ where: { tenantId } });
    const totalTeachers = await prisma.user.count({ where: { tenantId, role: 'TEACHER', isActive: true } });

    res.json({
      role: 'ADMIN',
      stats: {
        dailyRevenue: Number(todayPayments._sum.amount) || 0,
        activeStudents: activeStudentsCount,
        outstandingFees: totalOutstanding,
        totalClasses,
        totalTeachers,
      },
      recentPayments,
    });
  } catch (error) {
    handleControllerError(res, error, 'getDashboardStats');
  }
};
