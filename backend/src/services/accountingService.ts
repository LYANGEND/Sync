import { prisma } from '../utils/prisma';
import { invalidateFinancialSnapshotAfterMutation } from '../cache/financialSnapshotCache';
import {
  getAgedReceivablesAggregates,
  getBalanceSheetAggregates,
  getIncomeStatementAggregates,
  getTrialBalanceAggregates,
} from './financialAggregationService';
// ========================================
// RECEIPT SEQUENCE
// ========================================

/**
 * Generate a sequential receipt number: REC-2026-00001
 */
export const generateReceiptNumber = async (branchId?: string): Promise<string> => {
  const year = new Date().getFullYear();
  const prefix = 'REC';

  const sequence = await prisma.receiptSequence.upsert({
    where: {
      prefix_year_branchId: { prefix, year, branchId: branchId || '' },
    },
    create: { prefix, year, branchId: branchId || null, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });

  return `${prefix}-${year}-${String(sequence.lastNumber).padStart(5, '0')}`;
};

/**
 * Generate sequential numbers for different document types
 */
export const generateSequenceNumber = async (
  prefix: string,
  branchId?: string
): Promise<string> => {
  const year = new Date().getFullYear();

  const sequence = await prisma.receiptSequence.upsert({
    where: {
      prefix_year_branchId: { prefix, year, branchId: branchId || '' },
    },
    create: { prefix, year, branchId: branchId || null, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });

  return `${prefix}-${year}-${String(sequence.lastNumber).padStart(5, '0')}`;
};

// ========================================
// JOURNAL ENTRY HELPERS
// ========================================

interface JournalLine {
  accountCode: string;
  debit?: number;
  credit?: number;
  description?: string;
}

/**
 * Create a journal entry with balanced debit/credit lines
 */
export const createJournalEntry = async (data: {
  date: Date;
  description: string;
  referenceType?: string;
  referenceId?: string;
  lines: JournalLine[];
  branchId?: string;
  autoPost?: boolean;
}) => {
  // Validate debits = credits
  const totalDebit = data.lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredit = data.lines.reduce((sum, l) => sum + (l.credit || 0), 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal entry not balanced: Debit ${totalDebit} != Credit ${totalCredit}`);
  }

  const entryNumber = await generateSequenceNumber('JE', data.branchId);

  // Look up accounts by code
  const accountCodes = data.lines.map(l => l.accountCode);
  const accounts = await prisma.chartOfAccount.findMany({
    where: { code: { in: accountCodes } },
  });

  const accountMap = new Map(accounts.map(a => [a.code, a.id]));

  // Verify all accounts exist
  for (const line of data.lines) {
    if (!accountMap.has(line.accountCode)) {
      throw new Error(`Account code ${line.accountCode} not found`);
    }
  }

  const entry = await prisma.journalEntry.create({
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
          accountId: accountMap.get(line.accountCode)!,
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

  await invalidateFinancialSnapshotAfterMutation({
    tenantId: entry.tenantId,
    branchId: entry.branchId,
    source: 'journal-entry.created',
  });
  return entry;
};

// ========================================
// FINANCIAL AUDIT LOGGING
// ========================================

export const logFinancialAction = async (data: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  amount?: number;
  oldValue?: any;
  newValue?: any;
  ipAddress?: string;
  branchId?: string;
}) => {
  const auditLog = await prisma.financialAuditLog.create({
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

  await invalidateFinancialSnapshotAfterMutation({
    tenantId: auditLog.tenantId,
    scope: 'tenant',
    source: 'financial-audit-log.created',
  });
  return auditLog;
};

// ========================================
// ZAMBIA TAX CALCULATIONS (PAYE, NAPSA, NHIMA)
// ========================================

/**
 * Calculate PAYE (Pay As You Earn) tax using Zambian 2026 tax brackets
 */
export const calculatePAYE = (monthlyGross: number): number => {
  // ZRA 2025/2026 tax bands (monthly)
  const bands = [
    { limit: 5100, rate: 0 },         // 0% up to K5,100
    { limit: 7100, rate: 0.20 },      // 20% on K5,101 - K7,100
    { limit: 9200, rate: 0.30 },      // 30% on K7,101 - K9,200
    { limit: Infinity, rate: 0.37 },  // 37% on above K9,200
  ];

  let tax = 0;
  let remaining = monthlyGross;
  let previousLimit = 0;

  for (const band of bands) {
    const taxableInBand = Math.min(remaining, band.limit - previousLimit);
    if (taxableInBand <= 0) break;
    tax += taxableInBand * band.rate;
    remaining -= taxableInBand;
    previousLimit = band.limit;
  }

  return Math.round(tax * 100) / 100;
};

/**
 * Calculate NAPSA contribution (employee 5%, employer 5%)
 */
export const calculateNAPSA = (monthlyGross: number): { employee: number; employer: number } => {
  const ceiling = 26538.46; // Monthly ceiling
  const base = Math.min(monthlyGross, ceiling);
  return {
    employee: Math.round(base * 0.05 * 100) / 100,
    employer: Math.round(base * 0.05 * 100) / 100,
  };
};

/**
 * Calculate NHIMA contribution (employee 1%, employer 1%)
 */
export const calculateNHIMA = (monthlyGross: number): { employee: number; employer: number } => {
  return {
    employee: Math.round(monthlyGross * 0.01 * 100) / 100,
    employer: Math.round(monthlyGross * 0.01 * 100) / 100,
  };
};

// ========================================
// FINANCIAL STATEMENTS
// ========================================

/**
 * Generate Trial Balance
 */
export const getTrialBalance = async (startDate: Date, endDate: Date, branchId?: string) => {
  return getTrialBalanceAggregates(startDate, endDate, branchId);
};

/**
 * Generate Income Statement (Profit & Loss)
 */
export const getIncomeStatement = async (startDate: Date, endDate: Date, branchId?: string) => {
  return getIncomeStatementAggregates(startDate, endDate, branchId);
};

/**
 * Generate Balance Sheet
 */
export const getBalanceSheet = async (asOfDate: Date, branchId?: string) => {
  return getBalanceSheetAggregates(asOfDate, branchId);
};

/**
 * Generate Cash Flow Summary
 */
export const getCashFlowSummary = async (startDate: Date, endDate: Date, branchId?: string) => {
  const branchFilter = branchId ? { branchId } : {};

  // Cash inflows = Payments received
  const payments = await prisma.payment.aggregate({
    where: {
      paymentDate: { gte: startDate, lte: endDate },
      status: 'COMPLETED',
      ...branchFilter,
    },
    _sum: { amount: true },
    _count: true,
  });

  // Cash outflows = Expenses paid
  const expenses = await prisma.expense.aggregate({
    where: {
      date: { gte: startDate, lte: endDate },
      status: 'PAID',
      ...branchFilter,
    },
    _sum: { totalAmount: true },
    _count: true,
  });

  // Payroll outflows
  const payroll = await prisma.payslip.aggregate({
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
};

/**
 * Generate Aged Receivables Report
 */
export const getAgedReceivables = async (branchId?: string) => {
  return getAgedReceivablesAggregates(branchId);
};
