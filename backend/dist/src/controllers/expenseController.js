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
exports.deleteExpense = exports.getExpenseSummary = exports.markExpensePaid = exports.rejectExpense = exports.approveExpense = exports.updateExpense = exports.createExpense = exports.getExpenseById = exports.getExpenses = exports.deleteVendor = exports.updateVendor = exports.createVendor = exports.getVendors = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
const accountingService_1 = require("../services/accountingService");
const accountingBridge_1 = require("../services/accountingBridge");
// ========================================
// VENDOR MANAGEMENT
// ========================================
const vendorSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    contactName: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().optional(),
    address: zod_1.z.string().optional(),
    taxId: zod_1.z.string().optional(),
    bankName: zod_1.z.string().optional(),
    bankAccount: zod_1.z.string().optional(),
    bankBranch: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
});
const getVendors = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const vendors = yield prisma_1.prisma.vendor.findMany({
            where: Object.assign(Object.assign({}, branchFilter), { isActive: true }),
            include: { _count: { select: { expenses: true } } },
            orderBy: { name: 'asc' },
        });
        res.json(vendors);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch vendors' });
    }
});
exports.getVendors = getVendors;
const createVendor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = vendorSchema.parse(req.body);
        const user = req.user;
        const vendor = yield prisma_1.prisma.vendor.create({
            data: Object.assign(Object.assign({}, data), { branchId: user === null || user === void 0 ? void 0 : user.branchId }),
        });
        res.status(201).json(vendor);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to create vendor' });
    }
});
exports.createVendor = createVendor;
const updateVendor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = vendorSchema.partial().parse(req.body);
        const vendor = yield prisma_1.prisma.vendor.update({
            where: { id: req.params.id },
            data,
        });
        res.json(vendor);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to update vendor' });
    }
});
exports.updateVendor = updateVendor;
const deleteVendor = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Soft delete
        yield prisma_1.prisma.vendor.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });
        res.json({ message: 'Vendor deactivated' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete vendor' });
    }
});
exports.deleteVendor = deleteVendor;
// ========================================
// EXPENSE MANAGEMENT
// ========================================
const expenseSchema = zod_1.z.object({
    date: zod_1.z.string().transform(s => new Date(s)),
    category: zod_1.z.enum([
        'SALARIES', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT',
        'FOOD_CATERING', 'RENT', 'INSURANCE', 'MARKETING', 'TECHNOLOGY',
        'PROFESSIONAL_FEES', 'BANK_CHARGES', 'TAXES', 'DEPRECIATION', 'MISCELLANEOUS',
    ]),
    description: zod_1.z.string().min(3),
    amount: zod_1.z.number().positive(),
    taxAmount: zod_1.z.number().min(0).default(0),
    vendorId: zod_1.z.string().uuid().optional(),
    paymentMethod: zod_1.z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']).optional(),
    paymentRef: zod_1.z.string().optional(),
    notes: zod_1.z.string().optional(),
    isRecurring: zod_1.z.boolean().default(false),
    recurringFrequency: zod_1.z.string().optional(),
});
const getExpenses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const { status, category, startDate, endDate, page = '1', limit = '20' } = req.query;
        const where = Object.assign({}, branchFilter);
        if (status)
            where.status = status;
        if (category)
            where.category = category;
        if (startDate || endDate) {
            where.date = {};
            if (startDate)
                where.date.gte = new Date(startDate);
            if (endDate)
                where.date.lte = new Date(endDate);
        }
        const skip = (Number(page) - 1) * Number(limit);
        const [expenses, total] = yield Promise.all([
            prisma_1.prisma.expense.findMany({
                where,
                include: { vendor: true },
                orderBy: { date: 'desc' },
                skip,
                take: Number(limit),
            }),
            prisma_1.prisma.expense.count({ where }),
        ]);
        res.json({ expenses, total, page: Number(page), totalPages: Math.ceil(total / Number(limit)) });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch expenses' });
    }
});
exports.getExpenses = getExpenses;
const getExpenseById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const expense = yield prisma_1.prisma.expense.findUnique({
            where: { id: req.params.id },
            include: { vendor: true },
        });
        if (!expense)
            return res.status(404).json({ error: 'Expense not found' });
        res.json(expense);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch expense' });
    }
});
exports.getExpenseById = getExpenseById;
const createExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = expenseSchema.parse(req.body);
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const expenseNumber = yield (0, accountingService_1.generateSequenceNumber)('EXP', user.branchId);
        const totalAmount = data.amount + data.taxAmount;
        const expense = yield prisma_1.prisma.expense.create({
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
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'EXPENSE_CREATED',
            entityType: 'Expense',
            entityId: expense.id,
            description: `Created expense ${expenseNumber}: ${data.description}`,
            amount: totalAmount,
            branchId: user.branchId,
        });
        res.status(201).json(expense);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        console.error('Create expense error:', error);
        res.status(500).json({ error: 'Failed to create expense' });
    }
});
exports.createExpense = createExpense;
const updateExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const existing = yield prisma_1.prisma.expense.findUnique({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Expense not found' });
        if (existing.status !== 'DRAFT' && existing.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ error: 'Can only edit draft or pending expenses' });
        }
        const data = expenseSchema.partial().parse(req.body);
        const amount = (_a = data.amount) !== null && _a !== void 0 ? _a : Number(existing.amount);
        const taxAmount = (_b = data.taxAmount) !== null && _b !== void 0 ? _b : Number(existing.taxAmount);
        const expense = yield prisma_1.prisma.expense.update({
            where: { id: req.params.id },
            data: Object.assign(Object.assign({}, data), { totalAmount: amount + taxAmount }),
            include: { vendor: true },
        });
        res.json(expense);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to update expense' });
    }
});
exports.updateExpense = updateExpense;
const approveExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const existing = yield prisma_1.prisma.expense.findUnique({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Expense not found' });
        if (existing.status !== 'PENDING_APPROVAL') {
            return res.status(400).json({ error: 'Expense is not pending approval' });
        }
        const expense = yield prisma_1.prisma.expense.update({
            where: { id: req.params.id },
            data: {
                status: 'APPROVED',
                approvedBy: user.userId,
                approvedAt: new Date(),
            },
        });
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'EXPENSE_APPROVED',
            entityType: 'Expense',
            entityId: expense.id,
            description: `Approved expense ${expense.expenseNumber}`,
            amount: Number(expense.totalAmount),
            branchId: user.branchId,
        });
        res.json(expense);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to approve expense' });
    }
});
exports.approveExpense = approveExpense;
const rejectExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const { reason } = zod_1.z.object({ reason: zod_1.z.string().min(3) }).parse(req.body);
        const expense = yield prisma_1.prisma.expense.update({
            where: { id: req.params.id },
            data: {
                status: 'REJECTED',
                rejectedBy: user.userId,
                rejectedAt: new Date(),
                rejectionReason: reason,
            },
        });
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'EXPENSE_REJECTED',
            entityType: 'Expense',
            entityId: expense.id,
            description: `Rejected expense ${expense.expenseNumber}: ${reason}`,
            amount: Number(expense.totalAmount),
            branchId: user.branchId,
        });
        res.json(expense);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to reject expense' });
    }
});
exports.rejectExpense = rejectExpense;
const markExpensePaid = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const { paymentMethod, paymentRef } = zod_1.z.object({
            paymentMethod: zod_1.z.enum(['CASH', 'MOBILE_MONEY', 'BANK_DEPOSIT']),
            paymentRef: zod_1.z.string().optional(),
        }).parse(req.body);
        const existing = yield prisma_1.prisma.expense.findUnique({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Expense not found' });
        if (existing.status !== 'APPROVED') {
            return res.status(400).json({ error: 'Can only pay approved expenses' });
        }
        const expense = yield prisma_1.prisma.expense.update({
            where: { id: req.params.id },
            data: { status: 'PAID', paymentMethod, paymentRef },
        });
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: 'EXPENSE_PAID',
            entityType: 'Expense',
            entityId: expense.id,
            description: `Paid expense ${expense.expenseNumber} via ${paymentMethod}`,
            amount: Number(expense.totalAmount),
            branchId: user.branchId,
        });
        // Create accounting journal entry
        (0, accountingBridge_1.onExpensePaid)(expense.id, user.userId).catch(err => console.error('Background expense journal creation failed:', err));
        res.json(expense);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to mark expense as paid' });
    }
});
exports.markExpensePaid = markExpensePaid;
const getExpenseSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const { startDate, endDate } = req.query;
        const dateFilter = {};
        if (startDate)
            dateFilter.gte = new Date(startDate);
        if (endDate)
            dateFilter.lte = new Date(endDate);
        const where = Object.assign(Object.assign({}, branchFilter), { status: 'PAID' });
        if (Object.keys(dateFilter).length)
            where.date = dateFilter;
        // Total by category
        const byCategory = yield prisma_1.prisma.expense.groupBy({
            by: ['category'],
            where,
            _sum: { totalAmount: true },
            _count: true,
        });
        // Monthly trend
        const expenses = yield prisma_1.prisma.expense.findMany({
            where,
            select: { date: true, totalAmount: true },
            orderBy: { date: 'asc' },
        });
        const monthlyTrend = expenses.reduce((acc, exp) => {
            const month = `${exp.date.getFullYear()}-${String(exp.date.getMonth() + 1).padStart(2, '0')}`;
            acc[month] = (acc[month] || 0) + Number(exp.totalAmount);
            return acc;
        }, {});
        // Pending approval count
        const pendingCount = yield prisma_1.prisma.expense.count({
            where: Object.assign(Object.assign({}, branchFilter), { status: 'PENDING_APPROVAL' }),
        });
        // Total paid this month
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const thisMonthTotal = yield prisma_1.prisma.expense.aggregate({
            where: Object.assign(Object.assign({}, branchFilter), { status: 'PAID', date: { gte: monthStart } }),
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
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to get expense summary' });
    }
});
exports.getExpenseSummary = getExpenseSummary;
const deleteExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const existing = yield prisma_1.prisma.expense.findUnique({ where: { id: req.params.id } });
        if (!existing)
            return res.status(404).json({ error: 'Expense not found' });
        if (existing.status === 'PAID') {
            return res.status(400).json({ error: 'Cannot delete a paid expense' });
        }
        yield prisma_1.prisma.expense.update({
            where: { id: req.params.id },
            data: { status: 'CANCELLED' },
        });
        res.json({ message: 'Expense cancelled' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete expense' });
    }
});
exports.deleteExpense = deleteExpense;
