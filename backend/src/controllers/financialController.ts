import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/authMiddleware';
import {
  getTrialBalance,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlowSummary,
  getAgedReceivables,
} from '../services/accountingService';

const prisma = new PrismaClient();

// ========================================
// FINANCIAL STATEMENTS
// ========================================

export const trialBalance = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const user = (req as AuthRequest).user;
    const branchId = user?.role === 'SUPER_ADMIN' ? undefined : user?.branchId;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    const result = await getTrialBalance(start, end, branchId);
    res.json({ period: { startDate: start, endDate: end }, entries: result });
  } catch (error) {
    console.error('Trial balance error:', error);
    res.status(500).json({ error: 'Failed to generate trial balance' });
  }
};

export const incomeStatement = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const user = (req as AuthRequest).user;
    const branchId = user?.role === 'SUPER_ADMIN' ? undefined : user?.branchId;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    const result = await getIncomeStatement(start, end, branchId);
    res.json(result);
  } catch (error) {
    console.error('Income statement error:', error);
    res.status(500).json({ error: 'Failed to generate income statement' });
  }
};

export const balanceSheet = async (req: Request, res: Response) => {
  try {
    const { asOfDate } = req.query;
    const user = (req as AuthRequest).user;
    const branchId = user?.role === 'SUPER_ADMIN' ? undefined : user?.branchId;

    const date = asOfDate ? new Date(asOfDate as string) : new Date();

    const result = await getBalanceSheet(date, branchId);
    res.json(result);
  } catch (error) {
    console.error('Balance sheet error:', error);
    res.status(500).json({ error: 'Failed to generate balance sheet' });
  }
};

export const cashFlowStatement = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const user = (req as AuthRequest).user;
    const branchId = user?.role === 'SUPER_ADMIN' ? undefined : user?.branchId;

    const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate as string) : new Date();

    const result = await getCashFlowSummary(start, end, branchId);
    res.json(result);
  } catch (error) {
    console.error('Cash flow error:', error);
    res.status(500).json({ error: 'Failed to generate cash flow statement' });
  }
};

export const agedReceivables = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchId = user?.role === 'SUPER_ADMIN' ? undefined : user?.branchId;

    const result = await getAgedReceivables(branchId);
    res.json(result);
  } catch (error) {
    console.error('Aged receivables error:', error);
    res.status(500).json({ error: 'Failed to generate aged receivables' });
  }
};

// ========================================
// CHART OF ACCOUNTS
// ========================================

export const getChartOfAccounts = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const accounts = await prisma.chartOfAccount.findMany({
      where: { ...branchFilter, isActive: true },
      include: { children: true, parent: { select: { name: true, code: true } } },
      orderBy: { code: 'asc' },
    });
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch chart of accounts' });
  }
};

export const createAccount = async (req: Request, res: Response) => {
  try {
    const { code, name, type, parentId, description } = req.body;
    const user = (req as AuthRequest).user;

    const account = await prisma.chartOfAccount.create({
      data: { code, name, type, parentId, description, branchId: user?.branchId },
    });
    res.status(201).json(account);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Account code already exists' });
    res.status(500).json({ error: 'Failed to create account' });
  }
};

