"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.createFeeCategory = exports.getFeeCategories = exports.getFinancialAuditLog = exports.processRefund = exports.approveRefund = exports.createRefund = exports.getRefunds = exports.seedDefaultAccounts = exports.createAccount = exports.getChartOfAccounts = exports.agedReceivables = exports.cashFlowStatement = exports.balanceSheet = exports.incomeStatement = exports.trialBalance = void 0;
const prisma_1 = require("../utils/prisma");
const accountingService_1 = require("../services/accountingService");
// ========================================
// FINANCIAL STATEMENTS
// ========================================
const trialBalance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate } = req.query;
        const user = req.user;
        const branchId = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? undefined : user === null || user === void 0 ? void 0 : user.branchId;
        const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
        const end = endDate ? new Date(endDate) : new Date();
        const result = yield (0, accountingService_1.getTrialBalance)(start, end, branchId);
        res.json({ period: { startDate: start, endDate: end }, entries: result });
    }
    catch (error) {
        console.error('Trial balance error:', error);
        res.status(500).json({ error: 'Failed to generate trial balance' });
    }
});
exports.trialBalance = trialBalance;
const incomeStatement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate } = req.query;
        const user = req.user;
        const branchId = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? undefined : user === null || user === void 0 ? void 0 : user.branchId;
        const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
        const end = endDate ? new Date(endDate) : new Date();
        const result = yield (0, accountingService_1.getIncomeStatement)(start, end, branchId);
        res.json(result);
    }
    catch (error) {
        console.error('Income statement error:', error);
        res.status(500).json({ error: 'Failed to generate income statement' });
    }
});
exports.incomeStatement = incomeStatement;
const balanceSheet = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { asOfDate } = req.query;
        const user = req.user;
        const branchId = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? undefined : user === null || user === void 0 ? void 0 : user.branchId;
        const date = asOfDate ? new Date(asOfDate) : new Date();
        const result = yield (0, accountingService_1.getBalanceSheet)(date, branchId);
        res.json(result);
    }
    catch (error) {
        console.error('Balance sheet error:', error);
        res.status(500).json({ error: 'Failed to generate balance sheet' });
    }
});
exports.balanceSheet = balanceSheet;
const cashFlowStatement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate } = req.query;
        const user = req.user;
        const branchId = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? undefined : user === null || user === void 0 ? void 0 : user.branchId;
        const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
        const end = endDate ? new Date(endDate) : new Date();
        const result = yield (0, accountingService_1.getCashFlowSummary)(start, end, branchId);
        res.json(result);
    }
    catch (error) {
        console.error('Cash flow error:', error);
        res.status(500).json({ error: 'Failed to generate cash flow statement' });
    }
});
exports.cashFlowStatement = cashFlowStatement;
const agedReceivables = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchId = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? undefined : user === null || user === void 0 ? void 0 : user.branchId;
        const result = yield (0, accountingService_1.getAgedReceivables)(branchId);
        res.json(result);
    }
    catch (error) {
        console.error('Aged receivables error:', error);
        res.status(500).json({ error: 'Failed to generate aged receivables' });
    }
});
exports.agedReceivables = agedReceivables;
// ========================================
// CHART OF ACCOUNTS
// ========================================
const getChartOfAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const accounts = yield prisma_1.prisma.chartOfAccount.findMany({
            where: Object.assign(Object.assign({}, branchFilter), { isActive: true }),
            include: { children: true, parent: { select: { name: true, code: true } } },
            orderBy: { code: 'asc' },
        });
        res.json(accounts);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch chart of accounts' });
    }
});
exports.getChartOfAccounts = getChartOfAccounts;
const createAccount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { code, name, type, parentId, description } = req.body;
        const user = req.user;
        const account = yield prisma_1.prisma.chartOfAccount.create({
            data: { code, name, type, parentId, description, branchId: user === null || user === void 0 ? void 0 : user.branchId },
        });
        res.status(201).json(account);
    }
    catch (error) {
        if (error.code === 'P2002')
            return res.status(400).json({ error: 'Account code already exists' });
        res.status(500).json({ error: 'Failed to create account' });
    }
});
exports.createAccount = createAccount;
const seedDefaultAccounts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchId = (user === null || user === void 0 ? void 0 : user.branchId) || null;
        const defaults = [
            // Assets
            { code: '1000', name: 'Cash at Bank', type: 'ASSET' },
            { code: '1100', name: 'Petty Cash', type: 'ASSET' },
            { code: '1200', name: 'Accounts Receivable (Fees)', type: 'ASSET' },
            { code: '1300', name: 'Prepaid Expenses', type: 'ASSET' },
            { code: '1500', name: 'Fixed Assets', type: 'ASSET' },
            // Liabilities
            { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
            { code: '2100', name: 'PAYE Tax Payable', type: 'LIABILITY' },
            { code: '2200', name: 'NAPSA Payable', type: 'LIABILITY' },
            { code: '2300', name: 'NHIMA Payable', type: 'LIABILITY' },
            { code: '2400', name: 'Advance Fees Received', type: 'LIABILITY' },
            // Equity
            { code: '3000', name: 'Owner\'s Equity', type: 'EQUITY' },
            { code: '3100', name: 'Retained Earnings', type: 'EQUITY' },
            // Income
            { code: '4000', name: 'Tuition Revenue', type: 'INCOME' },
            { code: '4100', name: 'Registration Fees', type: 'INCOME' },
            { code: '4200', name: 'Transport Revenue', type: 'INCOME' },
            { code: '4300', name: 'Boarding Revenue', type: 'INCOME' },
            { code: '4400', name: 'Lab & Equipment Fees', type: 'INCOME' },
            { code: '4500', name: 'Uniform Revenue', type: 'INCOME' },
            { code: '4900', name: 'Other Income', type: 'INCOME' },
            // Expenses
            { code: '5000', name: 'Salaries & Wages', type: 'EXPENSE' },
            { code: '5100', name: 'Utilities', type: 'EXPENSE' },
            { code: '5200', name: 'Teaching Supplies', type: 'EXPENSE' },
            { code: '5300', name: 'Maintenance & Repairs', type: 'EXPENSE' },
            { code: '5400', name: 'Transport Costs', type: 'EXPENSE' },
            { code: '5500', name: 'Food & Catering', type: 'EXPENSE' },
            { code: '5600', name: 'Rent & Rates', type: 'EXPENSE' },
            { code: '5700', name: 'Insurance', type: 'EXPENSE' },
            { code: '5800', name: 'Marketing & Advertising', type: 'EXPENSE' },
            { code: '5900', name: 'Technology & IT', type: 'EXPENSE' },
            { code: '6000', name: 'Professional Fees', type: 'EXPENSE' },
            { code: '6100', name: 'Bank Charges', type: 'EXPENSE' },
            { code: '6200', name: 'Taxes & Levies', type: 'EXPENSE' },
            { code: '6300', name: 'Depreciation', type: 'EXPENSE' },
            { code: '6900', name: 'Miscellaneous Expenses', type: 'EXPENSE' },
        ];
        let created = 0;
        for (const account of defaults) {
            try {
                yield prisma_1.prisma.chartOfAccount.create({
                    data: Object.assign(Object.assign({}, account), { isSystem: true, branchId }),
                });
                created++;
            }
            catch (e) {
                // Skip if already exists
            }
        }
        res.json({ message: `Seeded ${created} default accounts`, total: defaults.length });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to seed accounts' });
    }
});
exports.seedDefaultAccounts = seedDefaultAccounts;
// ========================================
// REFUND MANAGEMENT
// ========================================
const getRefunds = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        const branchFilter = (user === null || user === void 0 ? void 0 : user.role) === 'SUPER_ADMIN' ? {} : { branchId: user === null || user === void 0 ? void 0 : user.branchId };
        const refunds = yield prisma_1.prisma.refund.findMany({
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
        res.json(refunds.map(r => (Object.assign(Object.assign({}, r), { amount: Number(r.amount) }))));
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch refunds' });
    }
});
exports.getRefunds = getRefunds;
const createRefund = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { paymentId, amount, reason, method } = req.body;
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const payment = yield prisma_1.prisma.payment.findUnique({
            where: { id: paymentId },
            include: { student: true },
        });
        if (!payment)
            return res.status(404).json({ error: 'Payment not found' });
        if (amount > Number(payment.amount)) {
            return res.status(400).json({ error: 'Refund amount exceeds payment amount' });
        }
        const refundNumber = yield (yield Promise.resolve().then(() => __importStar(require('../services/accountingService')))).generateSequenceNumber('REF', user.branchId);
        const refund = yield prisma_1.prisma.refund.create({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create refund' });
    }
});
exports.createRefund = createRefund;
const approveRefund = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const refund = yield prisma_1.prisma.refund.update({
            where: { id: req.params.id },
            data: { status: 'APPROVED', approvedBy: user.userId, approvedAt: new Date() },
        });
        res.json(refund);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to approve refund' });
    }
});
exports.approveRefund = approveRefund;
const processRefund = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        if (!user)
            return res.status(401).json({ error: 'Unauthorized' });
        const refund = yield prisma_1.prisma.refund.findUnique({ where: { id: req.params.id } });
        if (!refund)
            return res.status(404).json({ error: 'Refund not found' });
        if (refund.status !== 'APPROVED')
            return res.status(400).json({ error: 'Refund must be approved first' });
        const updated = yield prisma_1.prisma.refund.update({
            where: { id: req.params.id },
            data: { status: 'PROCESSED', processedBy: user.userId, processedAt: new Date() },
        });
        res.json(updated);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to process refund' });
    }
});
exports.processRefund = processRefund;
// ========================================
// FINANCIAL AUDIT LOG
// ========================================
const getFinancialAuditLog = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { entityType, action, startDate, endDate, page = '1', limit = '50' } = req.query;
        const where = {};
        if (entityType)
            where.entityType = entityType;
        if (action)
            where.action = action;
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate)
                where.createdAt.gte = new Date(startDate);
            if (endDate)
                where.createdAt.lte = new Date(endDate);
        }
        const skip = (Number(page) - 1) * Number(limit);
        const [logs, total] = yield Promise.all([
            prisma_1.prisma.financialAuditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: Number(limit),
            }),
            prisma_1.prisma.financialAuditLog.count({ where }),
        ]);
        // Enrich with user names
        const userIds = [...new Set(logs.map(l => l.userId))];
        const users = yield prisma_1.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, fullName: true },
        });
        const userMap = new Map(users.map(u => [u.id, u.fullName]));
        res.json({
            logs: logs.map(l => (Object.assign(Object.assign({}, l), { amount: l.amount ? Number(l.amount) : null, userName: userMap.get(l.userId) || 'System' }))),
            total,
            page: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch audit log' });
    }
});
exports.getFinancialAuditLog = getFinancialAuditLog;
// Fee Categories
const getFeeCategories = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const categories = yield prisma_1.prisma.feeCategory.findMany({
            where: { isActive: true },
            include: { children: true, parent: { select: { name: true } } },
            orderBy: { name: 'asc' },
        });
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch fee categories' });
    }
});
exports.getFeeCategories = getFeeCategories;
const createFeeCategory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, code, description, parentId } = req.body;
        const category = yield prisma_1.prisma.feeCategory.create({
            data: { name, code, description, parentId },
        });
        res.status(201).json(category);
    }
    catch (error) {
        if (error.code === 'P2002')
            return res.status(400).json({ error: 'Category code already exists' });
        res.status(500).json({ error: 'Failed to create fee category' });
    }
});
exports.createFeeCategory = createFeeCategory;
