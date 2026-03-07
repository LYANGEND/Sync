"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBudgetVsActual = exports.deleteBudget = exports.closeBudget = exports.activateBudget = exports.updateBudget = exports.createBudget = exports.getBudgetById = exports.getBudgets = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
// ========================================
// BUDGET MANAGEMENT
// ========================================
const budgetSchema = zod_1.z.object({
    name: zod_1.z.string().min(3),
    period: zod_1.z.enum(['term', 'annual', 'quarterly']),
    year: zod_1.z.number().int().min(2020),
    termId: zod_1.z.string().uuid().optional(),
    startDate: zod_1.z.string().transform(s => new Date(s)),
    endDate: zod_1.z.string().transform(s => new Date(s)),
    notes: zod_1.z.string().optional(),
    items: zod_1.z.array(zod_1.z.object({
        category: zod_1.z.enum([
            'SALARIES', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT',
            'FOOD_CATERING', 'RENT', 'INSURANCE', 'MARKETING', 'TECHNOLOGY',
            'PROFESSIONAL_FEES', 'BANK_CHARGES', 'TAXES', 'DEPRECIATION', 'MISCELLANEOUS',
        ]),
        description: zod_1.z.string().optional(),
        allocated: zod_1.z.number().positive(),
    })).min(1),
});
const getBudgets = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const budgets = yield prisma_1.prisma.budget.findMany({
            where: branchFilter,
            include: { items: true, _count: { select: { items: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(budgets.map(b => (Object.assign(Object.assign({}, b), { totalBudget: Number(b.totalBudget), totalSpent: Number(b.totalSpent), items: b.items.map(item => (Object.assign(Object.assign({}, item), { allocated: Number(item.allocated), spent: Number(item.spent), remaining: Number(item.remaining) }))) }))));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch budgets' });
    }
});
exports.getBudgets = getBudgets;
const getBudgetById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const budget = yield prisma_1.prisma.budget.findUnique({
            where: { id: req.params.id },
            include: { items: true },
        });
        if (!budget)
            return res.status(404).json({ error: 'Budget not found' });
        // Get actual expenses for budget period by category
        const expenses = yield prisma_1.prisma.expense.groupBy({
            by: ['category'],
            where: {
                status: 'PAID',
                date: { gte: budget.startDate, lte: budget.endDate },
                branchId: budget.branchId,
            },
            _sum: { totalAmount: true },
        });
        const expenseMap = new Map(expenses.map(e => [e.category, Number(e._sum.totalAmount || 0)]));
        const itemsWithActuals = budget.items.map(item => (Object.assign(Object.assign({}, item), { allocated: Number(item.allocated), spent: expenseMap.get(item.category) || Number(item.spent), remaining: Number(item.allocated) - (expenseMap.get(item.category) || Number(item.spent)), percentUsed: ((expenseMap.get(item.category) || Number(item.spent)) / Number(item.allocated) * 100).toFixed(1) })));
        res.json(Object.assign(Object.assign({}, budget), { totalBudget: Number(budget.totalBudget), totalSpent: itemsWithActuals.reduce((sum, i) => sum + i.spent, 0), items: itemsWithActuals }));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch budget' });
    }
});
exports.getBudgetById = getBudgetById;
const createBudget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = budgetSchema.parse(req.body);
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const totalBudget = data.items.reduce((sum, item) => sum + item.allocated, 0);
        const budget = yield prisma_1.prisma.budget.create({
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        console.error('Create budget error:', error);
        res.status(500).json({ error: 'Failed to create budget' });
    }
});
exports.createBudget = createBudget;
const updateBudget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const existing = yield prisma_1.prisma.budget.findUnique({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Budget not found' });
        if (existing.status !== 'DRAFT') {
            return res.status(400).json({ error: 'Can only edit draft budgets' });
        }
        const data = budgetSchema.partial().parse(req.body);
        const user = req.user;
        if (data.items) {
            // Delete old items and create new ones
            yield prisma_1.prisma.budgetItem.deleteMany({ where: { budgetId: req.params.id } });
            const totalBudget = data.items.reduce((sum, item) => sum + item.allocated, 0);
            const budget = yield prisma_1.prisma.budget.update({
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
        const budget = yield prisma_1.prisma.budget.update({
            where: { id: req.params.id },
            data: { name: data.name, period: data.period, year: data.year, notes: data.notes },
            include: { items: true },
        });
        res.json(budget);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to update budget' });
    }
});
exports.updateBudget = updateBudget;
const activateBudget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const budget = yield prisma_1.prisma.budget.update({
            where: { id: req.params.id },
            data: { status: 'ACTIVE', approvedBy: user.userId, approvedAt: new Date() },
        });
        res.json(budget);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to activate budget' });
    }
});
exports.activateBudget = activateBudget;
const closeBudget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const budget = yield prisma_1.prisma.budget.update({
            where: { id: req.params.id },
            data: { status: 'CLOSED' },
        });
        res.json(budget);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to close budget' });
    }
});
exports.closeBudget = closeBudget;
const deleteBudget = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const existing = yield prisma_1.prisma.budget.findUnique({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Budget not found' });
        if (existing.status !== 'DRAFT') {
            return res.status(400).json({ error: 'Can only delete draft budgets' });
        }
        yield prisma_1.prisma.budgetItem.deleteMany({ where: { budgetId: req.params.id } });
        yield prisma_1.prisma.budget.delete({ where: { id: req.params.id } });
        res.json({ message: 'Budget deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete budget' });
    }
});
exports.deleteBudget = deleteBudget;
const getBudgetVsActual = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const activeBudgets = yield prisma_1.prisma.budget.findMany({
            where: Object.assign({ status: 'ACTIVE' }, branchFilter),
            include: { items: true },
        });
        const results = yield Promise.all(activeBudgets.map((budget) => __awaiter(void 0, void 0, void 0, function* () {
            const expenses = yield prisma_1.prisma.expense.groupBy({
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
        })));
        res.json(results);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to get budget vs actual' });
    }
});
exports.getBudgetVsActual = getBudgetVsActual;
