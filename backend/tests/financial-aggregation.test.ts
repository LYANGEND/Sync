import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { runWithTenant } from '../src/middleware/tenantContext';
import { prisma } from '../src/utils/prisma';
import * as financialAggregations from '../src/services/financialAggregationService';
import {
  getAgedReceivablesAggregates,
  getBalanceSheetAggregates,
  getClassCollectionAggregates,
  getFinanceOverviewAggregates,
  getIncomeStatementAggregates,
  getMonthlyRevenueAggregates,
  getRecentMonthlyRevenueTrend,
  getTrialBalanceAggregates,
} from '../src/services/financialAggregationService';
import { getAgedReceivables } from '../src/services/accountingService';
import { getFinanceStats, getFinancialReport } from '../src/controllers/paymentController';

const createResponse = (): Response => {
  const response: any = {};
  response.status = jest.fn(() => response);
  response.json = jest.fn(() => response);
  response.send = jest.fn(() => response);
  return response as Response;
};

const responseJson = (response: Response): any =>
  (response.json as unknown as jest.Mock).mock.calls[0][0];

const createDatabase = (rows: unknown) => {
  const queryRaw = jest.fn(async (_query: Prisma.Sql) => rows) as any;
  return {
    database: { $queryRaw: queryRaw } as financialAggregations.FinancialAggregateDatabase,
    queryRaw,
  };
};

const sqlText = (queryRaw: jest.Mock): string =>
  (queryRaw.mock.calls[0][0] as Prisma.Sql).text;

