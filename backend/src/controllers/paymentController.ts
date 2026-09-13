import { Request, Response } from 'express';
import { PaymentStatus } from '@prisma/client';
import { prisma, systemPrisma } from '../utils/prisma';
import { runWithTenant } from '../middleware/tenantContext';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendNotification, generatePaymentReceiptEmail, createNotification } from '../services/notificationService';
import {
  initiateMobileMoneyCollection,
  getCollectionStatus,
  getCollectionById,
  MobileMoneyCollectionRequest
} from '../services/lencoService';
import { verifyWebhookSignature } from '../services/lencoService';
import { applyInvoiceCollectionWebhookUpdate } from '../services/platformInvoicePaymentService';
import { onPaymentCreated, onPaymentVoided } from '../services/accountingBridge';
import {
  enqueuePaymentReceipt,
  PaymentReceiptChannel,
} from '../queues/paymentQueueService';
import { getQueueRuntimeStatus } from '../queues/queueRuntime';
import { invalidateFinancialSnapshotAfterMutation } from '../cache/financialSnapshotCache';
import {
  getClassCollectionAggregates,
  getFinanceOverviewAggregates,
  getMonthlyRevenueAggregates,
} from '../services/financialAggregationService';

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

const tryQueuePaymentReceipt = async (
  paymentId: string,
  channels: PaymentReceiptChannel[],
  actorUserId?: string,
): Promise<boolean> => {
  if (getQueueRuntimeStatus().state !== 'ready') return false;

  try {
    const queued = await enqueuePaymentReceipt({ paymentId, channels, actorUserId });
    console.log(JSON.stringify({
      event: 'payment.receipt.queued',
      paymentId,
      jobId: queued.jobId,
      correlationId: queued.correlationId,
    }));
    return true;
  } catch (error) {
    console.error('Failed to enqueue payment receipt; using fallback delivery:', error);
    return false;
  }
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
                id: true,
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

    await invalidateFinancialSnapshotAfterMutation({
      tenantId: payment.tenantId,
      branchId: payment.branchId,
      source: 'payment.created',
    });

    // Create accounting journal entry (double-entry bookkeeping)
    onPaymentCreated(payment.id, userId).catch(err =>
      console.error('Background journal entry creation failed:', err)
    );

    const notificationQueued = await tryQueuePaymentReceipt(
      payment.id,
      ['email', 'sms', 'inApp'],
      userId,
    );

    // Preserve synchronous behavior when the queue is disabled or degraded.
    if (!notificationQueued) try {
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

        // Create in-app notification for parent
        if (payment.student.parent?.id) {
          const formattedAmount = Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2 });
          createNotification(
            payment.student.parent.id,
            `✅ Payment Received`,
            `ZMW ${formattedAmount} received for ${payment.student.firstName} ${payment.student.lastName}. Ref: ${transactionId}.`,
            'SUCCESS'
          ).catch(err => console.error('In-app notification failed:', err));
        }

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
          },
          allocations: {
            select: {
              amount: true,
              studentFee: {
                select: {
                  feeTemplate: { select: { name: true } },
                },
              },
            },
          },
          mobileMoneyCollection: {
            select: {
              reference: true,
              operatorTransactionId: true,
              status: true,
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
    const whereRecent: any = {};
    if (branchId) whereRecent.branchId = branchId;
    const includeRevenueByBranch = user?.role === 'SUPER_ADMIN' && !branchId;

    const [
      totalRevenueAgg,
      financeOverview,
      revenueByBranch,
      branches,
      recentActivity,
    ] = await Promise.all([
      prisma.payment.aggregate({
        where: whereStatus,
        _sum: { amount: true },
        _count: { id: true },
      }),
      getFinanceOverviewAggregates(branchId),
      includeRevenueByBranch
        ? prisma.payment.groupBy({
          by: ['branchId'],
          where: { status: 'COMPLETED' },
          _sum: { amount: true },
        } as any)
        : Promise.resolve([] as any[]),
      includeRevenueByBranch
        ? prisma.branch.findMany({ select: { id: true, name: true } })
        : Promise.resolve([]),
      prisma.payment.findMany({
        where: whereRecent,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { firstName: true, lastName: true } }
        }
      }),
    ]);

    const totalRevenue = Number(totalRevenueAgg._sum.amount || 0);
    const totalTransactions = totalRevenueAgg._count.id;
    const pendingFees = Math.max(0, financeOverview.totalFeesAssigned - totalRevenue);
    const revenueByBranchWithNames = revenueByBranch.map((row: any) => ({
      branchId: row.branchId,
      branchName: branches.find(branch => branch.id === row.branchId)?.name || 'Unknown Branch',
      amount: Number(row._sum.amount || 0),
    }));

    res.json({
      totalRevenue,
      totalTransactions,
      pendingFees,
      overdueCount: financeOverview.overdueCount,
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

export const getReconciliationDashboard = async (req: Request, res: Response) => {
  try {
    const { status = 'all', method = 'ALL', startDate, endDate, branchId } = req.query;
    const parsedPage = Number(req.query.page);
    const parsedLimit = Number(req.query.limit);
    const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
    const requestedLimit = Number.isFinite(parsedLimit) ? Math.floor(parsedLimit) : 50;
    const limit = Math.max(1, Math.min(200, requestedLimit));
    const skip = (page - 1) * limit;
    const user = (req as any).user;

    const where: any = {
      status: 'COMPLETED',
    };

    const effectiveBranchId = user?.role !== 'SUPER_ADMIN' ? user?.branchId : (branchId as string);
    if (effectiveBranchId) {
      where.branchId = effectiveBranchId;
    }

    if (method && method !== 'ALL') {
      where.method = method;
    }

    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) where.paymentDate.gte = new Date(startDate as string);
      if (endDate) where.paymentDate.lte = new Date(endDate as string);
    }

    // Summary cards cover the complete filtered period/method/branch. The status
    // filter applies only to the paginated result set and its total.
    const summaryWhere = { ...where };
    if (status === 'reconciled') {
      where.isReconciled = true;
    } else if (status === 'unreconciled') {
      where.isReconciled = false;
    }

    const [
      payments,
      total,
      totals,
      reconciledTotals,
      unreconciledTotals,
      missingBankReference,
    ] = await Promise.all([
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
              class: { select: { id: true, name: true } },
            },
          },
          recordedBy: { select: { fullName: true } },
          allocations: {
            select: {
              amount: true,
              studentFee: {
                select: {
                  dueDate: true,
                  feeTemplate: { select: { name: true } },
                },
              },
            },
          },
          mobileMoneyCollection: {
            select: {
              reference: true,
              operatorTransactionId: true,
              status: true,
            },
          },
        },
        orderBy: [
          { isReconciled: 'asc' },
          { paymentDate: 'desc' },
        ],
      }),
      prisma.payment.count({ where }),
      prisma.payment.aggregate({
        where: summaryWhere,
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { ...summaryWhere, isReconciled: true },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { ...summaryWhere, isReconciled: false },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.payment.count({
        where: {
          ...summaryWhere,
          method: 'BANK_DEPOSIT',
          OR: [{ bankReference: null }, { bankReference: '' }],
        },
      }),
    ]);

    const normalizedPayments = payments.map(payment => {
      const allocatedAmount = payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      const unallocatedAmount = Math.max(0, Number(payment.amount) - allocatedAmount);

      return {
        ...payment,
        amount: Number(payment.amount),
        allocatedAmount,
        unallocatedAmount,
        allocationCount: payment.allocations.length,
        allocationLabels: payment.allocations.map(allocation => allocation.studentFee.feeTemplate.name),
        settlementReference: payment.bankReference || payment.mobileMoneyCollection?.operatorTransactionId || payment.mobileMoneyCollection?.reference || null,
      };
    });

    const pageUnallocated = normalizedPayments.reduce((acc, payment) => {
      if (payment.unallocatedAmount > 0.009) {
        acc.count += 1;
        acc.amount += payment.unallocatedAmount;
      }
      return acc;
    }, {
      count: 0,
      amount: 0,
    });

    const summary = {
      totalPayments: totals._count.id,
      totalAmount: Number(totals._sum.amount || 0),
      reconciledPayments: reconciledTotals._count.id,
      reconciledAmount: Number(reconciledTotals._sum.amount || 0),
      unreconciledPayments: unreconciledTotals._count.id,
      unreconciledAmount: Number(unreconciledTotals._sum.amount || 0),
      missingBankReference,
      pageUnallocatedPayments: pageUnallocated.count,
      pageUnallocatedAmount: pageUnallocated.amount,
    };

    res.json({
      summary,
      payments: normalizedPayments,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Reconciliation dashboard error:', error);
    res.status(500).json({ message: 'Failed to load reconciliation dashboard' });
  }
};

