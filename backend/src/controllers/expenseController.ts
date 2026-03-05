import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';
import { generateSequenceNumber, logFinancialAction } from '../services/accountingService';
import { onExpensePaid } from '../services/accountingBridge';

const prisma = new PrismaClient();

// ========================================
// VENDOR MANAGEMENT
// ========================================

const vendorSchema = z.object({
  name: z.string().min(2),
  contactName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  bankBranch: z.string().optional(),
  notes: z.string().optional(),
});

export const getVendors = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const vendors = await prisma.vendor.findMany({
      where: { ...branchFilter, isActive: true },
      include: { _count: { select: { expenses: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vendors' });
  }
};

export const createVendor = async (req: Request, res: Response) => {
  try {
    const data = vendorSchema.parse(req.body);
    const user = (req as AuthRequest).user;

    const vendor = await prisma.vendor.create({
      data: { ...data, branchId: user?.branchId },
    });

    res.status(201).json(vendor);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to create vendor' });
  }
};

export const updateVendor = async (req: Request, res: Response) => {
  try {
    const data = vendorSchema.partial().parse(req.body);
    const vendor = await prisma.vendor.update({
      where: { id: req.params.id },
      data,
    });
    res.json(vendor);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to update vendor' });
  }
};

export const deleteVendor = async (req: Request, res: Response) => {
  try {
    // Soft delete
    await prisma.vendor.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ message: 'Vendor deactivated' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete vendor' });
  }
};

// ========================================
// EXPENSE MANAGEMENT
// ========================================

const expenseSchema = z.object({
  date: z.string().transform(s => new Date(s)),
  category: z.enum([
    'SALARIES', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT',
    'FOOD_CATERING', 'RENT', 'INSURANCE', 'MARKETING', 'TECHNOLOGY',
    'PROFESSIONAL_FEES', 'BANK_CHARGES', 'TAXES', 'DEPRECIATION', 'MISCELLANEOUS',
  ]),
  description: z.string().min(3),
  amount: z.number().positive(),
  taxAmount: z.number().min(0).default(0),
  vendorId: z.string().uuid().optional(),
  paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']).optional(),
  paymentRef: z.string().optional(),
  notes: z.string().optional(),
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.string().optional(),
});

export const getExpenses = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const { status, category, startDate, endDate, page = '1', limit = '20' } = req.query;

    const where: any = { ...branchFilter };
    if (status) where.status = status;
    if (category) where.category = category;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: { vendor: true },
        orderBy: { date: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.expense.count({ where }),
    ]);

    res.json({ expenses, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
};

export const getExpenseById = async (req: Request, res: Response) => {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: { vendor: true },
    });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch expense' });
  }
};

export const createExpense = async (req: Request, res: Response) => {
  try {
    const data = expenseSchema.parse(req.body);
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const expenseNumber = await generateSequenceNumber('EXP', user.branchId);
    const totalAmount = data.amount + data.taxAmount;

    const expense = await prisma.expense.create({
      data: {
        expenseNumber,
        date: data.date,
        category: data.category,
        description: data.description,
        amount: data.amount,
        taxAmount: data.taxAmount,
        totalAmount,
        vendorId: data.vendorId,
        paymentMethod: data.paymentMethod,
        paymentRef: data.paymentRef,
        notes: data.notes,
        isRecurring: data.isRecurring,
        recurringFrequency: data.recurringFrequency,
        requestedBy: user.userId,
        branchId: user.branchId,
        status: 'PENDING_APPROVAL',
      },
      include: { vendor: true },
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      description: `Created expense ${expenseNumber}: ${data.description}`,
      amount: totalAmount,
      branchId: user.branchId,
    });

    res.status(201).json(expense);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Create expense error:', error);
    res.status(500).json({ error: 'Failed to create expense' });
  }
};

export const updateExpense = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Expense not found' });
    if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({ error: 'Can only edit draft or pending expenses' });
    }

    const data = expenseSchema.partial().parse(req.body);
    const amount = data.amount ?? Number(existing.amount);
    const taxAmount = data.taxAmount ?? Number(existing.taxAmount);

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        ...data,
        totalAmount: amount + taxAmount,
      },
      include: { vendor: true },
    });

    res.json(expense);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to update expense' });
  }
};

