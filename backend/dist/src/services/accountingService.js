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
exports.getAgedReceivables = exports.getCashFlowSummary = exports.getBalanceSheet = exports.getIncomeStatement = exports.getTrialBalance = exports.calculateNHIMA = exports.calculateNAPSA = exports.calculatePAYE = exports.logFinancialAction = exports.createJournalEntry = exports.generateSequenceNumber = exports.generateReceiptNumber = void 0;
const prisma_1 = require("../utils/prisma");
// ========================================
// RECEIPT SEQUENCE
// ========================================
/**
 * Generate a sequential receipt number: REC-2026-00001
 */
const generateReceiptNumber = (branchId) => __awaiter(void 0, void 0, void 0, function* () {
    const year = new Date().getFullYear();
    const prefix = 'REC';
    const sequence = yield prisma_1.prisma.receiptSequence.upsert({
        where: {
            prefix_year_branchId: { prefix, year, branchId: branchId || '' },
        },
        create: { prefix, year, branchId: branchId || null, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
    });
    return `${prefix}-${year}-${String(sequence.lastNumber).padStart(5, '0')}`;
});
exports.generateReceiptNumber = generateReceiptNumber;
/**
 * Generate sequential numbers for different document types
 */
const generateSequenceNumber = (prefix, branchId) => __awaiter(void 0, void 0, void 0, function* () {
    const year = new Date().getFullYear();
    const sequence = yield prisma_1.prisma.receiptSequence.upsert({
        where: {
            prefix_year_branchId: { prefix, year, branchId: branchId || '' },
        },
        create: { prefix, year, branchId: branchId || null, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } },
    });
    return `${prefix}-${year}-${String(sequence.lastNumber).padStart(5, '0')}`;
});
exports.generateSequenceNumber = generateSequenceNumber;
/**
 * Create a journal entry with balanced debit/credit lines
 */