export const getFinancialReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, branchId } = req.query;
    const reportStartDate = startDate ? new Date(startDate as string) : undefined;
    const reportEndDate = endDate ? new Date(endDate as string) : undefined;

    const dateFilter: any = {};
    if (reportStartDate) dateFilter.gte = reportStartDate;
    if (reportEndDate) dateFilter.lte = reportEndDate;

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

    const [monthlyRevenue, methodsStats, classCollection] = await Promise.all([
      getMonthlyRevenueAggregates(reportStartDate, reportEndDate, effectiveBranchId),
      prisma.payment.groupBy({
        by: ['method'],
        where: paymentWhere,
        _count: { id: true },
        _sum: { amount: true }
      }),
      getClassCollectionAggregates(effectiveBranchId),
    ]);

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

const reconcilePaymentSchema = z.object({
  bankReference: z.string().trim().max(100).optional(),
  settlementDate: z.string().optional(),
  reconciliationNote: z.string().trim().max(500).optional(),
});

export const reconcilePayment = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const parseResult = reconcilePaymentSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({ error: parseResult.error.errors });
    }

    const userId = (req as any).user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    if (payment.status !== 'COMPLETED') {
      return res.status(400).json({ message: 'Only completed payments can be reconciled' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    const { bankReference, settlementDate, reconciliationNote } = parseResult.data;

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        isReconciled: true,
        reconciledAt: new Date(),
        reconciledByUserId: userId,
        reconciledByName: user?.fullName || 'Unknown User',
        settlementDate: settlementDate ? new Date(settlementDate) : (payment.settlementDate || new Date()),
        bankReference: bankReference || payment.bankReference,
        reconciliationNote: reconciliationNote || payment.reconciliationNote,
      },
    });

    res.json({
      message: 'Payment reconciled successfully',
      payment: { ...updated, amount: Number(updated.amount) },
    });
  } catch (error) {
    console.error('Reconcile payment error:', error);
    res.status(500).json({ message: 'Failed to reconcile payment' });
  }
};