const sqlValues = (queryRaw: jest.Mock): unknown[] =>
  (queryRaw.mock.calls[0][0] as Prisma.Sql).values;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('F-004 / T-009 / TV-014 financial database aggregations', () => {
  it('defines composite indexes for tenant-scoped financial report predicates', () => {
    const migration = fs.readFileSync(path.resolve(
      __dirname,
      '../prisma/migrations/20260909170000_add_financial_aggregation_indexes/migration.sql',
    ), 'utf8');

    expect(migration).toContain('"student_fee_structures"("tenantId", "studentId")');
    expect(migration).toContain('"payments"("tenantId", "status", "studentId")');
    expect(migration).toContain('"payments"("tenantId", "status", "paymentDate")');
    expect(migration).toContain('"journal_entries"("tenantId", "isPosted", "date")');

    const ledgerMigration = fs.readFileSync(path.resolve(
      __dirname,
      '../prisma/migrations/20260909173000_optimize_financial_ledger_aggregation/migration.sql',
    ), 'utf8');
    expect(ledgerMigration).toContain('"journal_entries"("tenantId", "branchId", "isPosted", "date")');
    expect(ledgerMigration).toContain('"journal_entry_lines"("tenantId", "journalId", "accountId")');
  });

  it('requires tenant context before issuing raw financial queries', async () => {
    const { database, queryRaw } = createDatabase([]);

    await expect(getFinanceOverviewAggregates(undefined, database))
      .rejects.toThrow('Tenant context required for financial aggregation');
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('aggregates fee and payment totals independently with explicit tenant and branch scope', async () => {
    const { database, queryRaw } = createDatabase([{
      totalFeesAssigned: new Prisma.Decimal('1025.50'),
      totalFeeAmountPaid: new Prisma.Decimal('400.25'),
      overdueCount: BigInt(7),
    }]);

    const result = await runWithTenant('tenant-a', () =>
      getFinanceOverviewAggregates('branch-a', database));

    expect(result).toEqual({
      totalFeesAssigned: 1025.5,
      totalFeeAmountPaid: 400.25,
      overdueCount: 7,
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);

    const query = sqlText(queryRaw);
    expect(query).toContain('WITH eligible_students AS');
    expect(query).toContain('fee_totals AS');
    expect(query).toContain('payment_totals AS');
    expect(query).toContain('sfs."tenantId" =');
    expect(query).toContain('p."tenantId" =');
    expect(query).toContain('s."branchId" =');
    expect(query).toContain('p."branchId" =');
    expect(sqlValues(queryRaw)).toEqual(expect.arrayContaining(['tenant-a', 'branch-a']));
  });

  it('returns one normalized receivable row per student and preserves ageing buckets', async () => {
    const asOfDate = new Date('2026-09-09T12:00:00.000Z');
    const { database, queryRaw } = createDatabase([
      {
        studentId: 'student-1', studentName: 'Ada One', admissionNumber: 'A-1', className: 'Grade 1',
        totalDue: '500.00', totalPaid: '100.00', balance: '400.00', ageDays: 15,
        bucket: '1-30', guardianPhone: '260970000001', guardianEmail: 'one@example.test',
      },
      {
        studentId: 'student-2', studentName: 'Ben Two', admissionNumber: 'A-2', className: 'Grade 2',
        totalDue: new Prisma.Decimal('900.00'), totalPaid: new Prisma.Decimal('250.00'),
        balance: new Prisma.Decimal('650.00'), ageDays: 95, bucket: '90+',
        guardianPhone: null, guardianEmail: null,
      },
    ]);

    const result = await runWithTenant('tenant-a', () =>
      getAgedReceivablesAggregates('branch-a', asOfDate, database));

    expect(result).toEqual({
      receivables: [
        expect.objectContaining({ studentId: 'student-1', totalDue: 500, totalPaid: 100, balance: 400, bucket: '1-30' }),
        expect.objectContaining({ studentId: 'student-2', totalDue: 900, totalPaid: 250, balance: 650, bucket: '90+' }),
      ],
      summary: {
        current: 0,
        '1-30': 400,
        '31-60': 0,
        '61-90': 0,
        '90+': 650,
        total: 1050,
      },
      studentCount: 2,
      generatedAt: asOfDate,
    });

    const query = sqlText(queryRaw);
    expect(query).toContain('FROM student_fee_structures sfs');
    expect(query).toContain('FROM payments p');
    expect(query).toContain('sfs."tenantId" =');
    expect(query).toContain('p."tenantId" =');
    expect(query).toContain('s."tenantId" =');
    expect(query).toContain('c."tenantId" =');
    expect(query).toContain('ORDER BY balance DESC');
  });

  it('zero-fills monthly revenue and computes class percentages from aggregate rows', async () => {
    const monthlyDatabase = createDatabase([
      { month: 1, amount: new Prisma.Decimal('125.50') },
      { month: 12, amount: '500.00' },
    ]);
    const classDatabase = createDatabase([
      { className: 'Grade 1', totalDue: '1000', totalCollected: '755' },
      { className: 'Grade 2', totalDue: '0', totalCollected: '0' },
    ]);
    const trendDatabase = createDatabase([
      { month: '2026-07', total: '10.50' },
      { month: '2026-08', total: new Prisma.Decimal('20.25') },
    ]);

    const result = await runWithTenant('tenant-a', async () => ({
      months: await getMonthlyRevenueAggregates(
        new Date('2026-01-01T00:00:00.000Z'),
        new Date('2026-12-31T23:59:59.999Z'),
        'branch-a',
        monthlyDatabase.database,
      ),
      classes: await getClassCollectionAggregates('branch-a', classDatabase.database),
      trend: await getRecentMonthlyRevenueTrend(
        new Date('2026-07-01T00:00:00.000Z'),
        'branch-a',
        trendDatabase.database,
      ),
    }));

    expect(result.months).toHaveLength(12);
    expect(result.months[0]).toBe(125.5);
    expect(result.months.slice(1, 11)).toEqual(new Array(10).fill(0));
    expect(result.months[11]).toBe(500);
    expect(result.classes).toEqual([
      { className: 'Grade 1', totalDue: 1000, totalCollected: 755, percentage: 76 },
      { className: 'Grade 2', totalDue: 0, totalCollected: 0, percentage: 0 },
    ]);
    expect(result.trend).toEqual([
      { month: '2026-07', total: 10.5 },
      { month: '2026-08', total: 20.25 },
    ]);

    expect(sqlText(classDatabase.queryRaw)).toContain('WITH fee_totals AS');
    expect(sqlText(classDatabase.queryRaw)).toContain('payment_totals AS');
    expect(sqlText(monthlyDatabase.queryRaw)).toContain('GROUP BY EXTRACT(MONTH');
    expect(sqlText(trendDatabase.queryRaw)).toContain("DATE_TRUNC('month'");
  });

  it('preserves ledger sign conventions with one grouped query per statement', async () => {
    const ledgerRows = [
      { accountCode: '1000', accountName: 'Cash', accountType: 'ASSET', debit: '900', credit: '100' },
      { accountCode: '2000', accountName: 'Payable', accountType: 'LIABILITY', debit: '50', credit: '300' },
      { accountCode: '3000', accountName: 'Equity', accountType: 'EQUITY', debit: '0', credit: '550' },
      { accountCode: '4000', accountName: 'Fees', accountType: 'INCOME', debit: '20', credit: '700' },
      { accountCode: '5000', accountName: 'Supplies', accountType: 'EXPENSE', debit: '250', credit: '10' },
    ];
    const trialDatabase = createDatabase(ledgerRows);
    const incomeDatabase = createDatabase(ledgerRows);
    const balanceDatabase = createDatabase(ledgerRows);
    const startDate = new Date('2026-01-01T00:00:00.000Z');
    const endDate = new Date('2026-12-31T23:59:59.999Z');

    const statements = await runWithTenant('tenant-a', async () => ({
      trial: await getTrialBalanceAggregates(startDate, endDate, 'branch-a', trialDatabase.database),
      income: await getIncomeStatementAggregates(startDate, endDate, 'branch-a', incomeDatabase.database),
      balance: await getBalanceSheetAggregates(endDate, 'branch-a', balanceDatabase.database),
    }));

    expect(statements.trial[0]).toEqual(expect.objectContaining({ debit: 900, credit: 100, balance: 800 }));
    expect(statements.income).toEqual(expect.objectContaining({
      totalIncome: 680,
      totalExpenses: 240,
      netIncome: 440,
    }));
    expect(statements.balance).toEqual(expect.objectContaining({
      totalAssets: 800,
      totalLiabilities: 250,
      totalEquity: 550,
    }));
    expect(trialDatabase.queryRaw).toHaveBeenCalledTimes(1);
    expect(incomeDatabase.queryRaw).toHaveBeenCalledTimes(1);
    expect(balanceDatabase.queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlText(trialDatabase.queryRaw)).toContain('posted_entries AS MATERIALIZED');
    expect(sqlText(trialDatabase.queryRaw)).toContain('GROUP BY jel."accountId"');
    expect(sqlText(trialDatabase.queryRaw)).toContain('jel."tenantId" =');
    expect(sqlText(trialDatabase.queryRaw)).toContain('je."tenantId" =');
    expect(sqlText(trialDatabase.queryRaw)).toContain('coa."tenantId" =');
  });

  it('keeps report endpoints on aggregate queries instead of full financial relation loads', async () => {
    const monthlyRevenue = [100, ...new Array(11).fill(0)];
    const classCollection = [{ className: 'Grade 1', totalDue: 500, totalCollected: 250, percentage: 50 }];
    jest.spyOn(financialAggregations, 'getMonthlyRevenueAggregates').mockResolvedValue(monthlyRevenue);
    jest.spyOn(financialAggregations, 'getClassCollectionAggregates').mockResolvedValue(classCollection);
    jest.spyOn(prisma.payment, 'groupBy').mockResolvedValue([{
      method: 'CASH', _count: { id: 2 }, _sum: { amount: new Prisma.Decimal(100) },
    }] as any);
    const paymentRows = jest.spyOn(prisma.payment, 'findMany');
    const classRows = jest.spyOn(prisma.class, 'findMany');
    const response = createResponse();

    await runWithTenant('tenant-a', () => getFinancialReport({
      query: { startDate: '2026-01-01', endDate: '2026-12-31' },
      user: { role: 'BURSAR', branchId: 'branch-a' },
    } as unknown as Request, response));

    expect(paymentRows).not.toHaveBeenCalled();
    expect(classRows).not.toHaveBeenCalled();
    expect(financialAggregations.getMonthlyRevenueAggregates)
      .toHaveBeenCalledWith(expect.any(Date), expect.any(Date), 'branch-a');
    expect(financialAggregations.getClassCollectionAggregates).toHaveBeenCalledWith('branch-a');
    expect(responseJson(response)).toEqual({
      monthlyRevenue,
      paymentMethods: [{ method: 'CASH', count: 2, amount: 100 }],
      classCollection,
    });
  });

  it('uses one overview aggregate for branch-scoped fees and overdue students', async () => {
    jest.spyOn(financialAggregations, 'getFinanceOverviewAggregates').mockResolvedValue({
      totalFeesAssigned: 1000,
      totalFeeAmountPaid: 400,
      overdueCount: 3,
    });
    jest.spyOn(prisma.payment, 'aggregate').mockResolvedValue({
      _sum: { amount: new Prisma.Decimal(350) },
      _count: { id: 4 },
    } as any);
    const recentRows = jest.spyOn(prisma.payment, 'findMany').mockResolvedValue([{
      id: 'payment-1', amount: new Prisma.Decimal(50), paymentDate: new Date('2026-09-01'),
      status: 'COMPLETED', student: { firstName: 'Ada', lastName: 'One' },
    }] as any);
    const feeAggregate = jest.spyOn(prisma.studentFeeStructure, 'aggregate');
    const feeGroups = jest.spyOn(prisma.studentFeeStructure, 'groupBy');
    const paymentGroups = jest.spyOn(prisma.payment, 'groupBy');
    const response = createResponse();

    await runWithTenant('tenant-a', () => getFinanceStats({
      query: {},
      user: { role: 'BURSAR', branchId: 'branch-a' },
    } as unknown as Request, response));

    expect(financialAggregations.getFinanceOverviewAggregates).toHaveBeenCalledWith('branch-a');
    expect(feeAggregate).not.toHaveBeenCalled();
    expect(feeGroups).not.toHaveBeenCalled();
    expect(paymentGroups).not.toHaveBeenCalled();
    expect(recentRows).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    expect(responseJson(response)).toEqual(expect.objectContaining({
      totalRevenue: 350,
      totalTransactions: 4,
      pendingFees: 650,
      overdueCount: 3,
    }));
  });

  it('routes aged receivables through one aggregate query instead of student relation trees', async () => {
    const aggregateResult = {
      receivables: [],
      summary: { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0 },
      studentCount: 0,
      generatedAt: new Date('2026-09-09T00:00:00.000Z'),
    };
    jest.spyOn(financialAggregations, 'getAgedReceivablesAggregates').mockResolvedValue(aggregateResult);
    const studentRows = jest.spyOn(prisma.student, 'findMany');

    const result = await runWithTenant('tenant-a', () => getAgedReceivables('branch-a'));

    expect(result).toBe(aggregateResult);
    expect(financialAggregations.getAgedReceivablesAggregates).toHaveBeenCalledWith('branch-a');
    expect(studentRows).not.toHaveBeenCalled();
  });
});
