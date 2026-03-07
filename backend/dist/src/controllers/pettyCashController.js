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
exports.getPettyCashSummary = exports.createPettyCashTransaction = exports.getPettyCashTransactions = exports.createPettyCashAccount = exports.getPettyCashAccounts = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
const accountingService_1 = require("../services/accountingService");
const accountingBridge_1 = require("../services/accountingBridge");
// ========================================
// PETTY CASH MANAGEMENT
// ========================================
const getPettyCashAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const accounts = yield prisma_1.prisma.pettyCashAccount.findMany({
            where: Object.assign(Object.assign({}, branchFilter), { isActive: true }),
            include: { _count: { select: { transactions: true } } },
        });
        res.json(accounts.map(a => (Object.assign(Object.assign({}, a), { floatAmount: Number(a.floatAmount), balance: Number(a.balance) }))));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch petty cash accounts' });
    }
});
exports.getPettyCashAccounts = getPettyCashAccounts;
const createPettyCashAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, floatAmount, custodianId } = zod_1.z.object({
            name: zod_1.z.string().min(2),
            floatAmount: zod_1.z.number().positive(),
            custodianId: zod_1.z.string().uuid(),
        }).parse(req.body);
        const user = req.user;
        const account = yield prisma_1.prisma.pettyCashAccount.create({
            data: {
                name,
                floatAmount,
                balance: floatAmount,
                custodianId,
                branchId: user === null || user === void 0 ? void 0 : user.branchId,
            },
        });
        res.status(201).json(Object.assign(Object.assign({}, account), { floatAmount: Number(account.floatAmount), balance: Number(account.balance) }));
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        res.status(500).json({ error: 'Failed to create petty cash account' });
    }
});
exports.createPettyCashAccount = createPettyCashAccount;
const getPettyCashTransactions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { accountId } = req.params;
        const { startDate, endDate, page = '1', limit = '20' } = req.query;
        const where = { accountId };
        if (startDate || endDate) {
            where.date = {};
            if (startDate)
                where.date.gte = new Date(startDate);
            if (endDate)
                where.date.lte = new Date(endDate);
        }
        const skip = (Number(page) - 1) * Number(limit);
        const [transactions, total] = yield Promise.all([
            prisma_1.prisma.pettyCashTransaction.findMany({
                where,
                orderBy: { date: 'desc' },
                skip,
                take: Number(limit),
            }),
            prisma_1.prisma.pettyCashTransaction.count({ where }),
        ]);
        // Enrich with user names
        const userIds = [...new Set(transactions.map(t => t.recordedBy))];
        const users = yield prisma_1.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
        });
        const userMap = new Map(users.map(u => [u.id, u.fullName]));
        res.json({
            transactions: transactions.map(t => (Object.assign(Object.assign({}, t), { amount: Number(t.amount), recordedByName: userMap.get(t.recordedBy) || 'Unknown' }))),
            total,
            page: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});
exports.getPettyCashTransactions = getPettyCashTransactions;
const createPettyCashTransaction = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const data = zod_1.z.object({
            accountId: zod_1.z.string().uuid(),
            type: zod_1.z.enum(['DISBURSEMENT', 'REPLENISHMENT']),
            amount: zod_1.z.number().positive(),
            description: zod_1.z.string().min(3),
            category: zod_1.z.enum([
                'SALARIES', 'UTILITIES', 'SUPPLIES', 'MAINTENANCE', 'TRANSPORT',
                'FOOD_CATERING', 'RENT', 'INSURANCE', 'MARKETING', 'TECHNOLOGY',
                'PROFESSIONAL_FEES', 'BANK_CHARGES', 'TAXES', 'DEPRECIATION', 'MISCELLANEOUS',
            ]).optional(),
        }).parse(req.body);
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const account = yield prisma_1.prisma.pettyCashAccount.findUnique({ where: { id: data.accountId } });
        if (!account)
            return res.status(404).json({ error: 'Petty cash account not found' });
        if (data.type === 'DISBURSEMENT' && Number(account.balance) < data.amount) {
            return res.status(400).json({ error: 'Insufficient petty cash balance' });
        }
        const newBalance = data.type === 'DISBURSEMENT'
            ? Number(account.balance) - data.amount
            : Number(account.balance) + data.amount;
        const [transaction] = yield prisma_1.prisma.$transaction([
            prisma_1.prisma.pettyCashTransaction.create({
                data: {
                    accountId: data.accountId,
                    type: data.type,
                    amount: data.amount,
                    description: data.description,
                    category: data.category,
                    recordedBy: user.userId,
                },
            }),
            prisma_1.prisma.pettyCashAccount.update({
                where: { id: data.accountId },
                data: { balance: newBalance },
            }),
        ]);
        yield (0, accountingService_1.logFinancialAction)({
            userId: user.userId,
            action: `PETTY_CASH_${data.type}`,
            entityType: 'PettyCash',
            entityId: transaction.id,
            description: `${data.type}: ${data.description}`,
            amount: data.amount,
            branchId: user.branchId,
        });
        // Create accounting journal entry
        (0, accountingBridge_1.onPettyCashTransaction)(transaction.id, user.userId).catch(err => console.error('Background petty cash journal creation failed:', err));
        res.status(201).json(Object.assign(Object.assign({}, transaction), { amount: Number(transaction.amount), newBalance }));
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError)
            return res.status(400).json({ error: error.errors });
        console.error('Create petty cash transaction error:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
    }
});
exports.createPettyCashTransaction = createPettyCashTransaction;
const getPettyCashSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { accountId } = req.params;
        const account = yield prisma_1.prisma.pettyCashAccount.findUnique({ where: { id: accountId } });
        if (!account)
            return res.status(404).json({ error: 'Account not found' });
        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const [disbursements, replenishments, byCategory] = yield Promise.all([
            prisma_1.prisma.pettyCashTransaction.aggregate({
                where: { accountId, type: 'DISBURSEMENT', date: { gte: monthStart } },
                _sum: { amount: true },
                _count: true,
            }),
            prisma_1.prisma.pettyCashTransaction.aggregate({
                where: { accountId, type: 'REPLENISHMENT', date: { gte: monthStart } },
                _sum: { amount: true },
                _count: true,
            }),
            prisma_1.prisma.pettyCashTransaction.groupBy({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to get petty cash summary' });
    }
});
exports.getPettyCashSummary = getPettyCashSummary;