export const unreconcilePayment = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const updated = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        isReconciled: false,
        reconciledAt: null,
        reconciledByUserId: null,
        reconciledByName: null,
        settlementDate: null,
        bankReference: null,
      },
    });

    res.json({
      message: 'Payment moved back to unreconciled state',
      payment: { ...updated, amount: Number(updated.amount) },
    });
  } catch (error) {
    console.error('Unreconcile payment error:', error);
    res.status(500).json({ message: 'Failed to unreconcile payment' });
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

    await invalidateFinancialSnapshotAfterMutation({
      tenantId: voidedPayment.tenantId,
      branchId: voidedPayment.branchId,
      source: 'payment.voided',
    });

    console.log(`Payment ${paymentId} voided by user ${userId}. Reason: ${reason}`);

    // Create reversal journal entry
    onPaymentVoided(paymentId, userId).catch(err =>
      console.error('Background void journal creation failed:', err)
    );

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
        branchId: true,
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

    // Persist the collection and linked pending payment atomically before the provider call.
    const { collection, pendingPayment } = await prisma.$transaction(async transaction => {
      const createdCollection = await transaction.mobileMoneyCollection.create({
        data: {
          reference,
          studentId,
          amount: totalCharge,
          phone,
          country,
          operator,
          initiatedByUserId: userId,
          status: 'PENDING',
          branchId: student.branchId,
        },
      });
      const createdPayment = await transaction.payment.create({
        data: {
          transactionId,
          studentId,
          amount: Number(totalCharge) / 1.025,
          method: 'MOBILE_MONEY',
          notes: `Mobile Money payment via ${operator.toUpperCase()}. Ref: ${reference}`,
          status: 'PENDING',
          recordedByUserId: userId,
          branchId: student.branchId,
        },
      });
      const linkedCollection = await transaction.mobileMoneyCollection.update({
        where: { id: createdCollection.id },
        data: { paymentId: createdPayment.id },
      });
      return { collection: linkedCollection, pendingPayment: createdPayment };
    });

    await invalidateFinancialSnapshotAfterMutation({
      tenantId: pendingPayment.tenantId,
      scope: 'tenant',
      source: 'payment.mobile-money-pending',
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
      const failedCollection = await prisma.mobileMoneyCollection.update({
        where: { id: collection.id },
        data: {
          status: 'FAILED',
          reasonForFailure: lencoResult.error,
        },
      });
      await invalidateFinancialSnapshotAfterMutation({
        tenantId: failedCollection.tenantId,
        scope: 'tenant',
        source: 'mobile-money.collection-failed',
      });
      await updatePaymentFromCollection(
        { ...collection, paymentId: pendingPayment.id, branchId: student.branchId },
        'FAILED',
      );

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

    await invalidateFinancialSnapshotAfterMutation({
      tenantId: updatedCollection.tenantId,
      scope: 'tenant',
      source: 'mobile-money.collection-updated',
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
    const collection = await prisma.mobileMoneyCollection.findFirst({
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

      await invalidateFinancialSnapshotAfterMutation({
        tenantId: updatedCollection.tenantId,
        scope: 'tenant',
        source: 'mobile-money.collection-status-changed',
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

    const paymentStatus = newStatus === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
    const transition = await prisma.payment.updateMany({
      where: { id: collection.paymentId, status: { not: paymentStatus as PaymentStatus } },
      data: {
        status: paymentStatus as PaymentStatus,
      },
    });

    const payment = await prisma.payment.findUnique({ where: { id: collection.paymentId } });
    if (!payment) throw new Error(`Payment ${collection.paymentId} not found`);
    if (transition.count === 0) return payment;

    await invalidateFinancialSnapshotAfterMutation({
      tenantId: payment.tenantId,
      scope: 'tenant',
      source: newStatus === 'COMPLETED'
        ? 'payment.mobile-money-completed'
        : 'payment.mobile-money-failed',
    });

    console.log(`Payment ${payment.transactionId} updated to ${newStatus} from collection ${collection.reference}`);

    // Create accounting journal entry for completed mobile money payment
    if (newStatus === 'COMPLETED') {
      onPaymentCreated(payment.id).catch(err =>
        console.error('Background journal entry for mobile money failed:', err)
      );
    }

    // Send notification to parent on successful payment.
    if (newStatus === 'COMPLETED') {
      const notificationQueued = await tryQueuePaymentReceipt(
        payment.id,
        ['email', 'sms'],
        collection.initiatedByUserId || payment.recordedByUserId || undefined,
      );

      if (notificationQueued) return payment;

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
    throw error;
  }
}

/**
 * Webhook endpoint for Lenco to notify us of payment status changes
 */
export const handleLencoWebhook = async (req: Request, res: Response) => {
  try {
    const signature = String(req.headers['x-lenco-signature'] || req.headers['x-webhook-signature'] || '');
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') || JSON.stringify(req.body);
    if (!verifyWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ message: 'Invalid webhook signature' });
    }

    const payload = req.body;

    // Extract relevant data from webhook
    const { reference, status, reasonForFailure, mobileMoneyDetails } = payload.data || {};

    console.log('Lenco webhook received', { reference, status });

    if (!reference) {
      console.log('Webhook missing reference');
      return res.status(400).json({ message: 'Missing reference' });
    }

    // Resolve the tenant using the unrestricted control-plane client, then perform
    // every mutation under that tenant's context. References must be unambiguous.
    const collections = await systemPrisma.mobileMoneyCollection.findMany({
      where: { reference },
      take: 2,
    });

    if (collections.length === 0) {
      // Not a school-fee collection — check whether it's a platform subscription
      // invoice payment instead (always paid via the platform's own Lenco account).
      if (reference.startsWith('SUB-')) {
        let mappedStatus: 'SUCCESSFUL' | 'FAILED' | 'PAY_OFFLINE' | null = null;
        if (status === 'successful') mappedStatus = 'SUCCESSFUL';
        else if (status === 'failed') mappedStatus = 'FAILED';
        else if (status === 'pay-offline') mappedStatus = 'PAY_OFFLINE';

        if (mappedStatus) {
          const updated = await applyInvoiceCollectionWebhookUpdate(reference, mappedStatus, reasonForFailure);
          if (updated) {
            console.log(`Webhook processed for platform invoice collection ${reference}: ${mappedStatus}`);
            return res.status(200).json({ received: true });
          }
        }
      }
      console.log(`Collection not found for reference: ${reference}`);
      return res.status(404).json({ message: 'Collection not found' });
    }
    if (collections.length > 1) {
      console.error(`Ambiguous collection reference received: ${reference}`);
      return res.status(409).json({ message: 'Ambiguous collection reference' });
    }

    const collection = collections[0];

    // Map Lenco status to our status
    let newStatus: 'PENDING' | 'PAY_OFFLINE' | 'SUCCESSFUL' | 'FAILED' = collection.status;
    if (status === 'successful') {
      newStatus = 'SUCCESSFUL';
    } else if (status === 'failed') {
      newStatus = 'FAILED';
    } else if (status === 'pay-offline') {
      newStatus = 'PAY_OFFLINE';
    }

    if (newStatus === collection.status) {
      if (collection.paymentId && newStatus === 'SUCCESSFUL') {
        await runWithTenant(collection.tenantId, () => updatePaymentFromCollection(collection, 'COMPLETED'));
      } else if (collection.paymentId && newStatus === 'FAILED') {
        await runWithTenant(collection.tenantId, () => updatePaymentFromCollection(collection, 'FAILED'));
      }
      return res.status(200).json({ received: true, duplicate: true });
    }

    if (collection.status === 'SUCCESSFUL') {
      return res.status(200).json({ received: true, ignored: true });
    }

    // Update collection status
    const transition = await runWithTenant(collection.tenantId, () => prisma.mobileMoneyCollection.updateMany({
      where: { id: collection.id, status: collection.status },
      data: {
        status: newStatus,
        completedAt: newStatus === 'SUCCESSFUL' ? new Date() : null,
        reasonForFailure: reasonForFailure || null,
        operatorTransactionId: mobileMoneyDetails?.operatorTransactionId,
        accountName: mobileMoneyDetails?.accountName,
      },
    }));
    if (transition.count === 0) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const updatedCollection = await runWithTenant(collection.tenantId, () => prisma.mobileMoneyCollection.findUnique({
      where: { id: collection.id },
    }));
    if (!updatedCollection) {
      throw new Error('Collection disappeared after webhook transition');
    }

    await invalidateFinancialSnapshotAfterMutation({
      tenantId: updatedCollection.tenantId,
      scope: 'tenant',
      source: 'mobile-money.webhook-status-changed',
    });

    // Update payment status based on collection result
    if (newStatus === 'SUCCESSFUL' && updatedCollection.paymentId) {
      await runWithTenant(collection.tenantId, () => updatePaymentFromCollection(updatedCollection, 'COMPLETED'));
    } else if (newStatus === 'FAILED' && updatedCollection.paymentId) {
      await runWithTenant(collection.tenantId, () => updatePaymentFromCollection(updatedCollection, 'FAILED'));
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

    const { collection, pendingPayment } = await prisma.$transaction(async transaction => {
      const createdCollection = await transaction.mobileMoneyCollection.create({
        data: {
          reference,
          studentId,
          amount: totalCharge,
          phone,
          country,
          operator,
          status: 'PENDING',
          branchId: student.branchId,
        },
      });
      const createdPayment = await transaction.payment.create({
        data: {
          transactionId,
          studentId,
          amount: Number(totalCharge) / 1.025,
          method: 'MOBILE_MONEY',
          notes: `Mobile Money payment via ${operator.toUpperCase()}. Ref: ${reference}`,
          status: 'PENDING',
          recordedByUserId: null,
          branchId: student.branchId,
        },
      });
      const linkedCollection = await transaction.mobileMoneyCollection.update({
        where: { id: createdCollection.id },
        data: { paymentId: createdPayment.id },
      });
      return { collection: linkedCollection, pendingPayment: createdPayment };
    });

    await invalidateFinancialSnapshotAfterMutation({
      tenantId: pendingPayment.tenantId,
      scope: 'tenant',
      source: 'payment.public-mobile-money-pending',
    });

    const lencoResult = await initiateMobileMoneyCollection({
      amount: totalCharge,
      phone,
      country: country as 'zm' | 'mw',
      operator: operator as 'airtel' | 'mtn' | 'tnm',
      reference,
    });

    if (!lencoResult.success) {
      const failedCollection = await prisma.mobileMoneyCollection.update({
        where: { id: collection.id },
        data: {
          status: 'FAILED',
          reasonForFailure: lencoResult.error,
        },
      });
      await invalidateFinancialSnapshotAfterMutation({
        tenantId: failedCollection.tenantId,
        scope: 'tenant',
        source: 'mobile-money.public-collection-failed',
      });
      await updatePaymentFromCollection(
        { ...collection, paymentId: pendingPayment.id, branchId: student.branchId },
        'FAILED',
      );

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

    await invalidateFinancialSnapshotAfterMutation({
      tenantId: updatedCollection.tenantId,
      scope: 'tenant',
      source: 'mobile-money.public-collection-updated',
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