export const seedDefaultAccounts = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchId = user?.branchId || null;

    const defaults = [
      // Assets
      { code: '1000', name: 'Cash at Bank', type: 'ASSET' as const },
      { code: '1100', name: 'Petty Cash', type: 'ASSET' as const },
      { code: '1200', name: 'Accounts Receivable (Fees)', type: 'ASSET' as const },
      { code: '1300', name: 'Prepaid Expenses', type: 'ASSET' as const },
      { code: '1500', name: 'Fixed Assets', type: 'ASSET' as const },
      // Liabilities
      { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' as const },
      { code: '2100', name: 'PAYE Tax Payable', type: 'LIABILITY' as const },
      { code: '2200', name: 'NAPSA Payable', type: 'LIABILITY' as const },
      { code: '2300', name: 'NHIMA Payable', type: 'LIABILITY' as const },
      { code: '2400', name: 'Advance Fees Received', type: 'LIABILITY' as const },
      // Equity
      { code: '3000', name: 'Owner\'s Equity', type: 'EQUITY' as const },
      { code: '3100', name: 'Retained Earnings', type: 'EQUITY' as const },
      // Income
      { code: '4000', name: 'Tuition Revenue', type: 'INCOME' as const },
      { code: '4100', name: 'Registration Fees', type: 'INCOME' as const },
      { code: '4200', name: 'Transport Revenue', type: 'INCOME' as const },
      { code: '4300', name: 'Boarding Revenue', type: 'INCOME' as const },
      { code: '4400', name: 'Lab & Equipment Fees', type: 'INCOME' as const },
      { code: '4500', name: 'Uniform Revenue', type: 'INCOME' as const },
      { code: '4900', name: 'Other Income', type: 'INCOME' as const },
      // Expenses
      { code: '5000', name: 'Salaries & Wages', type: 'EXPENSE' as const },
      { code: '5100', name: 'Utilities', type: 'EXPENSE' as const },
      { code: '5200', name: 'Teaching Supplies', type: 'EXPENSE' as const },
      { code: '5300', name: 'Maintenance & Repairs', type: 'EXPENSE' as const },
      { code: '5400', name: 'Transport Costs', type: 'EXPENSE' as const },
      { code: '5500', name: 'Food & Catering', type: 'EXPENSE' as const },
      { code: '5600', name: 'Rent & Rates', type: 'EXPENSE' as const },
      { code: '5700', name: 'Insurance', type: 'EXPENSE' as const },
      { code: '5800', name: 'Marketing & Advertising', type: 'EXPENSE' as const },
      { code: '5900', name: 'Technology & IT', type: 'EXPENSE' as const },
      { code: '6000', name: 'Professional Fees', type: 'EXPENSE' as const },
      { code: '6100', name: 'Bank Charges', type: 'EXPENSE' as const },
      { code: '6200', name: 'Taxes & Levies', type: 'EXPENSE' as const },
      { code: '6300', name: 'Depreciation', type: 'EXPENSE' as const },
      { code: '6900', name: 'Miscellaneous Expenses', type: 'EXPENSE' as const },
    ];

    let created = 0;
    for (const account of defaults) {
      try {
        await prisma.chartOfAccount.create({
          data: { ...account, isSystem: true, branchId },
        });
        created++;
      } catch (e) {
        // Skip if already exists
      }
    }

    res.json({ message: `Seeded ${created} default accounts`, total: defaults.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to seed accounts' });
  }
};

// ========================================
// REFUND MANAGEMENT
// ========================================

export const getRefunds = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const refunds = await prisma.refund.findMany({
      where: branchFilter,
      include: {
        payment: {
          include: {
            student: { select: { firstName: true, lastName: true, admissionNumber: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(refunds.map(r => ({ ...r, amount: Number(r.amount) })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch refunds' });
  }
};

export const createRefund = async (req: Request, res: Response) => {
  try {
    const { paymentId, amount, reason, method } = req.body;
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { student: true },
    });
    if (!payment) return res.status(404).json({ error: 'Payment not found' });
    if (amount > Number(payment.amount)) {
      return res.status(400).json({ error: 'Refund amount exceeds payment amount' });
    }

    const refundNumber = await (await import('../services/accountingService')).generateSequenceNumber('REF', user.branchId);

    const refund = await prisma.refund.create({
      data: {
        refundNumber,
        paymentId,
        studentId: payment.studentId,
        amount,
        reason,
        method,
        requestedBy: user.userId,
        branchId: user.branchId || payment.branchId,
      },
    });

    res.status(201).json(refund);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create refund' });
  }
};

export const approveRefund = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const refund = await prisma.refund.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', approvedBy: user.userId, approvedAt: new Date() },
    });
    res.json(refund);
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve refund' });
  }
};

export const processRefund = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const refund = await prisma.refund.findUnique({ where: { id: req.params.id } });
    if (!refund) return res.status(404).json({ error: 'Refund not found' });
    if (refund.status !== 'APPROVED') return res.status(400).json({ error: 'Refund must be approved first' });

    const updated = await prisma.refund.update({
      where: { id: req.params.id },
      data: { status: 'PROCESSED', processedBy: user.userId, processedAt: new Date() },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to process refund' });
  }
};

// ========================================
// FINANCIAL AUDIT LOG
// ========================================

export const getFinancialAuditLog = async (req: Request, res: Response) => {
  try {
    const { entityType, action, startDate, endDate, page = '1', limit = '50' } = req.query;

    const where: any = {};
    if (entityType) where.entityType = entityType;
    if (action) where.action = action;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      prisma.financialAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.financialAuditLog.count({ where }),
    ]);

    // Enrich with user names
    const userIds = [...new Set(logs.map(l => l.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const userMap = new Map(users.map(u => [u.id, u.fullName]));

    res.json({
      logs: logs.map(l => ({
        ...l,
        amount: l.amount ? Number(l.amount) : null,
        userName: userMap.get(l.userId) || 'System',
      })),
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
};

// Fee Categories
export const getFeeCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.feeCategory.findMany({
      where: { isActive: true },
      include: { children: true, parent: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch fee categories' });
  }
};

export const createFeeCategory = async (req: Request, res: Response) => {
  try {
    const { name, code, description, parentId } = req.body;
    const category = await prisma.feeCategory.create({
      data: { name, code, description, parentId },
    });
    res.status(201).json(category);
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'Category code already exists' });
    res.status(500).json({ error: 'Failed to create fee category' });
  }
};
