import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { logFinancialAction } from '../services/accountingService';
import { onPettyCashTransaction } from '../services/accountingBridge';

const prisma = new PrismaClient();

// ========================================
// PETTY CASH MANAGEMENT
// ========================================

export const getPettyCashAccounts = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const accounts = await prisma.pettyCashAccount.findMany({
      where: { ...branchFilter, isActive: true },
      include: { _count: { select: { transactions: true } } },
    });

    res.json(accounts.map(a => ({
      ...a,
      floatAmount: Number(a.floatAmount),
      balance: Number(a.balance),
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch petty cash accounts' });
  }
};

export const createPettyCashAccount = async (req: Request, res: Response) => {
  try {
    const { name, floatAmount, custodianId } = z.object({
      name: z.string().min(2),
      floatAmount: z.number().positive(),
      custodianId: z.string().uuid(),
    }).parse(req.body);
    const user = (req as AuthRequest).user;

    const account = await prisma.pettyCashAccount.create({
      data: {
        name,
        floatAmount,
        balance: floatAmount,
        custodianId,
        branchId: user?.branchId,
      },
    });

    res.status(201).json({ ...account, floatAmount: Number(account.floatAmount), balance: Number(account.balance) });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to create petty cash account' });
  }
};

export const getPettyCashTransactions = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { startDate, endDate, page = '1', limit = '20' } = req.query;

    const where: any = { accountId };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [transactions, total] = await Promise.all([
      prisma.pettyCashTransaction.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.pettyCashTransaction.count({ where }),
    ]);

    // Enrich with user names
    const userIds = [...new Set(transactions.map(t => t.recordedBy))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const userMap = new Map(users.map(u => [u.id, u.fullName]));

    res.json({
      transactions: transactions.map(t => ({
        ...t,
        amount: Number(t.amount),
        recordedByName: userMap.get(t.recordedBy) || 'Unknown',
      })),
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

export const createPettyCashTransaction = async (req: Request, res: Response) => {
  try {
    const data = z.object({
      accountId: z.string().uuid(),
      type: z.enum(['DISBURSEMENT', 'REPLENISHMENT']),
      amount: z.number().positive(),
      description: z.string().min(3),
      category: z.enum([
        'SALARIES', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT',
        'FOOD_CATERING', 'RENT', 'INSURANCE', 'MARKETING', 'TECHNOLOGY',
        'PROFESSIONAL_FEES', 'BANK_CHARGES', 'TAXES', 'DEPRECIATION', 'MISCELLANEOUS',
      ]).optional(),
    }).parse(req.body);

    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const account = await prisma.pettyCashAccount.findUnique({ where: { id: data.accountId } });
    if (!account) return res.status(404).json({ error: 'Petty cash account not found' });

    if (data.type === 'DISBURSEMENT' && Number(account.balance) < data.amount) {
      return res.status(400).json({ error: 'Insufficient petty cash balance' });
    }

    const newBalance = data.type === 'DISBURSEMENT'
      ? Number(account.balance) - data.amount
      : Number(account.balance) + data.amount;

    const [transaction] = await prisma.$transaction([
      prisma.pettyCashTransaction.create({
        data: {
          accountId: data.accountId,
          type: data.type,
          amount: data.amount,
          description: data.description,
          category: data.category,
          recordedBy: user.userId,
        },
      }),
      prisma.pettyCashAccount.update({
        where: { id: data.accountId },
        data: { balance: newBalance },
      }),
    ]);

    await logFinancialAction({
      userId: user.userId,
      action: `PETTY_CASH_${data.type}`,
      entityType: 'PettyCash',
      entityId: transaction.id,
      description: `${data.type}: ${data.description}`,
      amount: data.amount,
      branchId: user.branchId,
    });

    // Create accounting journal entry
    onPettyCashTransaction(transaction.id, user.userId).catch(err =>
      console.error('Background petty cash journal creation failed:', err)
    );

    res.status(201).json({ ...transaction, amount: Number(transaction.amount), newBalance });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Create petty cash transaction error:', error);
    res.status(500).json({ error: 'Failed to create transaction' });
  }
};

export const getPettyCashSummary = async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;

    const account = await prisma.pettyCashAccount.findUnique({ where: { id: accountId } });
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [disbursements, replenishments, byCategory] = await Promise.all([
      prisma.pettyCashTransaction.aggregate({
        where: { accountId, type: 'DISBURSEMENT', date: { gte: monthStart } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.pettyCashTransaction.aggregate({
        where: { accountId, type: 'REPLENISHMENT', date: { gte: monthStart } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.pettyCashTransaction.groupBy({
        by: ['category'],
        where: { accountId, type: 'DISBURSEMENT', date: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      floatAmount: Number(account.floatAmount),
      currentBalance: Number(account.balance),
      monthlyDisbursements: Number(disbursements._sum.amount || 0),
      monthlyReplenishments: Number(replenishments._sum.amount || 0),
      disbursementCount: disbursements._count,
      byCategory: byCategory.map(c => ({
        category: c.category || 'UNCATEGORIZED',
        total: Number(c._sum.amount || 0),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get petty cash summary' });
  }
};