const createJournalEntry = (data) => __awaiter(void 0, void 0, void 0, function* () {
    // Validate debits = credits
    const totalDebit = data.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
    const totalCredit = data.lines.reduce((sum, l) => sum + (l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
        throw new Error(`Journal entry not balanced: Debit ${totalDebit} != Credit ${totalCredit}`);
    }
    const entryNumber = yield (0, exports.generateSequenceNumber)('JE', data.branchId);
    // Look up accounts by code
    const accountCodes = data.lines.map(l => l.accountCode);
    const accounts = yield prisma_1.prisma.chartOfAccount.findMany({
        where: { code: { in: accountCodes } },
    });
    const accountMap = new Map(accounts.map(a => [a.code, a.id]));
    // Verify all accounts exist
    for (const line of data.lines) {
        if (!accountMap.has(line.accountCode)) {
            throw new Error(`Account code ${line.accountCode} not found`);
        }
    }
    return prisma_1.prisma.journalEntry.create({
        data: {
            entryNumber,
            date: data.date,
            description: data.description,
            referenceType: data.referenceType,
            referenceId: data.referenceId,
            isPosted: data.autoPost || false,
            postedAt: data.autoPost ? new Date() : null,
            branchId: data.branchId,
            lines: {
                create: data.lines.map(line => ({
                    accountId: accountMap.get(line.accountCode),
                    debit: line.debit || 0,
                    credit: line.credit || 0,
                    description: line.description,
                })),
            },
        },
        include: {
            lines: { include: { account: true } },
        },
    });
});
exports.createJournalEntry = createJournalEntry;
// ========================================
// FINANCIAL AUDIT LOGGING
// ========================================
const logFinancialAction = (data) => __awaiter(void 0, void 0, void 0, function* () {
    return prisma_1.prisma.financialAuditLog.create({
        data: {
            userId: data.userId,
            action: data.action,
            entityType: data.entityType,
            entityId: data.entityId,
            description: data.description,
            amount: data.amount,
            oldValue: data.oldValue ? JSON.parse(JSON.stringify(data.oldValue)) : null,
            newValue: data.newValue ? JSON.parse(JSON.stringify(data.newValue)) : null,
            ipAddress: data.ipAddress,
            branchId: data.branchId,
        },
    });
});
exports.logFinancialAction = logFinancialAction;
// ========================================
// ZAMBIA TAX CALCULATIONS (PAYE, NAPSA, NHIMA)
// ========================================
/**
 * Calculate PAYE (Pay As You Earn) tax using Zambian 2026 tax brackets
 */
const calculatePAYE = (monthlyGross) => {
    // ZRA 2025/2026 tax bands (monthly)
    const bands = [
        { limit: 5100, rate: 0 }, // 0% up to K5,100
        { limit: 7100, rate: 0.20 }, // 20% on K5,101 - K7,100
        { limit: 9200, rate: 0.30 }, // 30% on K7,101 - K9,200
        { limit: Infinity, rate: 0.37 }, // 37% on above K9,200
    ];
    let tax = 0;
    let remaining = monthlyGross;
    let previousLimit = 0;
    for (const band of bands) {
        const taxableInBand = Math.min(remaining, band.limit - previousLimit);
        if (taxableInBand <= 0)
            break;
        tax += taxableInBand * band.rate;
        remaining -= taxableInBand;
        previousLimit = band.limit;
    }
    return Math.round(tax * 100) / 100;
};
exports.calculatePAYE = calculatePAYE;
/**
 * Calculate NAPSA contribution (employee 5%, employer 5%)
 */
const calculateNAPSA = (monthlyGross) => {
    const ceiling = 26538.46; // Monthly ceiling
    const base = Math.min(monthlyGross, ceiling);
    return {
        employee: Math.round(base * 0.05 * 100) / 100,
        employer: Math.round(base * 0.05 * 100) / 100,
    };
};
exports.calculateNAPSA = calculateNAPSA;
/**
 * Calculate NHIMA contribution (employee 1%, employer 1%)
 */
const calculateNHIMA = (monthlyGross) => {
    return {
        employee: Math.round(monthlyGross * 0.01 * 100) / 100,
        employer: Math.round(monthlyGross * 0.01 * 100) / 100,
    };
};
exports.calculateNHIMA = calculateNHIMA;
// ========================================
// FINANCIAL STATEMENTS
// ========================================
/**
 * Generate Trial Balance
 */
const getTrialBalance = (startDate, endDate, branchId) => __awaiter(void 0, void 0, void 0, function* () {
    const branchFilter = branchId ? { branchId } : {};
    const accounts = yield prisma_1.prisma.chartOfAccount.findMany({
        where: Object.assign({ isActive: true }, branchFilter),
        include: {
            journalEntryLines: {
                where: {
                    journal: Object.assign({ isPosted: true, date: { gte: startDate, lte: endDate } }, branchFilter),
                },
            },
        },
        orderBy: { code: 'asc' },
    });
    return accounts.map(account => {
        const totalDebit = account.journalEntryLines.reduce((sum, line) => sum + Number(line.debit), 0);
        const totalCredit = account.journalEntryLines.reduce((sum, line) => sum + Number(line.credit), 0);
        return {
            accountCode: account.code,
            accountName: account.name,
            accountType: account.type,
            debit: totalDebit,
            credit: totalCredit,
            balance: totalDebit - totalCredit,
        };
    }).filter(a => a.debit !== 0 || a.credit !== 0);
});
exports.getTrialBalance = getTrialBalance;
/**
 * Generate Income Statement (Profit & Loss)
 */
const getIncomeStatement = (startDate, endDate, branchId) => __awaiter(void 0, void 0, void 0, function* () {
    const branchFilter = branchId ? { branchId } : {};
    // Get INCOME accounts
    const incomeAccounts = yield prisma_1.prisma.chartOfAccount.findMany({
        where: Object.assign({ type: 'INCOME', isActive: true }, branchFilter),
        include: {
            journalEntryLines: {
                where: {
                    journal: Object.assign({ isPosted: true, date: { gte: startDate, lte: endDate } }, branchFilter),
                },
            },
        },
    });
    // Get EXPENSE accounts
    const expenseAccounts = yield prisma_1.prisma.chartOfAccount.findMany({
        where: Object.assign({ type: 'EXPENSE', isActive: true }, branchFilter),
        include: {
            journalEntryLines: {
                where: {
                    journal: Object.assign({ isPosted: true, date: { gte: startDate, lte: endDate } }, branchFilter),
                },
            },
        },
    });
    const income = incomeAccounts.map(account => ({
        code: account.code,
        name: account.name,
        amount: account.journalEntryLines.reduce((sum, line) => sum + Number(line.credit) - Number(line.debit), 0),
    }));
    const expenses = expenseAccounts.map(account => ({
        code: account.code,
        name: account.name,
        amount: account.journalEntryLines.reduce((sum, line) => sum + Number(line.debit) - Number(line.credit), 0),
    }));
    const totalIncome = income.reduce((sum, i) => sum + i.amount, 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    return {
        period: { startDate, endDate },
        income: income.filter(i => i.amount !== 0),
        totalIncome,
        expenses: expenses.filter(e => e.amount !== 0),
        totalExpenses,
        netIncome: totalIncome - totalExpenses,
    };
});
exports.getIncomeStatement = getIncomeStatement;
/**
 * Generate Balance Sheet
 */
const getBalanceSheet = (asOfDate, branchId) => __awaiter(void 0, void 0, void 0, function* () {
    const branchFilter = branchId ? { branchId } : {};
    const allAccounts = yield prisma_1.prisma.chartOfAccount.findMany({
        where: Object.assign({ isActive: true }, branchFilter),
        include: {
            journalEntryLines: {
                where: {
                    journal: Object.assign({ isPosted: true, date: { lte: asOfDate } }, branchFilter),
                },
            },
        },
        orderBy: { code: 'asc' },
    });
    const categorize = (type) => allAccounts
        .filter(a => a.type === type)
        .map(account => {
        const balance = account.journalEntryLines.reduce((sum, line) => {
            if (type === 'ASSET' || type === 'EXPENSE') {
                return sum + Number(line.debit) - Number(line.credit);
            }
            return sum + Number(line.credit) - Number(line.debit);
        }, 0);
        return { code: account.code, name: account.name, balance };
    })
        .filter(a => a.balance !== 0);
    const assets = categorize('ASSET');
    const liabilities = categorize('LIABILITY');
    const equity = categorize('EQUITY');
    return {
        asOfDate,
        assets,
        totalAssets: assets.reduce((sum, a) => sum + a.balance, 0),
        liabilities,
        totalLiabilities: liabilities.reduce((sum, l) => sum + l.balance, 0),
        equity,
        totalEquity: equity.reduce((sum, e) => sum + e.balance, 0),
    };
});
exports.getBalanceSheet = getBalanceSheet;
/**
 * Generate Cash Flow Summary
 */
const getCashFlowSummary = (startDate, endDate, branchId) => __awaiter(void 0, void 0, void 0, function* () {
    const branchFilter = branchId ? { branchId } : {};
    // Cash inflows = Payments received
    const payments = yield prisma_1.prisma.payment.aggregate({
        where: Object.assign({ paymentDate: { gte: startDate, lte: endDate }, status: 'COMPLETED' }, branchFilter),
        _sum: { amount: true },
        _count: true,
    });
    // Cash outflows = Expenses paid
    const expenses = yield prisma_1.prisma.expense.aggregate({
        where: Object.assign({ date: { gte: startDate, lte: endDate }, status: 'PAID' }, branchFilter),
        _sum: { totalAmount: true },
        _count: true,
    });
    // Payroll outflows
    const payroll = yield prisma_1.prisma.payslip.aggregate({
        where: {
            isPaid: true,
            paidAt: { gte: startDate, lte: endDate },
            payrollRun: branchId ? { branchId } : {},
        },
        _sum: { netSalary: true },
        _count: true,
    });
    const totalInflow = Number(payments._sum.amount || 0);
    const totalExpenseOutflow = Number(expenses._sum.totalAmount || 0);
    const totalPayrollOutflow = Number(payroll._sum.netSalary || 0);
    const totalOutflow = totalExpenseOutflow + totalPayrollOutflow;
    return {
        period: { startDate, endDate },
        inflows: {
            feeCollections: totalInflow,
            totalInflow,
        },
        outflows: {
            expenses: totalExpenseOutflow,
            payroll: totalPayrollOutflow,
            totalOutflow,
        },
        netCashFlow: totalInflow - totalOutflow,
    };
});
exports.getCashFlowSummary = getCashFlowSummary;
/**
 * Generate Aged Receivables Report
 */
const getAgedReceivables = (branchId) => __awaiter(void 0, void 0, void 0, function* () {
    const now = new Date();
    const days30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const days60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const days90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const branchFilter = branchId ? { branchId } : {};
    const students = yield prisma_1.prisma.student.findMany({
        where: Object.assign({ status: 'ACTIVE' }, branchFilter),
        include: {
            class: true,
            feeStructures: {
                include: { feeTemplate: true },
            },
            payments: {
                where: { status: 'COMPLETED' },
            },
        },
    });
    const receivables = students.map(student => {
        var _a;
        const totalDue = student.feeStructures.reduce((sum, fs) => sum + Number(fs.amountDue), 0);
        const totalPaid = student.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = totalDue - totalPaid;
        if (balance <= 0)
            return null;
        // Categorize by age based on earliest unpaid fee due date
        const earliestDue = student.feeStructures
            .filter(fs => Number(fs.amountDue) > Number(fs.amountPaid))
            .sort((a, b) => {
            const dateA = a.dueDate || a.createdAt;
            const dateB = b.dueDate || b.createdAt;
            return dateA.getTime() - dateB.getTime();
        })[0];
        const dueDate = (earliestDue === null || earliestDue === void 0 ? void 0 : earliestDue.dueDate) || (earliestDue === null || earliestDue === void 0 ? void 0 : earliestDue.createdAt) || now;
        const ageDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        let bucket;
        if (ageDays <= 0)
            bucket = 'current';
        else if (ageDays <= 30)
            bucket = '1-30';
        else if (ageDays <= 60)
            bucket = '31-60';
        else if (ageDays <= 90)
            bucket = '61-90';
        else
            bucket = '90+';
        return {
            studentId: student.id,
            studentName: `${student.firstName} ${student.lastName}`,
            admissionNumber: student.admissionNumber,
            className: ((_a = student.class) === null || _a === void 0 ? void 0 : _a.name) || 'N/A',
            totalDue,
            totalPaid,
            balance,
            ageDays,
            bucket,
            guardianPhone: student.guardianPhone,
            guardianEmail: student.guardianEmail,
        };
    }).filter(Boolean);
    // Summary by bucket
    const summary = {
        current: 0,
        '1-30': 0,
        '31-60': 0,
        '61-90': 0,
        '90+': 0,
        total: 0,
    };
    receivables.forEach(r => {
        if (r) {
            summary[r.bucket] += r.balance;
            summary.total += r.balance;
        }
    });
    return {
        receivables: receivables.sort((a, b) => ((b === null || b === void 0 ? void 0 : b.balance) || 0) - ((a === null || a === void 0 ? void 0 : a.balance) || 0)),
        summary,
        studentCount: receivables.length,
        generatedAt: new Date(),
    };
});
exports.getAgedReceivables = getAgedReceivables;
