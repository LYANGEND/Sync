import { Request, Response } from 'express';
import { PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { sendNotification, generatePaymentReceiptEmail, createNotification } from '../services/notificationService';
import {
  initiateMobileMoneyCollection,
  getCollectionStatus,
  getCollectionById,
  MobileMoneyCollectionRequest
} from '../services/lencoService';
import { onPaymentCreated, onPaymentVoided } from '../services/accountingBridge';
import {
  getActiveTerm,
  runTermWriteTransaction,
  TermLifecycleError,
} from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import { getAgeingBucket, getTermStudentBalances } from '../services/termFinancialService';
import {
  completePendingPaymentInTransaction,
  createCompletedPayment,
  PaymentSettlementError,
  voidPaymentSettlement,
} from '../services/paymentSettlementService';
import { sendPaymentSettlementError } from '../utils/paymentSettlementHttp';

const createPaymentSchema = z.object({
  studentId: z.string().uuid(),
  academicTermId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']),
  notes: z.string().optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
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

    const { studentId, academicTermId, amount, method, notes } = parseResult.data;
    const user = (req as AuthRequest).user;
    const userId = user?.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const headerIdempotencyKey = req.header?.('Idempotency-Key')?.trim();
    const idempotencyKey = parseResult.data.idempotencyKey ?? headerIdempotencyKey;
    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
      return res.status(400).json({ error: 'Idempotency key must be between 8 and 200 characters' });
    }

    const creation = await createCompletedPayment({
      studentId,
      receiptTermId: academicTermId,
      amount,
      method,
      source: 'MANUAL',
      notes,
      recordedByUserId: userId,
      actorBranchId: user?.role === 'SUPER_ADMIN' ? null : user?.branchId,
      idempotencyKey,
    });

    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: creation.payment.id },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
            guardianEmail: true,
            guardianName: true,
            guardianPhone: true,
            parent: { select: { id: true, email: true, fullName: true } },
          },
        },
        recordedBy: { select: { fullName: true } },
      },
    });
    const transactionId = payment.transactionId || payment.id;

    // Create accounting journal entry (double-entry bookkeeping)
    if (!creation.reused) {
      onPaymentCreated(payment.id, userId).catch(err =>
        console.error('Background journal entry creation failed:', err)
      );
    }

    // Send Notification (Email & SMS) via Notification Service
    if (!creation.reused) try {
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

    res.status(creation.reused ? 200 : 201).json({
      ...payment,
      settlement: {
        allocatedAmount: creation.settlement.allocatedAmount,
        unallocatedAmount: creation.settlement.unallocatedAmount,
      },
      reused: creation.reused,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof PaymentSettlementError) return sendPaymentSettlementError(res, error);
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
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;
    if (!academicTermId) {
      return res.status(400).json({ message: 'Academic term ID is required' });
    }

    const skip = (page - 1) * limit;
    const where: any = { academicTermId };

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

    const data = payments.map(payment => {
      const allocatedAmount = payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      return {
        ...payment,
        amount: Number(payment.amount),
        allocatedAmount,
        unallocatedAmount: Math.max(0, Number(payment.amount) - allocatedAmount),
        allocationCount: payment.allocations.length,
        allocationLabels: payment.allocations.map(allocation => allocation.studentFee.feeTemplate.name),
      };
    });

    res.json({
      data,
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
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;
    const userRole = (req as any).user?.role;
    const requestUser = (req as AuthRequest).user;
    const userId = requestUser?.userId;

    if (!academicTermId) {
      return res.status(400).json({ message: 'Academic term ID is required' });
    }

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
      where: { studentId, academicTermId },
      include: {
        academicTerm: {
          select: {
            id: true,
            name: true,
          },
        },
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
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;
    if (!academicTermId) return res.status(400).json({ message: 'Academic term ID is required' });

    const whereStatus: any = { status: 'COMPLETED', academicTermId };
    if (branchId) whereStatus.branchId = branchId;

    // 1. Total Revenue (Sum of COMPLETED payments only)
    const totalRevenueAgg = await prisma.payment.aggregate({
      where: whereStatus,
      _sum: { amount: true },
      _count: { id: true },
    });
    const totalRevenue = Number(totalRevenueAgg._sum.amount || 0);
    const totalTransactions = totalRevenueAgg._count.id;

    // 2-4. Billed, still owed and credit, from the same per-student balances used by fee reminders
    const balances = await getTermStudentBalances(academicTermId, branchId);
    const totalBilled = balances.reduce((sum, b) => sum + b.billed, 0);
    const debtors = balances.filter(b => b.balance > 0);
    const creditors = balances.filter(b => b.balance < 0);
    const pendingFees = debtors.reduce((sum, b) => sum + b.balance, 0);
    const overdueCount = debtors.length;
    const creditBalance = creditors.reduce((sum, b) => sum - b.balance, 0);
    const creditCount = creditors.length;

    // 5. Total Revenue per Branch
    // Only fetch breakdown if SUPER_ADMIN and no specific branch filter applied
    let revenueByBranch: any[] = [];
    if (user?.role === 'SUPER_ADMIN' && !branchId) {
      revenueByBranch = await prisma.payment.groupBy({
        by: ['branchId'],
        where: { status: 'COMPLETED', academicTermId },
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

    // 6. Recent Activity (Show voided ones too, with status)
    const whereRecent: any = { academicTermId };
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
      totalBilled,
      pendingFees,
      overdueCount,
      creditBalance,
      creditCount,
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
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;
    if (!academicTermId) return res.status(400).json({ message: 'Academic term ID is required' });
    const user = (req as any).user;

    const where: any = {
      status: 'COMPLETED',
      academicTermId,
    };

    const effectiveBranchId = user?.role !== 'SUPER_ADMIN' ? user?.branchId : (branchId as string);
    if (effectiveBranchId) {
      where.branchId = effectiveBranchId;
    }

    if (method && method !== 'ALL') {
      where.method = method;
    }

    if (status === 'reconciled') {
      where.isReconciled = true;
    } else if (status === 'unreconciled') {
      where.isReconciled = false;
    }

    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) where.paymentDate.gte = new Date(startDate as string);
      if (endDate) where.paymentDate.lte = new Date(endDate as string);
    }

    const payments = await prisma.payment.findMany({
      where,
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNumber: true,
            termEnrollments: {
              where: { academicTermId },
              select: { class: { select: { id: true, name: true } } },
              take: 1,
            },
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
    });

    const normalizedPayments = payments.map(payment => {
      const allocatedAmount = payment.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
      const unallocatedAmount = Math.max(0, Number(payment.amount) - allocatedAmount);

      return {
        ...payment,
        student: {
          ...payment.student,
          class: payment.student.termEnrollments[0]?.class ?? null,
          termEnrollments: undefined,
        },
        amount: Number(payment.amount),
        allocatedAmount,
        unallocatedAmount,
        allocationCount: payment.allocations.length,
        allocationLabels: payment.allocations.map(allocation => allocation.studentFee.feeTemplate.name),
        settlementReference: payment.bankReference || payment.mobileMoneyCollection?.operatorTransactionId || payment.mobileMoneyCollection?.reference || null,
      };
    });

    const summary = normalizedPayments.reduce((acc, payment) => {
      acc.totalPayments += 1;
      acc.totalAmount += payment.amount;

      if (payment.isReconciled) {
        acc.reconciledPayments += 1;
        acc.reconciledAmount += payment.amount;
      } else {
        acc.unreconciledPayments += 1;
        acc.unreconciledAmount += payment.amount;
      }

      if (payment.unallocatedAmount > 0.009) {
        acc.unallocatedPayments += 1;
        acc.unallocatedAmount += payment.unallocatedAmount;
      }

      if (payment.method === 'BANK_DEPOSIT' && !payment.bankReference) {
        acc.missingBankReference += 1;
      }

      return acc;
    }, {
      totalPayments: 0,
      totalAmount: 0,
      reconciledPayments: 0,
      reconciledAmount: 0,
      unreconciledPayments: 0,
      unreconciledAmount: 0,
      unallocatedPayments: 0,
      unallocatedAmount: 0,
      missingBankReference: 0,
    });

    res.json({ summary, payments: normalizedPayments });
  } catch (error) {
    console.error('Reconciliation dashboard error:', error);
    res.status(500).json({ message: 'Failed to load reconciliation dashboard' });
  }
};

export const getFinancialReport = async (req: Request, res: Response) => {
  try {
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;
    if (!academicTermId) return res.status(400).json({ message: 'Academic term ID is required' });

    const user = (req as any).user;
    const branchId: string | undefined = user?.role !== 'SUPER_ADMIN' ? user?.branchId : (req.query.branchId as string | undefined);

    const term = await prisma.academicTerm.findUnique({
      where: { id: academicTermId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (!term) return res.status(404).json({ message: 'Academic term not found' });

    const paymentWhere: Prisma.PaymentWhereInput = {
      status: 'COMPLETED',
      academicTermId,
      ...(branchId ? { student: { branchId } } : {}),
    };

    const [balances, payments, methodsStats] = await Promise.all([
      getTermStudentBalances(academicTermId, branchId),
      prisma.payment.findMany({ where: paymentWhere, select: { amount: true, paymentDate: true } }),
      prisma.payment.groupBy({
        by: ['method'],
        where: paymentWhere,
        _count: { id: true },
        _sum: { amount: true },
      }),
    ]);

    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;

    // Debtors, ageing and summary all come from the same per-student balances
    const debtors = balances
      .filter(b => b.balance > 0)
      .map(b => {
        const daysOverdue = b.earliestDueDate ? Math.floor((now.getTime() - b.earliestDueDate.getTime()) / dayMs) : 0;
        return {
          studentId: b.id,
          name: `${b.firstName} ${b.lastName}`,
          admissionNumber: b.admissionNumber,
          className: b.className,
          billed: b.billed,
          paid: b.paid,
          balance: b.balance,
          earliestDueDate: b.earliestDueDate,
          daysOverdue: Math.max(0, daysOverdue),
          bucket: getAgeingBucket(daysOverdue),
          guardianName: b.guardianName,
          guardianPhone: b.guardianPhone,
          guardianEmail: b.guardianEmail,
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);

    const ageingOrder = ['current', '1-30', '31-60', '61-90', '90+'] as const;
    const ageing = ageingOrder.map(bucket => {
      const inBucket = debtors.filter(d => d.bucket === bucket);
      return { bucket, amount: inBucket.reduce((sum, d) => sum + d.balance, 0), students: inBucket.length };
    });

    const billed = balances.reduce((sum, b) => sum + b.billed, 0);
    const collected = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const owed = debtors.reduce((sum, d) => sum + d.balance, 0);
    const overdue = debtors.filter(d => d.bucket !== 'current');
    const creditors = balances.filter(b => b.balance < 0);

    // Classes: how much of each class's billing is settled (overpayments do not offset other students)
    const classMap = new Map<string, { className: string; students: number; billed: number; settled: number; owed: number; debtors: number }>();
    for (const b of balances) {
      const entry = classMap.get(b.className) || { className: b.className, students: 0, billed: 0, settled: 0, owed: 0, debtors: 0 };
      entry.students += 1;
      entry.billed += b.billed;
      entry.settled += Math.min(b.paid, b.billed);
      entry.owed += Math.max(0, b.balance);
      if (b.balance > 0) entry.debtors += 1;
      classMap.set(b.className, entry);
    }
    const classCollection = Array.from(classMap.values())
      .map(c => ({ ...c, rate: c.billed > 0 ? Math.round((c.settled / c.billed) * 100) : 0 }))
      .sort((a, b) => a.rate - b.rate || b.owed - a.owed);

    // Weekly collections across the term so far (payments outside the term dates fall into the first/last week)
    const termStart = new Date(term.startDate);
    const lastDay = now < term.endDate ? now : new Date(term.endDate);
    const weekCount = Math.max(1, Math.ceil((lastDay.getTime() - termStart.getTime() + 1) / (7 * dayMs)));
    const weekly = Array.from({ length: weekCount }, (_, index) => ({
      week: index + 1,
      weekStart: new Date(termStart.getTime() + index * 7 * dayMs),
      amount: 0,
      payments: 0,
      cumulative: 0,
    }));
    for (const payment of payments) {
      const index = Math.min(weekCount - 1, Math.max(0, Math.floor((payment.paymentDate.getTime() - termStart.getTime()) / (7 * dayMs))));
      weekly[index].amount += Number(payment.amount);
      weekly[index].payments += 1;
    }
    weekly.reduce((running, week) => (week.cumulative = running + week.amount), 0);

    res.json({
      term,
      summary: {
        billed,
        collected,
        paymentsCount: payments.length,
        owed,
        debtorCount: debtors.length,
        overdueAmount: overdue.reduce((sum, d) => sum + d.balance, 0),
        overdueCount: overdue.length,
        credit: creditors.reduce((sum, b) => sum - b.balance, 0),
        creditCount: creditors.length,
        studentsBilled: balances.filter(b => b.billed > 0).length,
        settledRate: billed > 0 ? Math.round(((billed - owed) / billed) * 100) : 0,
      },
      weekly,
      paymentMethods: methodsStats
        .map(m => ({ method: m.method, count: m._count.id, amount: Number(m._sum.amount || 0) }))
        .sort((a, b) => b.amount - a.amount),
      classCollection,
      ageing,
      debtors,
      generatedAt: now,
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

    const requestUser = (req as AuthRequest).user;
    const userId = requestUser?.userId;
    if (!requestUser || !userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    if (requestUser.role !== 'SUPER_ADMIN' && payment.branchId !== requestUser.branchId) {
      return res.status(403).json({ message: 'Payment does not belong to the current branch' });
    }

    if (payment.status !== 'COMPLETED') {
      return res.status(400).json({ message: 'Only completed payments can be reconciled' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    const { bankReference, settlementDate, reconciliationNote } = parseResult.data;

    const updated = await runTermWriteTransaction(payment.academicTermId, 'FINANCIAL_RECEIPT', tx => (
      tx.payment.update({
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
      })
    ));

    res.json({
      message: 'Payment reconciled successfully',
      payment: { ...updated, amount: Number(updated.amount) },
    });
  } catch (error) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Reconcile payment error:', error);
    res.status(500).json({ message: 'Failed to reconcile payment' });
  }
};

export const unreconcilePayment = async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const requestUser = (req as AuthRequest).user;
    if (!requestUser) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });

    if (!payment) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    if (requestUser.role !== 'SUPER_ADMIN' && payment.branchId !== requestUser.branchId) {
      return res.status(403).json({ message: 'Payment does not belong to the current branch' });
    }
    if (payment.status !== 'COMPLETED') {
      return res.status(400).json({ message: 'Only completed payments can be unreconciled' });
    }

    const updated = await runTermWriteTransaction(payment.academicTermId, 'FINANCIAL_RECEIPT', tx => (
      tx.payment.update({
        where: { id: paymentId },
        data: {
          isReconciled: false,
          reconciledAt: null,
          reconciledByUserId: null,
          reconciledByName: null,
          settlementDate: null,
          bankReference: null,
        },
      })
    ));

    res.json({
      message: 'Payment moved back to unreconciled state',
      payment: { ...updated, amount: Number(updated.amount) },
    });
  } catch (error) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
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

    // Verify the user exists (handles stale tokens)
    const voidingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!voidingUser) {
      return res.status(401).json({ message: 'Session invalid. Please log out and log in again.' });
    }

    const requestUser = (req as AuthRequest).user;
    await voidPaymentSettlement(
      paymentId,
      userId,
      reason,
      requestUser?.role === 'SUPER_ADMIN' ? null : requestUser?.branchId,
    );
    const voidedPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: {
        student: { select: { firstName: true, lastName: true, admissionNumber: true } },
        recordedBy: { select: { fullName: true } },
        voidedBy: { select: { fullName: true } },
      },
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
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof PaymentSettlementError) return sendPaymentSettlementError(res, error);
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
  academicTermId: z.string().uuid(),
  amount: z.number().positive(),
  phone: z.string().min(10).max(15),
  country: z.enum(['zm', 'mw']).default('zm'),
  operator: z.enum(['airtel', 'mtn', 'tnm']),
  notes: z.string().optional(),
  idempotencyKey: z.string().min(8).max(200).optional(),
});

// Generate unique reference for mobile money collection
const generateMobileMoneyReference = (): string => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `MM-${timestamp}-${random}`;
};

const createPendingMobileMoneyRecords = async (input: {
  reference: string;
  transactionId: string;
  studentId: string;
  academicTermId: string;
  amount: number;
  totalCharge: number;
  phone: string;
  country: 'zm' | 'mw';
  operator: 'airtel' | 'mtn' | 'tnm';
  notes?: string;
  initiatedByUserId: string | null;
  actorBranchId?: string | null;
  source: 'MOBILE_MONEY' | 'PUBLIC_MOBILE_MONEY';
  idempotencyKey?: string;
}) => runTermWriteTransaction(input.academicTermId, 'FINANCIAL_RECEIPT', async tx => {
  if (input.idempotencyKey) {
    const existingPayment = await tx.payment.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { mobileMoneyCollection: true },
    });
    if (existingPayment) {
      if (
        existingPayment.studentId !== input.studentId
        || existingPayment.academicTermId !== input.academicTermId
        || Number(existingPayment.amount) !== Number(input.amount)
        || existingPayment.method !== 'MOBILE_MONEY'
        || existingPayment.source !== input.source
        || !existingPayment.mobileMoneyCollection
        || existingPayment.mobileMoneyCollection.phone !== input.phone
        || existingPayment.mobileMoneyCollection.operator !== input.operator
      ) {
        throw new PaymentSettlementError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key is already associated with a different mobile-money request',
        );
      }
      return {
        collection: existingPayment.mobileMoneyCollection,
        pendingPayment: existingPayment,
        reused: true,
      };
    }
  }

  const student = await tx.student.findUnique({
    where: { id: input.studentId },
    select: { branchId: true },
  });
  if (!student) {
    throw new PaymentSettlementError('STUDENT_NOT_FOUND', 'Student not found', 404);
  }
  if (input.actorBranchId && student.branchId !== input.actorBranchId) {
    throw new PaymentSettlementError(
      'STUDENT_BRANCH_MISMATCH',
      'Student does not belong to the current branch',
      403,
    );
  }

  const collection = await tx.mobileMoneyCollection.create({
    data: {
      reference: input.reference,
      studentId: input.studentId,
      amount: input.totalCharge,
      phone: input.phone,
      country: input.country,
      operator: input.operator,
      initiatedByUserId: input.initiatedByUserId,
      status: 'PENDING',
      branchId: student.branchId,
    },
  });

  const pendingPayment = await tx.payment.create({
    data: {
      transactionId: input.transactionId,
      idempotencyKey: input.idempotencyKey || null,
      source: input.source,
      studentId: input.studentId,
      academicTermId: input.academicTermId,
      amount: input.amount,
      method: 'MOBILE_MONEY',
      notes: input.notes || `Mobile Money payment via ${input.operator.toUpperCase()}. Ref: ${input.reference}`,
      status: 'PENDING',
      recordedByUserId: input.initiatedByUserId,
      branchId: student.branchId,
    },
  });

  await tx.mobileMoneyCollection.update({
    where: { id: collection.id },
    data: { paymentId: pendingPayment.id },
  });

  return { collection, pendingPayment, reused: false };
});

const updateMobileMoneyCollectionForTerm = async (
  academicTermId: string,
  collectionId: string,
  data: Prisma.MobileMoneyCollectionUpdateInput,
  paymentStatus?: PaymentStatus,
) => {
  const result = await runTermWriteTransaction(
    academicTermId,
    'FINANCIAL_RECEIPT',
    async tx => {
      const ownedCollection = await tx.mobileMoneyCollection.findFirst({
        where: {
          id: collectionId,
          payment: { is: { academicTermId } },
        },
        select: {
          id: true,
          status: true,
          payment: { select: { id: true, status: true } },
        },
      });
      if (!ownedCollection || !ownedCollection.payment) {
        throw new Error('Mobile money collection is not linked to the requested academic term');
      }

      const collection = await tx.mobileMoneyCollection.update({
        where: { id: collectionId },
        data,
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
              admissionNumber: true,
            },
          },
        },
      });

      let payment = null;
      let paymentBecameCompleted = false;
      if (paymentStatus === 'COMPLETED') {
        const completion = await completePendingPaymentInTransaction(
          tx,
          ownedCollection.payment.id,
        );
        payment = completion.payment;
        paymentBecameCompleted = completion.becameCompleted;
      } else if (paymentStatus) {
        payment = await tx.payment.update({
          where: { id: ownedCollection.payment.id },
          data: { status: paymentStatus },
        });
      }

      return {
        collection,
        payment,
        paymentBecameCompleted,
      };
    },
  );

  if (result.payment && result.paymentBecameCompleted) {
    await processCompletedMobileMoneyPayment(result.payment, result.collection.reference);
  }

  return result.collection;
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

    const { studentId, academicTermId, amount, phone, country, operator, notes } = parseResult.data;
    const idempotencyKey = parseResult.data.idempotencyKey ?? req.header?.('Idempotency-Key')?.trim();
    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
      return res.status(400).json({ error: 'Idempotency key must be between 8 and 200 characters' });
    }

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

    const pending = await createPendingMobileMoneyRecords({
      reference,
      transactionId,
      studentId,
      academicTermId,
      amount,
      totalCharge,
      phone,
      country,
      operator,
      notes,
      initiatedByUserId: userId,
      actorBranchId: (req as AuthRequest).user?.role === 'SUPER_ADMIN'
        || (req as AuthRequest).user?.role === 'PARENT'
        ? null
        : (req as AuthRequest).user?.branchId,
      source: 'MOBILE_MONEY',
      idempotencyKey,
    });
    const { collection, pendingPayment } = pending;

    if (pending.reused) {
      return res.status(200).json({
        message: 'Existing mobile money payment request returned',
        collection: {
          id: collection.id,
          reference: collection.reference,
          lencoReference: collection.lencoReference,
          amount: Number(collection.amount),
          phone: collection.phone,
          operator: collection.operator,
          status: collection.status,
          payment: { id: pendingPayment.id, transactionId: pendingPayment.transactionId },
        },
        reused: true,
      });
    }

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
      await updateMobileMoneyCollectionForTerm(
        academicTermId,
        collection.id,
        {
          status: 'FAILED',
          reasonForFailure: lencoResult.error,
        },
        'FAILED',
      );

      return res.status(400).json({
        message: 'Failed to initiate mobile money collection',
        error: lencoResult.error,
      });
    }

    // Update collection with Lenco response
    const updatedCollection = await updateMobileMoneyCollectionForTerm(
      academicTermId,
      collection.id,
      {
        lencoReference: lencoResult.data?.lencoReference,
        lencoCollectionId: lencoResult.data?.id,
        status: lencoResult.data?.status === 'pay-offline' ? 'PAY_OFFLINE' : 'PENDING',
        fee: lencoResult.data?.fee ? parseFloat(lencoResult.data.fee) : null,
        accountName: lencoResult.data?.mobileMoneyDetails?.accountName,
      },
    );

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
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof PaymentSettlementError) return sendPaymentSettlementError(res, error);
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
    if (!collection.payment) {
      return res.status(409).json({ message: 'Collection is not linked to a term-owned payment' });
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
      const updatedCollection = await updateMobileMoneyCollectionForTerm(
        collection.payment.academicTermId,
        collection.id,
        {
          status: newStatus,
          completedAt: newStatus === 'SUCCESSFUL' ? new Date() : null,
          reasonForFailure: lencoResult.data?.reasonForFailure,
          operatorTransactionId: lencoResult.data?.mobileMoneyDetails?.operatorTransactionId,
          accountName: lencoResult.data?.mobileMoneyDetails?.accountName,
        },
        newStatus === 'SUCCESSFUL'
          ? 'COMPLETED'
          : newStatus === 'FAILED' ? 'FAILED' : undefined,
      );

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
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof PaymentSettlementError) return sendPaymentSettlementError(res, error);
    console.error('Check mobile money status error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Run accounting and notification side effects after a collection and its payment
 * have atomically entered the completed state.
 */
async function processCompletedMobileMoneyPayment(payment: any, collectionReference: string) {
  try {
    console.log(`Payment ${payment.transactionId} completed from collection ${collectionReference}`);

    // Create accounting journal entry for completed mobile money payment
    onPaymentCreated(payment.id).catch(err =>
      console.error('Background journal entry for mobile money failed:', err)
    );

    // Send notification to parent on successful payment
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
        payment.transactionId || collectionReference,
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
  } catch (error) {
    console.error('Error processing completed mobile money payment:', error);
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
      include: { payment: { select: { academicTermId: true } } },
    });

    if (!collection) {
      console.log(`Collection not found for reference: ${reference}`);
      return res.status(404).json({ message: 'Collection not found' });
    }
    if (!collection.payment) {
      return res.status(409).json({ message: 'Collection is not linked to a term-owned payment' });
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
    const updatedCollection = await updateMobileMoneyCollectionForTerm(
      collection.payment.academicTermId,
      collection.id,
      {
        status: newStatus,
        completedAt: newStatus === 'SUCCESSFUL' ? new Date() : null,
        reasonForFailure: reasonForFailure || null,
        operatorTransactionId: mobileMoneyDetails?.operatorTransactionId,
        accountName: mobileMoneyDetails?.accountName,
      },
      newStatus === 'SUCCESSFUL'
        ? 'COMPLETED'
        : newStatus === 'FAILED' ? 'FAILED' : undefined,
    );

    console.log(`Webhook processed for collection ${reference}: ${newStatus}`);

    // Respond to webhook
    res.status(200).json({ received: true });
  } catch (error) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof PaymentSettlementError) return sendPaymentSettlementError(res, error);
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
    const academicTermId = typeof req.query.academicTermId === 'string' ? req.query.academicTermId : undefined;

    const skip = (page - 1) * limit;
    const where: any = {};

    if (status) {
      where.status = status.toUpperCase();
    }

    if (studentId) {
      where.studentId = studentId;
    }

    if (academicTermId) {
      where.payment = { academicTermId };
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

    const academicTerm = await getActiveTerm();
    if (!academicTerm) {
      return res.status(503).json({ message: 'No active academic term is configured.' });
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
        termEnrollments: {
          where: { academicTermId: academicTerm.id },
          select: { class: { select: { name: true } } },
          take: 1,
        }
      }
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    // Public receipts use the active term for cash provenance but settle the
    // student's oldest outstanding obligations across terms.
    const [accountSettlement, currentTermSettlement] = await Promise.all([
      prisma.studentFeeStructure.aggregate({
        where: { studentId: student.id },
        _sum: { amountDue: true, amountPaid: true },
      }),
      prisma.studentFeeStructure.aggregate({
        where: { studentId: student.id, academicTermId: academicTerm.id },
        _sum: { amountDue: true, amountPaid: true },
      }),
    ]);

    const balance = Math.max(
      0,
      Number(accountSettlement._sum.amountDue || 0) - Number(accountSettlement._sum.amountPaid || 0),
    );
    const currentTermBalance = Math.max(
      0,
      Number(currentTermSettlement._sum.amountDue || 0) - Number(currentTermSettlement._sum.amountPaid || 0),
    );

    res.json({
      ...student,
      class: student.termEnrollments[0]?.class ?? null,
      termEnrollments: undefined,
      balance,
      currentTermBalance,
      academicTerm,
    });
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

    const { studentId, academicTermId, amount, phone, country, operator, notes } = parseResult.data;
    const idempotencyKey = parseResult.data.idempotencyKey ?? req.header?.('Idempotency-Key')?.trim();
    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
      return res.status(400).json({ error: 'Idempotency key must be between 8 and 200 characters' });
    }

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

    const pending = await createPendingMobileMoneyRecords({
      reference,
      transactionId,
      studentId,
      academicTermId,
      amount,
      totalCharge,
      phone,
      country,
      operator,
      notes,
      initiatedByUserId: null,
      source: 'PUBLIC_MOBILE_MONEY',
      idempotencyKey,
    });
    const { collection, pendingPayment } = pending;

    if (pending.reused) {
      return res.status(200).json({
        message: 'Existing mobile money payment request returned',
        collection: {
          id: collection.id,
          reference: collection.reference,
          amount: Number(collection.amount),
          phone: collection.phone,
          operator: collection.operator,
          status: collection.status,
          payment: { id: pendingPayment.id, transactionId: pendingPayment.transactionId },
        },
        reused: true,
      });
    }

    const lencoResult = await initiateMobileMoneyCollection({
      amount: totalCharge,
      phone,
      country: country as 'zm' | 'mw',
      operator: operator as 'airtel' | 'mtn' | 'tnm',
      reference,
    });

    if (!lencoResult.success) {
      await updateMobileMoneyCollectionForTerm(
        academicTermId,
        collection.id,
        {
          status: 'FAILED',
          reasonForFailure: lencoResult.error,
        },
        'FAILED',
      );

      return res.status(400).json({
        message: 'Failed to initiate mobile money collection',
        error: lencoResult.error,
      });
    }

    const updatedCollection = await updateMobileMoneyCollectionForTerm(
      academicTermId,
      collection.id,
      {
        lencoReference: lencoResult.data?.lencoReference,
        lencoCollectionId: lencoResult.data?.id,
        status: lencoResult.data?.status === 'pay-offline' ? 'PAY_OFFLINE' : 'PENDING',
        fee: lencoResult.data?.fee ? parseFloat(lencoResult.data.fee) : null,
        accountName: lencoResult.data?.mobileMoneyDetails?.accountName,
      },
    );

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
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    if (error instanceof PaymentSettlementError) return sendPaymentSettlementError(res, error);
    console.error('Public Initiate Payment Error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
