import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }

    // 1. Total Revenue (Today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayPayments = await prisma.payment.aggregate({
      where: {
        paymentDate: {
          gte: today,
        },
        student: {
          schoolId: req.school.id
        }
      },
      _sum: {
        amount: true,
      },
    });

    // 2. Active Students
    const activeStudentsCount = await prisma.student.count({
      where: {
        status: 'ACTIVE',
        schoolId: req.school.id
      },
    });

    // 3. Outstanding Fees
    // Calculate total amount due - total amount paid across all fee structures
    const feeStats = await prisma.studentFeeStructure.aggregate({
      where: {
        student: {
          schoolId: req.school.id
        }
      },
      _sum: {
        amountDue: true,
        amountPaid: true,
      },
    });
    
    const totalOutstanding = (Number(feeStats._sum.amountDue) || 0) - (Number(feeStats._sum.amountPaid) || 0);

    // 4. Recent Payments (Last 5)
    const recentPayments = await prisma.payment.findMany({
      where: {
        student: {
          schoolId: req.school.id
        }
      },
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
      dailyRevenue: Number(todayPayments._sum.amount) || 0,
      activeStudents: activeStudentsCount,
      outstandingFees: totalOutstanding,
      recentPayments,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
};
