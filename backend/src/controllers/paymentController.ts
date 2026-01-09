import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendNotification, generatePaymentReceiptEmail } from '../services/notificationService';

const prisma = new PrismaClient();

const createPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']),
  notes: z.string().optional(),
});

// Generate unique transaction ID: TXN-XXXXXXXX (8 char UUID)
const generateTransactionId = (): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'TXN-';
  for (let i = 0; i < 8; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

export const createPayment = async (req: Request, res: Response) => {
  try {
    const parseResult = createPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors });
    }

    const { studentId, amount, method, notes } = parseResult.data;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Check for potential duplicate payments (same student, same amount within 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentDuplicate = await prisma.payment.findFirst({
      where: {
        studentId,
        amount,
        status: 'COMPLETED',
        createdAt: {
          gte: fiveMinutesAgo
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // If duplicate found and force flag not set, return warning
    if (recentDuplicate && !req.body.forceCreate) {
      return res.status(409).json({
        warning: 'POTENTIAL_DUPLICATE',
        message: `A similar payment of ZMW ${amount} for this student was recorded ${Math.round((Date.now() - recentDuplicate.createdAt.getTime()) / 1000 / 60)} minutes ago. Set forceCreate=true to proceed anyway.`,
        existingPayment: {
          id: recentDuplicate.id,
          transactionId: recentDuplicate.transactionId,
          amount: Number(recentDuplicate.amount),
          paymentDate: recentDuplicate.paymentDate,
          method: recentDuplicate.method
        }
      });
    }

    // Generate transaction ID
    const transactionId = generateTransactionId();

    const payment = await prisma.payment.create({
      data: {
        transactionId,
        studentId,
        amount,
        method,
        notes,
        recordedByUserId: userId,
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
            guardianEmail: true,
            guardianName: true,
            guardianPhone: true,
            parent: {
              select: {
                email: true,
                fullName: true
              }
            },
            class: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        recordedBy: {
          select: {
            fullName: true,
          },
        },
      },
    });

    // Send Notification (Email & SMS) via Notification Service
    try {
      // Fetch school settings for the name
      const settings = await prisma.schoolSettings.findFirst();
      const schoolName = settings?.schoolName || 'School';

      const parentEmail = payment.student.parent?.email || payment.student.guardianEmail;
      const parentPhone = payment.student.guardianPhone;
      const guardianName = payment.student.parent?.fullName || payment.student.guardianName || 'Parent';

      if (parentEmail || parentPhone) {
        const { subject, text, html, sms } = generatePaymentReceiptEmail(
          guardianName,
          `${payment.student.firstName} ${payment.student.lastName}`,
          Number(amount),
          new Date(),
          method,
          transactionId,
          schoolName
        );

        // Send via service handling both channels based on settings
        sendNotification(
          parentEmail || undefined,
          parentPhone || undefined,
          subject,
          text,
          html,
          sms
        ).catch(err => console.error('Background notification failed:', err));

        console.log(`Notification queued for parent of student ${studentId}`);
      }
    } catch (notifyError) {
      console.error('Failed to process notifications:', notifyError);
      // Don't block the response, just log the error
    }

    res.status(201).json(payment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create payment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getPayments = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50; // Higher default for now
    const search = req.query.search as string;
    const status = req.query.status as string;

    const skip = (page - 1) * limit;
    const where: any = {};

    if (search) {
      where.OR = [
        { student: { firstName: { contains: search, mode: 'insensitive' } } },
        { student: { lastName: { contains: search, mode: 'insensitive' } } },
        { student: { admissionNumber: { contains: search, mode: 'insensitive' } } },
        { transactionId: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: limit,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              admissionNumber: true,
              class: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          recordedBy: {
            select: {
              fullName: true,
            },
          },
          voidedBy: { // Include voidedBy info
            select: {
              fullName: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      data: payments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getStudentPayments = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    const payments = await prisma.payment.findMany({
      where: { studentId },
      include: {
        recordedBy: {
          select: {
            fullName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(payments);
  } catch (error) {
    console.error('Get student payments error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getFinanceStats = async (req: Request, res: Response) => {
  try {
    // 1. Total Revenue (Sum of COMPLETED payments only)
    const totalRevenueAgg = await prisma.payment.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
      _count: { id: true },
    });
    const totalRevenue = Number(totalRevenueAgg._sum.amount || 0);
    const totalTransactions = totalRevenueAgg._count.id;

    // 2. Total Fees Assigned (Sum of all fee structures)
    const totalFeesAgg = await prisma.studentFeeStructure.aggregate({
      _sum: { amountDue: true },
    });
    const totalFeesAssigned = Number(totalFeesAgg._sum.amountDue || 0);

    // 3. Pending Fees
    const pendingFees = Math.max(0, totalFeesAssigned - totalRevenue);

    // 4. Overdue Students Count
    // Get total due per student
    const feesByStudent = await prisma.studentFeeStructure.groupBy({
      by: ['studentId'],
      _sum: { amountDue: true },
    });

    // Get total paid per student (COMPLETED only)
    const paymentsByStudent = await prisma.payment.groupBy({
      by: ['studentId'],
      where: { status: 'COMPLETED' },
      _sum: { amount: true },
    });

    const paymentMap = new Map();
    paymentsByStudent.forEach(p => {
      paymentMap.set(p.studentId, Number(p._sum.amount || 0));
    });

    let overdueCount = 0;
    feesByStudent.forEach(f => {
      const due = Number(f._sum.amountDue || 0);
      const paid = paymentMap.get(f.studentId) || 0;
      if (due > paid) overdueCount++;
    });

    // 5. Recent Activity (Show voided ones too, with status)
    const recentActivity = await prisma.payment.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { firstName: true, lastName: true } }
      }
    });

    res.json({
      totalRevenue,
      totalTransactions,
      pendingFees,
      overdueCount,
      recentActivity: recentActivity.map(p => ({
        id: p.id,
        description: `Payment from ${p.student.firstName} ${p.student.lastName}`,
        amount: Number(p.amount),
        date: p.paymentDate,
        status: p.status // Include status for frontend to display
      }))
    });
  } catch (error) {
    console.error('Finance stats error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getFinancialReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    // Monthly Revenue (COMPLETED only)
    const payments = await prisma.payment.findMany({
      where: {
        paymentDate: dateFilter,
        status: 'COMPLETED'
      },
      select: {
        amount: true,
        paymentDate: true
      }
    });

    const monthlyRevenue = new Array(12).fill(0);
    payments.forEach(p => {
      const month = new Date(p.paymentDate).getMonth();
      monthlyRevenue[month] += Number(p.amount);
    });

    // Payment Methods Stats (COMPLETED only)
    const methodsStats = await prisma.payment.groupBy({
      by: ['method'],
      where: {
        paymentDate: dateFilter,
        status: 'COMPLETED'
      },
      _count: { id: true },
      _sum: { amount: true }
    });

    // 3. Collection by Class
    // This is complex, so we'll do an aggregation
    const classes = await prisma.class.findMany({
      select: {
        id: true,
        name: true,
        students: {
          select: {
            feeStructures: {
              select: { amountDue: true }
            },
            payments: {
              select: { amount: true }
            }
          }
        }
      }
    });

    const classCollection = classes.map(cls => {
      let totalDue = 0;
      let totalCollected = 0;

      cls.students.forEach(student => {
        student.feeStructures.forEach(fee => totalDue += Number(fee.amountDue));
        student.payments.forEach(pay => totalCollected += Number(pay.amount));
      });

      return {
        className: cls.name,
        totalDue,
        totalCollected,
        percentage: totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0
      };
    }).sort((a, b) => b.percentage - a.percentage); // Best performing first

    res.json({
      monthlyRevenue,
      paymentMethods: methodsStats.map(m => ({
        method: m.method,
        count: m._count.id,
        amount: Number(m._sum.amount || 0)
      })),
      classCollection
    });

  } catch (error) {
    console.error('Financial report error:', error);
    res.status(500).json({ message: 'Failed to generate financial report' });
  }
};

// Void/Cancel a payment
const voidPaymentSchema = z.object({
  reason: z.string().min(5, 'Please provide a reason for voiding this payment'),
});

export const voidPayment = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const parseResult = voidPaymentSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors });
    }

    const { reason } = parseResult.data;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Find the payment
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    // Verify the user exists (handles stale tokens)
    const voidingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!voidingUser) {
      return res.status(401).json({ message: 'Session invalid. Please log out and log in again.' });
    }

    if (payment.status === 'VOIDED') {
      return res.status(400).json({ message: 'This payment has already been voided' });
    }

    // Void the payment
    const voidedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedByUserId: userId,
        voidReason: reason,
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
          }
        },
        recordedBy: {
          select: {
            fullName: true,
          }
        },
        voidedBy: {
          select: {
            fullName: true,
          }
        }
      }
    });

    console.log(`Payment ${paymentId} voided by user ${userId}. Reason: ${reason}`);

    res.json({
      message: 'Payment voided successfully',
      payment: voidedPayment
    });
  } catch (error) {
    console.error('Void payment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get single payment by ID
export const getPaymentById = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            class: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        },
        recordedBy: {
          select: {
            id: true,
            fullName: true,
          }
        },
        voidedBy: {
          select: {
            id: true,
            fullName: true,
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get recent payments for a student to check for duplicates
export const checkDuplicatePayment = async (req: Request, res: Response) => {
  try {
    const { studentId, amount } = req.query;

    if (!studentId || !amount) {
      return res.status(400).json({ message: 'studentId and amount are required' });
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const recentPayments = await prisma.payment.findMany({
      where: {
        studentId: studentId as string,
        amount: Number(amount),
        status: 'COMPLETED',
        createdAt: {
          gte: fiveMinutesAgo
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        transactionId: true,
        amount: true,
        paymentDate: true,
        method: true,
        createdAt: true,
      }
    });

    res.json({
      hasDuplicateRisk: recentPayments.length > 0,
      recentPayments: recentPayments.map(p => ({
        ...p,
        amount: Number(p.amount)
      }))
    });
  } catch (error) {
    console.error('Check duplicate error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
