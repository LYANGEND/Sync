import { Request, Response } from 'express';
import { PrismaClient, PaymentStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendNotification, generatePaymentReceiptEmail } from '../services/notificationService';
import {
  initiateMobileMoneyCollection,
  getCollectionStatus,
  getCollectionById,
  MobileMoneyCollectionRequest
} from '../services/lencoService';

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

    // Link payment to the branch of the student
    const branchId = student.branchId;

    const payment = await prisma.payment.create({
      data: {
        transactionId,
        studentId,
        amount,
        method,
        notes,
        recordedByUserId: userId,
        branchId, // Assign branch
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
    const branchId = req.query.branchId as string; // Optional branch filter

    const skip = (page - 1) * limit;
    const where: any = {};

    if (branchId) {
      where.branchId = branchId;
    }

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

    // Branch Scoping:
    const user = (req as any).user;
    if (user?.role !== 'SUPER_ADMIN' && user?.branchId) {
      where.branchId = user.branchId;
    } else if (branchId) {
      // If SUPER_ADMIN allows filtering by branch
      where.branchId = branchId;
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
    const userRole = (req as any).user?.role;
    const userId = (req as any).user?.userId;

    // Security check for PARENT
    if (userRole === 'PARENT') {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { parentId: true }
      });

      if (!student || student.parentId !== userId) {
        return res.status(403).json({ message: 'Unauthorized access to student payments' });
      }
    }

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
    const user = (req as any).user;
    const branchId = user?.role !== 'SUPER_ADMIN' ? user?.branchId : req.query.branchId as string;

    const whereStatus: any = { status: 'COMPLETED' };
    if (branchId) whereStatus.branchId = branchId;

    // 1. Total Revenue (Sum of COMPLETED payments only)
    const totalRevenueAgg = await prisma.payment.aggregate({
      where: whereStatus,
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
    // 3. Pending Fees
    const pendingFees = Math.max(0, totalFeesAssigned - totalRevenue);

    // 4. Overdue Students Count
    // Get total due per student
    // Note: This logic needs to be branch-aware if strict branch separation is needed. 
    // For now, it calculates globally or we can filter by branchId if passed.

    // 5. Total Revenue per Branch
    // Only fetch breakdown if SUPER_ADMIN and no specific branch filter applied
    let revenueByBranch: any[] = [];
    if (user?.role === 'SUPER_ADMIN' && !branchId) {
      revenueByBranch = await prisma.payment.groupBy({
        by: ['branchId'],
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
      } as any);
    }

    // Enrich branch names
    const branches = await prisma.branch.findMany({ select: { id: true, name: true } });
    const revenueByBranchWithNames = revenueByBranch.map(r => ({
      branchId: r.branchId,
      branchName: branches.find(b => b.id === r.branchId)?.name || 'Unknown Branch',
      amount: Number(r._sum.amount || 0)
    }));

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
    const whereRecent: any = {};
    if (branchId) whereRecent.branchId = branchId;

    const recentActivity = await prisma.payment.findMany({
      where: whereRecent,
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
      revenueByBranch: revenueByBranchWithNames, // New breakdown
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
    const { startDate, endDate, branchId } = req.query;

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const paymentWhere: any = {
      paymentDate: dateFilter,
      status: 'COMPLETED'
    };

    const user = (req as any).user;
    // Determine effective branchId: User's branch overrides query if not SUPER_ADMIN
    const effectiveBranchId = user?.role !== 'SUPER_ADMIN' ? user?.branchId : (branchId as string);

    if (effectiveBranchId) {
      paymentWhere.branchId = effectiveBranchId;
    }

    // Monthly Revenue (COMPLETED only)
    const payments = await prisma.payment.findMany({
      where: paymentWhere,
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
      where: paymentWhere,
      _count: { id: true },
      _sum: { amount: true }
    });

    // 3. Collection by Class
    const classWhere: any = {};
    if (effectiveBranchId) {
      classWhere.branchId = effectiveBranchId;
    }

    const classes = await prisma.class.findMany({
      where: classWhere,
      select: {
        id: true,
        name: true,
        students: {
          select: {
            feeStructures: {
              select: { amountDue: true }
            },
            payments: {
              where: { status: 'COMPLETED' }, // Ensure we only count completed payments
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

// ============================================
// MOBILE MONEY PAYMENT FUNCTIONS (Lenco API)
// ============================================

// Validation schema for mobile money collection
const mobileMoneyPaymentSchema = z.object({
  studentId: z.string().uuid(),
  amount: z.number().positive(),
  phone: z.string().min(10).max(15),
  country: z.enum(['zm', 'mw']).default('zm'),
  operator: z.enum(['airtel', 'mtn', 'tnm']),
  notes: z.string().optional(),
});

// Generate unique reference for mobile money collection
const generateMobileMoneyReference = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `MM-${timestamp}-${random}`;
};

/**
 * Initiate a mobile money payment collection
 * This sends a payment prompt to the customer's phone
 */
export const initiateMobileMoneyPayment = async (req: Request, res: Response) => {
  try {
    const parseResult = mobileMoneyPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors });
    }

    const { studentId, amount, phone, country, operator, notes } = parseResult.data;

    // Calculate 2.5% processing fee
    const processingFee = amount * 0.025;
    const totalCharge = amount + processingFee;

    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate operator for country
    if (country === 'zm' && !['airtel', 'mtn'].includes(operator)) {
      return res.status(400).json({ message: 'For Zambia, only airtel or mtn operators are supported' });
    }
    if (country === 'mw' && !['airtel', 'tnm'].includes(operator)) {
      return res.status(400).json({ message: 'For Malawi, only airtel or tnm operators are supported' });
    }

    // Check if student exists
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        guardianPhone: true,
        parentId: true,
      }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Security Check: If user is PARENT, ensure they are the parent of this student
    if ((req as any).user.role === 'PARENT') {
      if (student.parentId !== userId) {
        return res.status(403).json({ message: 'Unauthorized: You can only make payments for your own children' });
      }
    }

    // Generate unique reference
    const reference = generateMobileMoneyReference();

    // Generate transaction ID for the payment
    const transactionId = generateTransactionId();

    // Create the collection record and pending payment in our database first
    const collection = await prisma.mobileMoneyCollection.create({
      data: {
        reference,
        studentId,
        amount: totalCharge,
        phone,
        country,
        operator,
        initiatedByUserId: userId,
        status: 'PENDING',
      },
    });

    // Create Payment record with PENDING status
    const pendingPayment = await prisma.payment.create({
      data: {
        transactionId,
        studentId,
        amount: Number(totalCharge) / 1.025, // Record tuition amount (exclude processing fee)
        method: 'MOBILE_MONEY',
        notes: `Mobile Money payment via ${operator.toUpperCase()}. Ref: ${reference}`,
        status: 'PENDING',
        recordedByUserId: userId,
      },
    });

    // Link the payment to the collection
    await prisma.mobileMoneyCollection.update({
      where: { id: collection.id },
      data: { paymentId: pendingPayment.id },
    });

    // Call Lenco API to initiate the collection
    const lencoResult = await initiateMobileMoneyCollection({
      amount: totalCharge,
      phone,
      country: country as 'zm' | 'mw',
      operator: operator as 'airtel' | 'mtn' | 'tnm',
      reference,
    });

    if (!lencoResult.success) {
      // Update collection status to FAILED
      await prisma.mobileMoneyCollection.update({
        where: { id: collection.id },
        data: {
          status: 'FAILED',
          reasonForFailure: lencoResult.error,
        },
      });

      return res.status(400).json({
        message: 'Failed to initiate mobile money collection',
        error: lencoResult.error,
      });
    }

    // Update collection with Lenco response
    const updatedCollection = await prisma.mobileMoneyCollection.update({
      where: { id: collection.id },
      data: {
        lencoReference: lencoResult.data?.lencoReference,
        lencoCollectionId: lencoResult.data?.id,
        status: lencoResult.data?.status === 'pay-offline' ? 'PAY_OFFLINE' : 'PENDING',
        fee: lencoResult.data?.fee ? parseFloat(lencoResult.data.fee) : null,
        accountName: lencoResult.data?.mobileMoneyDetails?.accountName,
      },
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

    console.log(`Mobile money collection initiated: ${reference} for student ${studentId}`);

    res.status(201).json({
      message: 'Mobile money payment request initiated. Customer will receive a prompt to authorize payment.',
      collection: {
        id: updatedCollection.id,
        reference: updatedCollection.reference,
        lencoReference: updatedCollection.lencoReference,
        amount: Number(updatedCollection.amount),
        phone: updatedCollection.phone,
        operator: updatedCollection.operator,
        status: updatedCollection.status,
        student: updatedCollection.student,
        initiatedAt: updatedCollection.initiatedAt,
      },
      nextSteps: [
        'Customer should authorize payment on their phone',
        'Use the /check-status endpoint to poll for payment completion',
        'Or wait for webhook notification at /webhook/lenco',
      ]
    });
  } catch (error) {
    console.error('Initiate mobile money payment error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Check the status of a mobile money collection
 */
export const checkMobileMoneyStatus = async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({ message: 'Reference is required' });
    }

    // Find the collection in our database
    const collection = await prisma.mobileMoneyCollection.findUnique({
      where: { reference },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
          }
        },
        payment: true,
      }
    });

    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    // If already successful or failed, return cached status
    if (collection.status === 'SUCCESSFUL' || collection.status === 'FAILED') {
      return res.json({
        collection: {
          id: collection.id,
          reference: collection.reference,
          amount: Number(collection.amount),
          status: collection.status,
          student: collection.student,
          payment: collection.payment ? {
            id: collection.payment.id,
            transactionId: collection.payment.transactionId,
          } : null,
          completedAt: collection.completedAt,
          reasonForFailure: collection.reasonForFailure,
        }
      });
    }

    // Query Lenco API for latest status
    const lencoResult = await getCollectionStatus(reference);

    if (!lencoResult.success) {
      return res.json({
        collection: {
          id: collection.id,
          reference: collection.reference,
          amount: Number(collection.amount),
          status: collection.status,
          student: collection.student,
          error: 'Could not fetch latest status from payment provider',
        }
      });
    }

    // Map Lenco status to our status
    let newStatus: 'PENDING' | 'PAY_OFFLINE' | 'SUCCESSFUL' | 'FAILED' = collection.status;
    if (lencoResult.data?.status === 'successful') {
      newStatus = 'SUCCESSFUL';
    } else if (lencoResult.data?.status === 'failed') {
      newStatus = 'FAILED';
    } else if (lencoResult.data?.status === 'pay-offline') {
      newStatus = 'PAY_OFFLINE';
    }

    // If status changed, update the collection
    if (newStatus !== collection.status) {
      const updatedCollection = await prisma.mobileMoneyCollection.update({
        where: { id: collection.id },
        data: {
          status: newStatus,
          completedAt: newStatus === 'SUCCESSFUL' ? new Date() : null,
          reasonForFailure: lencoResult.data?.reasonForFailure,
          operatorTransactionId: lencoResult.data?.mobileMoneyDetails?.operatorTransactionId,
          accountName: lencoResult.data?.mobileMoneyDetails?.accountName,
        },
      });

      // Update payment status based on collection result
      if (newStatus === 'SUCCESSFUL' && collection.paymentId) {
        await updatePaymentFromCollection({ ...collection, paymentId: collection.paymentId }, 'COMPLETED');
      } else if (newStatus === 'FAILED' && collection.paymentId) {
        await updatePaymentFromCollection({ ...collection, paymentId: collection.paymentId }, 'FAILED');
      }

      // If successful, return with payment info
      if (newStatus === 'SUCCESSFUL') {
        return res.json({
          collection: {
            id: updatedCollection.id,
            reference: updatedCollection.reference,
            amount: Number(updatedCollection.amount),
            status: updatedCollection.status,
            student: collection.student,
            payment: collection.payment ? {
              id: collection.payment.id,
              transactionId: collection.payment.transactionId,
            } : null,
            completedAt: updatedCollection.completedAt,
          },
          message: 'Payment completed successfully',
        });
      }
    }

    res.json({
      collection: {
        id: collection.id,
        reference: collection.reference,
        amount: Number(collection.amount),
        status: newStatus,
        student: collection.student,
        reasonForFailure: lencoResult.data?.reasonForFailure,
      }
    });
  } catch (error) {
    console.error('Check mobile money status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Helper function to update payment status from mobile money collection
 */
async function updatePaymentFromCollection(collection: any, newStatus: 'COMPLETED' | 'FAILED') {
  try {
    if (!collection.paymentId) {
      console.error(`No payment linked to collection ${collection.reference}`);
      return null;
    }

    // Update payment status
    const paymentStatus = newStatus === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
    const payment = await prisma.payment.update({
      where: { id: collection.paymentId },
      data: {
        status: paymentStatus as PaymentStatus,
      },
    });

    console.log(`Payment ${payment.transactionId} updated to ${newStatus} from collection ${collection.reference}`);

    // Send notification to parent on successful payment
    if (newStatus === 'COMPLETED') {
      // Fetch student with parent info for notification
      const student = await prisma.student.findUnique({
        where: { id: payment.studentId },
        include: { parent: true },
      });

      if (student) {
        const guardianEmail = student.guardianEmail || student.parent?.email;
        const guardianPhone = student.guardianPhone; // Phone from student record
        const guardianName = student.guardianName || student.parent?.fullName || 'Parent/Guardian';

        // Get school name
        const settings = await prisma.schoolSettings.findFirst();
        const schoolName = settings?.schoolName || 'School';

        // Generate email/SMS content
        const { subject, text, html, sms } = generatePaymentReceiptEmail(
          guardianName,
          `${student.firstName} ${student.lastName}`,
          Number(payment.amount),
          new Date(),
          'MOBILE_MONEY',
          payment.transactionId || collection.reference,
          schoolName
        );

        // Send email and SMS
        const { emailSent, smsSent } = await sendNotification(
          guardianEmail || undefined,
          guardianPhone || undefined,
          subject,
          text,
          html,
          sms
        );

        console.log(`Payment notification sent - Email: ${emailSent}, SMS: ${smsSent}`);
      }
    }

    return payment;
  } catch (error) {
    console.error('Error updating payment from collection:', error);
    return null;
  }
}

/**
 * Webhook endpoint for Lenco to notify us of payment status changes
 */
export const handleLencoWebhook = async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    console.log('Lenco webhook received:', JSON.stringify(payload, null, 2));

    // Extract relevant data from webhook
    const { reference, status, reasonForFailure, mobileMoneyDetails } = payload.data || {};

    if (!reference) {
      console.log('Webhook missing reference');
      return res.status(400).json({ message: 'Missing reference' });
    }

    // Find the collection
    const collection = await prisma.mobileMoneyCollection.findUnique({
      where: { reference },
    });

    if (!collection) {
      console.log(`Collection not found for reference: ${reference}`);
      return res.status(404).json({ message: 'Collection not found' });
    }

    // Map Lenco status to our status
    let newStatus: 'PENDING' | 'PAY_OFFLINE' | 'SUCCESSFUL' | 'FAILED' = collection.status;
    if (status === 'successful') {
      newStatus = 'SUCCESSFUL';
    } else if (status === 'failed') {
      newStatus = 'FAILED';
    } else if (status === 'pay-offline') {
      newStatus = 'PAY_OFFLINE';
    }

    // Update collection status
    const updatedCollection = await prisma.mobileMoneyCollection.update({
      where: { id: collection.id },
      data: {
        status: newStatus,
        completedAt: newStatus === 'SUCCESSFUL' ? new Date() : null,
        reasonForFailure: reasonForFailure || null,
        operatorTransactionId: mobileMoneyDetails?.operatorTransactionId,
        accountName: mobileMoneyDetails?.accountName,
      },
    });

    // Update payment status based on collection result
    if (newStatus === 'SUCCESSFUL' && updatedCollection.paymentId) {
      await updatePaymentFromCollection(updatedCollection, 'COMPLETED');
    } else if (newStatus === 'FAILED' && updatedCollection.paymentId) {
      await updatePaymentFromCollection(updatedCollection, 'FAILED');
    }

    console.log(`Webhook processed for collection ${reference}: ${newStatus}`);

    // Respond to webhook
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Lenco webhook error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
};

/**
 * Get all mobile money collections (with pagination)
 */
export const getMobileMoneyCollections = async (req: Request, res: Response) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const status = req.query.status as string;
    const studentId = req.query.studentId as string;

    const skip = (page - 1) * limit;
    const where: any = {};

    if (status) {
      where.status = status.toUpperCase();
    }

    if (studentId) {
      where.studentId = studentId;
    }

    // Security Check: If user is PARENT, only show collections for their children
    if ((req as any).user.role === 'PARENT') {
      const parentId = (req as any).user.userId;
      where.student = { parentId };
    }

    const [collections, total] = await Promise.all([
      prisma.mobileMoneyCollection.findMany({
        where,
        skip,
        take: limit,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              admissionNumber: true,
            }
          },
          payment: {
            select: {
              id: true,
              transactionId: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.mobileMoneyCollection.count({ where }),
    ]);

    res.json({
      data: collections.map(c => ({
        ...c,
        amount: Number(c.amount),
        fee: c.fee ? Number(c.fee) : null,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    console.error('Get mobile money collections error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get a single mobile money collection by ID
 */
export const getMobileMoneyCollectionById = async (req: Request, res: Response) => {
  try {
    const { collectionId } = req.params;

    const collection = await prisma.mobileMoneyCollection.findUnique({
      where: { id: collectionId },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNumber: true,
            guardianPhone: true,
            guardianEmail: true,
            class: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        },
        payment: {
          select: {
            id: true,
            transactionId: true,
            paymentDate: true,
            status: true,
          }
        }
      }
    });

    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    // Security Check: If user is PARENT, ensure they own this collection
    if ((req as any).user.role === 'PARENT') {
      const parentId = (req as any).user.userId;
      // We need to check if the student belongs to this parent
      // The collection includes student, but let's check the student.parentId
      // We didn't include parentId in the query above, let's fix that or rely on initiatedByUserId if that's trustworthy, 
      // but parent might not have initiated it (maybe initiated by admin?).
      // Better to check Student link.

      const student = await prisma.student.findUnique({
        where: { id: collection.studentId },
        select: { parentId: true }
      });

      if (student?.parentId !== parentId) {
        return res.status(403).json({ message: 'Unauthorized' });
      }
    }

    res.json({
      ...collection,
      amount: Number(collection.amount),
      fee: collection.fee ? Number(collection.fee) : null,
    });
  } catch (error) {
    console.error('Get mobile money collection error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ============================================
// PUBLIC PAYMENT FUNCTIONS
// ============================================

export const getStudentForPublicPayment = async (req: Request, res: Response) => {
  try {
    const { identifier } = req.params;

    if (!identifier) {
      return res.status(400).json({ message: 'Student Identifier is required' });
    }

    const student = await prisma.student.findFirst({
      where: {
        OR: [
          { id: identifier },
          { admissionNumber: identifier }
        ]
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        class: { select: { name: true } }
      }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Calculate Balance
    const totalFees = await prisma.studentFeeStructure.aggregate({
      where: { studentId: student.id },
      _sum: { amountDue: true }
    });

    const totalPayments = await prisma.payment.aggregate({
      where: {
        studentId: student.id,
        status: 'COMPLETED'
      },
      _sum: { amount: true }
    });

    const due = Number(totalFees._sum.amountDue || 0);
    const paid = Number(totalPayments._sum.amount || 0);
    const balance = due - paid;

    res.json({ ...student, balance });
  } catch (error) {
    console.error('Public Get Student Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const initiatePublicMobileMoneyPayment = async (req: Request, res: Response) => {
  try {
    const parseResult = mobileMoneyPaymentSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors });
    }

    const { studentId, amount, phone, country, operator, notes } = parseResult.data;

    // Calculate 2.5% processing fee
    const processingFee = amount * 0.025;
    const totalCharge = amount + processingFee;

    if (country === 'zm' && !['airtel', 'mtn'].includes(operator)) {
      return res.status(400).json({ message: 'For Zambia, only airtel or mtn operators are supported' });
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const reference = generateMobileMoneyReference();
    const transactionId = generateTransactionId();

    const collection = await prisma.mobileMoneyCollection.create({
      data: {
        reference,
        studentId,
        amount: totalCharge,
        phone,
        country,
        operator,
        status: 'PENDING',
      },
    });

    // Create Payment record with PENDING status
    const pendingPayment = await prisma.payment.create({
      data: {
        transactionId,
        studentId,
        amount: Number(totalCharge) / 1.025, // Record tuition amount (exclude processing fee)
        method: 'MOBILE_MONEY',
        notes: `Mobile Money payment via ${operator.toUpperCase()}. Ref: ${reference}`,
        status: 'PENDING',
        recordedByUserId: null, // Public payment has no recorded user
      },
    });

    // Link the payment to the collection
    await prisma.mobileMoneyCollection.update({
      where: { id: collection.id },
      data: { paymentId: pendingPayment.id },
    });

    const lencoResult = await initiateMobileMoneyCollection({
      amount: totalCharge,
      phone,
      country: country as 'zm' | 'mw',
      operator: operator as 'airtel' | 'mtn' | 'tnm',
      reference,
    });

    if (!lencoResult.success) {
      await prisma.mobileMoneyCollection.update({
        where: { id: collection.id },
        data: {
          status: 'FAILED',
          reasonForFailure: lencoResult.error,
        },
      });

      return res.status(400).json({
        message: 'Failed to initiate mobile money collection',
        error: lencoResult.error,
      });
    }

    const updatedCollection = await prisma.mobileMoneyCollection.update({
      where: { id: collection.id },
      data: {
        lencoReference: lencoResult.data?.lencoReference,
        lencoCollectionId: lencoResult.data?.id,
        status: lencoResult.data?.status === 'pay-offline' ? 'PAY_OFFLINE' : 'PENDING',
        fee: lencoResult.data?.fee ? parseFloat(lencoResult.data.fee) : null,
        accountName: lencoResult.data?.mobileMoneyDetails?.accountName,
      },
    });

    res.status(201).json({
      message: 'Mobile money payment request initiated.',
      collection: {
        id: updatedCollection.id,
        reference: updatedCollection.reference,
        amount: Number(updatedCollection.amount),
        phone: updatedCollection.phone,
        operator: updatedCollection.operator,
        status: updatedCollection.status,
      },
    });

  } catch (error) {
    console.error('Public Initiate Payment Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
