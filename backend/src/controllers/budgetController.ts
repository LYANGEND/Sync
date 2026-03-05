import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

// ========================================
// BUDGET MANAGEMENT
// ========================================

const budgetSchema = z.object({
  name: z.string().min(3),
  period: z.enum(['term', 'annual', 'quarterly']),
  year: z.number().int().min(2020),
  termId: z.string().uuid().optional(),
  startDate: z.string().transform(s => new Date(s)),
  endDate: z.string().transform(s => new Date(s)),
  notes: z.string().optional(),
  items: z.array(z.object({
    category: z.enum([
      'SALARIES', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT',
      'FOOD_CATERING', 'RENT', 'INSURANCE', 'MARKETING', 'TECHNOLOGY',
      'PROFESSIONAL_FEES', 'BANK_CHARGES', 'TAXES', 'DEPRECIATION', 'MISCELLANEOUS',
    ]),
    description: z.string().optional(),
    allocated: z.number().positive(),
  })).min(1),
});

export const getBudgets = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const budgets = await prisma.budget.findMany({
      where: branchFilter,
      include: { items: true, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(budgets.map(b => ({
      ...b,
      totalBudget: Number(b.totalBudget),
      totalSpent: Number(b.totalSpent),
      items: b.items.map(item => ({
        ...item,
        allocated: Number(item.allocated),
        spent: Number(item.spent),
        remaining: Number(item.remaining),
      })),
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch budgets' });
  }
};

export const getBudgetById = async (req: Request, res: Response) => {
  try {
    const budget = await prisma.budget.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    });
    if (!budget) return res.status(404).json({ error: 'Budget not found' });

    // Get actual expenses for budget period by category
    const expenses = await prisma.expense.groupBy({
      by: ['category'],
      where: {
        status: 'PAID',
        date: { gte: budget.startDate, lte: budget.endDate },
        branchId: budget.branchId,
      },
      _sum: { totalAmount: true },
    });

    const expenseMap = new Map(expenses.map(e => [e.category, Number(e._sum.totalAmount || 0)]));

    const itemsWithActuals = budget.items.map(item => ({
      ...item,
      allocated: Number(item.allocated),
      spent: expenseMap.get(item.category) || Number(item.spent),
      remaining: Number(item.allocated) - (expenseMap.get(item.category) || Number(item.spent)),
      percentUsed: ((expenseMap.get(item.category) || Number(item.spent)) / Number(item.allocated) * 100).toFixed(1),
    }));

    res.json({
      ...budget,
      totalBudget: Number(budget.totalBudget),
      totalSpent: itemsWithActuals.reduce((sum, i) => sum + i.spent, 0),
      items: itemsWithActuals,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch budget' });
  }
};

export const createBudget = async (req: Request, res: Response) => {
  try {
    const data = budgetSchema.parse(req.body);
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const totalBudget = data.items.reduce((sum, item) => sum + item.allocated, 0);

    const budget = await prisma.budget.create({
      data: {
        name: data.name,
        period: data.period,
        year: data.year,
        termId: data.termId,
        startDate: data.startDate,
        endDate: data.endDate,
        totalBudget,
        notes: data.notes,
        createdBy: user.userId,
        branchId: user.branchId,
        status: 'DRAFT',
        items: {
          create: data.items.map(item => ({
            category: item.category,
            description: item.description,
            allocated: item.allocated,
            remaining: item.allocated,
          })),
        },
      },
      include: { items: true },
    });

    res.status(201).json(budget);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    console.error('Create budget error:', error);
    res.status(500).json({ error: 'Failed to create budget' });
  }
};

export const updateBudget = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.budget.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Budget not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only edit draft budgets' });
    }

    const data = budgetSchema.partial().parse(req.body);
    const user = (req as AuthRequest).user;

    if (data.items) {
      // Delete old items and create new ones
      await prisma.budgetItem.deleteMany({ where: { budgetId: req.params.id } });
      const totalBudget = data.items.reduce((sum, item) => sum + item.allocated, 0);

      const budget = await prisma.budget.update({
        where: { id: req.params.id },
        data: {
          name: data.name,
          period: data.period,
          year: data.year,
          startDate: data.startDate,
          endDate: data.endDate,
          totalBudget,
          notes: data.notes,
          items: {
            create: data.items.map(item => ({
              category: item.category,
              description: item.description,
              allocated: item.allocated,
              remaining: item.allocated,
            })),
          },
        },
        include: { items: true },
      });
      return res.json(budget);
    }

    const budget = await prisma.budget.update({
      where: { id: req.params.id },
      data: { name: data.name, period: data.period, year: data.year, notes: data.notes },
      include: { items: true },
    });

    res.json(budget);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors });
    res.status(500).json({ error: 'Failed to update budget' });
  }
};

export const activateBudget = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const budget = await prisma.budget.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE', approvedBy: user.userId, approvedAt: new Date() },
    });
    res.json(budget);
  } catch (error) {
    res.status(500).json({ error: 'Failed to activate budget' });
  }
};

export const closeBudget = async (req: Request, res: Response) => {
  try {
    const budget = await prisma.budget.update({
      where: { id: req.params.id },
      data: { status: 'CLOSED' },
    });
    res.json(budget);
  } catch (error) {
    res.status(500).json({ error: 'Failed to close budget' });
  }
};

export const deleteBudget = async (req: Request, res: Response) => {
  try {
    const existing = await prisma.budget.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Budget not found' });
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Can only delete draft budgets' });
    }

    await prisma.budgetItem.deleteMany({ where: { budgetId: req.params.id } });
    await prisma.budget.delete({ where: { id: req.params.id } });

    res.json({ message: 'Budget deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete budget' });
  }
};

export const getBudgetVsActual = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    const branchFilter = user?.role === 'SUPER_ADMIN' ? {} : { branchId: user?.branchId };

    const activeBudgets = await prisma.budget.findMany({
      where: { status: 'ACTIVE', ...branchFilter },
      include: { items: true },
    });

    const results = await Promise.all(activeBudgets.map(async (budget) => {
      const expenses = await prisma.expense.groupBy({
        by: ['category'],
        where: {
          status: 'PAID',
          date: { gte: budget.startDate, lte: budget.endDate },
          branchId: budget.branchId,
        },
        _sum: { totalAmount: true },
      });

      const expenseMap = new Map(expenses.map(e => [e.category, Number(e._sum.totalAmount || 0)]));

      return {
        id: budget.id,
        name: budget.name,
        period: budget.period,
        totalBudget: Number(budget.totalBudget),
        items: budget.items.map(item => ({
          category: item.category,
          budgeted: Number(item.allocated),
          actual: expenseMap.get(item.category) || 0,
          variance: Number(item.allocated) - (expenseMap.get(item.category) || 0),
          percentUsed: (((expenseMap.get(item.category) || 0) / Number(item.allocated)) * 100).toFixed(1),
        })),
      };
    }));

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get budget vs actual' });
  }
};