export const approveExpense = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Expense not found' });
    if (existing.status !== 'PENDING_APPROVAL') {
      return res.status(400).json({ error: 'Expense is not pending approval' });
    }

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        approvedBy: user.userId,
        approvedAt: new Date(),
      },
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'EXPENSE_APPROVED',
      entityType: 'Expense',
      entityId: expense.id,
      description: `Approved expense ${expense.expenseNumber}`,
      amount: Number(expense.totalAmount),
      branchId: user.branchId,
    });

    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Failed to approve expense' });
  }
};

export const rejectExpense = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { reason } = z.object({ reason: z.string().min(3) }).parse(req.body);

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        rejectedBy: user.userId,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'EXPENSE_REJECTED',
      entityType: 'Expense',
      entityId: expense.id,
      description: `Rejected expense ${expense.expenseNumber}: ${reason}`,
      amount: Number(expense.totalAmount),
      branchId: user.branchId,
    });

    res.json(expense);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to reject expense' });
  }
};

export const markExpensePaid = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { paymentMethod, paymentRef } = z.object({
      paymentMethod: z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']),
      paymentRef: z.string().optional(),
    }).parse(req.body);

    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Expense not found' });
    if (existing.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Can only pay approved expenses' });
    }

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: { status: 'PAID', paymentMethod, paymentRef },
    });

    await logFinancialAction({
      userId: user.userId,
      action: 'EXPENSE_PAID',
      entityType: 'Expense',
      entityId: expense.id,
      description: `Paid expense ${expense.expenseNumber} via ${paymentMethod}`,
      amount: Number(expense.totalAmount),
      branchId: user.branchId,
    });

    // Create accounting journal entry
    onExpensePaid(expense.id, user.userId).catch(err =>
      console.error('Background expense journal creation failed:', err)
    );

    res.json(expense);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to mark expense as paid' });
  }
};

export const getExpenseSummary = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const { startDate, endDate } = req.query;
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate as string);
    if (endDate) dateFilter.lte = new Date(endDate as string);

    const where: any = { ...branchFilter, status: 'PAID' };
    if (Object.keys(dateFilter).length) where.date = dateFilter;

    // Total by category
    const byCategory = await prisma.expense.groupBy({
      by: ['category'],
      where,
      _sum: { totalAmount: true },
      _count: true,
    });

    // Monthly trend
    const expenses = await prisma.expense.findMany({
      where,
      select: { date: true, totalAmount: true },
      orderBy: { date: 'asc' },
    });

    const monthlyTrend = expenses.reduce((acc: any, exp) => {
      const month = `${exp.date.getFullYear()}-${String(exp.date.getMonth() + 1).padStart(2, '0')}`;
      acc[month] = (acc[month] || 0) + Number(exp.totalAmount);
      return acc;
    }, {});

    // Pending approval count
    const pendingCount = await prisma.expense.count({
      where: { ...branchFilter, status: 'PENDING_APPROVAL' },
    });

    // Total paid this month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const thisMonthTotal = await prisma.expense.aggregate({
      where: { ...branchFilter, status: 'PAID', date: { gte: monthStart } },
      _sum: { totalAmount: true },
    });

    res.json({
      byCategory: byCategory.map(c => ({
        category: c.category,
        total: Number(c._sum.totalAmount),
        count: c._count,
      })),
      monthlyTrend: Object.entries(monthlyTrend).map(([month, total]) => ({ month, total })),
      pendingApproval: pendingCount,
      thisMonthTotal: Number(thisMonthTotal._sum.totalAmount || 0),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get expense summary' });
  }
};

export const deleteExpense = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Expense not found' });
    if (existing.status === 'PAID') {
      return res.status(400).json({ error: 'Cannot delete a paid expense' });
    }

    await prisma.expense.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });

    res.json({ message: 'Expense cancelled' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete expense' });
  }
};
