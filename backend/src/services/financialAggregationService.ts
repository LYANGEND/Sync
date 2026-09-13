import { Prisma } from '@prisma/client';
import { getCurrentTenantId } from '../middleware/tenantContext';
import { prisma } from '../utils/prisma';

export interface FinancialAggregateDatabase {
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>;
}

type NumericDatabaseValue = Prisma.Decimal | bigint | number | string | null | undefined;
type ReceivableBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';
type LedgerAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

interface LedgerAggregateRow {
  accountCode: string;
  accountName: string;
  accountType: LedgerAccountType;
  debit: NumericDatabaseValue;
  credit: NumericDatabaseValue;
}

interface AgedReceivableRow {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string | null;
  totalDue: NumericDatabaseValue;
  totalPaid: NumericDatabaseValue;
  balance: NumericDatabaseValue;
  ageDays: NumericDatabaseValue;
  bucket: ReceivableBucket;
  guardianPhone: string | null;
  guardianEmail: string | null;
}

interface FinanceOverviewRow {
  totalFeesAssigned: NumericDatabaseValue;
  totalFeeAmountPaid: NumericDatabaseValue;
  overdueCount: NumericDatabaseValue;
}

interface MonthlyRevenueRow {
  month: NumericDatabaseValue;
  amount: NumericDatabaseValue;
}

interface ClassCollectionRow {
  className: string;
  totalDue: NumericDatabaseValue;
  totalCollected: NumericDatabaseValue;
}

interface RevenueTrendRow {
  month: string;
  total: NumericDatabaseValue;
}

export interface TrialBalanceEntry {
  accountCode: string;
  accountName: string;
  accountType: LedgerAccountType;
  debit: number;
  credit: number;
  balance: number;
}

export interface AgedReceivable {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  ageDays: number;
  bucket: ReceivableBucket;
  guardianPhone: string | null;
  guardianEmail: string | null;
}

export interface ClassCollectionAggregate {
  className: string;
  totalDue: number;
  totalCollected: number;
  percentage: number;
}

const toNumber = (value: NumericDatabaseValue, field: string): number => {
  const normalized = Number(value ?? 0);
  if (!Number.isFinite(normalized)) {
    throw new Error(`Financial aggregation returned an invalid ${field}`);
  }
  return normalized;
};

const requireTenantId = (): string => {
  const tenantId = getCurrentTenantId();
  if (!tenantId) throw new Error('Tenant context required for financial aggregation');
  return tenantId;
};

const studentBranchPredicate = (branchId?: string): Prisma.Sql => branchId
  ? Prisma.sql`AND s."branchId" = ${branchId}`
  : Prisma.empty;

const paymentStudentBranchPredicate = (branchId?: string): Prisma.Sql => branchId
  ? Prisma.sql`AND payment_student."branchId" = ${branchId}`
  : Prisma.empty;

const classBranchPredicate = (branchId?: string): Prisma.Sql => branchId
  ? Prisma.sql`AND c."branchId" = ${branchId}`
  : Prisma.empty;

const paymentBranchPredicate = (branchId?: string): Prisma.Sql => branchId
  ? Prisma.sql`AND p."branchId" = ${branchId}`
  : Prisma.empty;

const accountBranchPredicate = (branchId?: string): Prisma.Sql => branchId
  ? Prisma.sql`AND coa."branchId" = ${branchId}`
  : Prisma.empty;

const journalBranchPredicate = (branchId?: string): Prisma.Sql => branchId
  ? Prisma.sql`AND je."branchId" = ${branchId}`
  : Prisma.empty;

/**
 * Aggregates posted journal lines to one row per account. Every tenant-owned
 * relation is explicitly scoped because Prisma middleware cannot rewrite raw SQL.
 */
export const queryLedgerAggregates = async (
  startDate: Date | null,
  endDate: Date,
  branchId?: string,
  accountTypes?: LedgerAccountType[],
  database: FinancialAggregateDatabase = prisma,
): Promise<LedgerAggregateRow[]> => {
  const tenantId = requireTenantId();
  const startPredicate = startDate ? Prisma.sql`AND je.date >= ${startDate}` : Prisma.empty;
  const typePredicate = accountTypes?.length
    ? Prisma.sql`AND coa.type::text IN (${Prisma.join(accountTypes)})`
    : Prisma.empty;

  return database.$queryRaw<LedgerAggregateRow[]>(Prisma.sql`
    WITH posted_entries AS MATERIALIZED (
      SELECT je.id
      FROM journal_entries je
      WHERE je."tenantId" = ${tenantId}
        AND je."isPosted" = TRUE
        ${startPredicate}
        AND je.date <= ${endDate}
        ${journalBranchPredicate(branchId)}
    ), account_movements AS MATERIALIZED (
      SELECT
        jel."accountId",
        SUM(jel.debit) AS debit,
        SUM(jel.credit) AS credit
      FROM journal_entry_lines jel
      INNER JOIN posted_entries pe ON pe.id = jel."journalId"
      WHERE jel."tenantId" = ${tenantId}
      GROUP BY jel."accountId"
    )
    SELECT
      coa.code AS "accountCode",
      coa.name AS "accountName",
      coa.type::text AS "accountType",
      am.debit,
      am.credit
    FROM chart_of_accounts coa
    INNER JOIN account_movements am ON am."accountId" = coa.id
    WHERE coa."tenantId" = ${tenantId}
      AND coa."isActive" = TRUE
      ${accountBranchPredicate(branchId)}
      ${typePredicate}
      AND (am.debit <> 0 OR am.credit <> 0)
    ORDER BY coa.code ASC
  `);
};

export const getTrialBalanceAggregates = async (
  startDate: Date,
  endDate: Date,
  branchId?: string,
  database: FinancialAggregateDatabase = prisma,
): Promise<TrialBalanceEntry[]> => {
  const rows = await queryLedgerAggregates(startDate, endDate, branchId, undefined, database);
  return rows.map(row => {
    const debit = toNumber(row.debit, 'ledger debit');
    const credit = toNumber(row.credit, 'ledger credit');
    return {
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountType: row.accountType,
      debit,
      credit,
      balance: debit - credit,
    };
  });
};

export const getIncomeStatementAggregates = async (
  startDate: Date,
  endDate: Date,
  branchId?: string,
  database: FinancialAggregateDatabase = prisma,
) => {
  const rows = await queryLedgerAggregates(
    startDate,
    endDate,
    branchId,
    ['INCOME', 'EXPENSE'],
    database,
  );

  const income = rows
    .filter(row => row.accountType === 'INCOME')
    .map(row => ({
      code: row.accountCode,
      name: row.accountName,
      amount: toNumber(row.credit, 'income credit') - toNumber(row.debit, 'income debit'),
    }))
    .filter(row => row.amount !== 0);
  const expenses = rows
    .filter(row => row.accountType === 'EXPENSE')
    .map(row => ({
      code: row.accountCode,
      name: row.accountName,
      amount: toNumber(row.debit, 'expense debit') - toNumber(row.credit, 'expense credit'),
    }))
    .filter(row => row.amount !== 0);
  const totalIncome = income.reduce((sum, row) => sum + row.amount, 0);
  const totalExpenses = expenses.reduce((sum, row) => sum + row.amount, 0);

  return {
    period: { startDate, endDate },
    income,
    totalIncome,
    expenses,
    totalExpenses,
    netIncome: totalIncome - totalExpenses,
  };
};

export const getBalanceSheetAggregates = async (
  asOfDate: Date,
  branchId?: string,
  database: FinancialAggregateDatabase = prisma,
) => {
  const rows = await queryLedgerAggregates(
    null,
    asOfDate,
    branchId,
    ['ASSET', 'LIABILITY', 'EQUITY'],
    database,
  );
  const byType = (type: 'ASSET' | 'LIABILITY' | 'EQUITY') => rows
    .filter(row => row.accountType === type)
    .map(row => ({
      code: row.accountCode,
      name: row.accountName,
      balance: type === 'ASSET'
        ? toNumber(row.debit, 'asset debit') - toNumber(row.credit, 'asset credit')
        : toNumber(row.credit, `${type.toLowerCase()} credit`) - toNumber(row.debit, `${type.toLowerCase()} debit`),
    }))
    .filter(row => row.balance !== 0);

  const assets = byType('ASSET');
  const liabilities = byType('LIABILITY');
  const equity = byType('EQUITY');

  return {
    asOfDate,
    assets,
    totalAssets: assets.reduce((sum, row) => sum + row.balance, 0),
    liabilities,
    totalLiabilities: liabilities.reduce((sum, row) => sum + row.balance, 0),
    equity,
    totalEquity: equity.reduce((sum, row) => sum + row.balance, 0),
  };
};

/**
 * Fee and payment totals are reduced in independent CTEs before they are joined,
 * avoiding multiplication when a student has multiple fees and payments.
 */
export const getAgedReceivablesAggregates = async (
  branchId?: string,
  asOfDate = new Date(),
  database: FinancialAggregateDatabase = prisma,
) => {
  const tenantId = requireTenantId();
  const rows = await database.$queryRaw<AgedReceivableRow[]>(Prisma.sql`
    WITH fee_totals AS (
      SELECT
        sfs."studentId",
        SUM(sfs."amountDue") AS "totalDue",
        MIN(COALESCE(sfs."dueDate", sfs."createdAt"))
          FILTER (WHERE sfs."amountDue" > sfs."amountPaid") AS "earliestDue"
      FROM student_fee_structures sfs
      WHERE sfs."tenantId" = ${tenantId}
      GROUP BY sfs."studentId"
    ), payment_totals AS (
      SELECT p."studentId", SUM(p.amount) AS "totalPaid"
      FROM payments p
      INNER JOIN students payment_student
        ON payment_student.id = p."studentId"
       AND payment_student."tenantId" = ${tenantId}
      WHERE p."tenantId" = ${tenantId}
        AND p.status = 'COMPLETED'::"PaymentStatus"
        ${paymentBranchPredicate(branchId)}
        ${paymentStudentBranchPredicate(branchId)}
      GROUP BY p."studentId"
    ), receivables AS (
      SELECT
        s.id AS "studentId",
        CONCAT_WS(' ', s."firstName", s."lastName") AS "studentName",
        s."admissionNumber",
        c.name AS "className",
        ft."totalDue",
        COALESCE(pt."totalPaid", 0) AS "totalPaid",
        ft."totalDue" - COALESCE(pt."totalPaid", 0) AS balance,
        FLOOR(
          EXTRACT(EPOCH FROM (
            ${asOfDate}::timestamp - COALESCE(ft."earliestDue", ${asOfDate}::timestamp)
          )) / 86400
        )::integer AS "ageDays",
        s."guardianPhone",
        s."guardianEmail"
      FROM fee_totals ft
      INNER JOIN students s
        ON s.id = ft."studentId"
       AND s."tenantId" = ${tenantId}
      INNER JOIN classes c
        ON c.id = s."classId"
       AND c."tenantId" = ${tenantId}
      LEFT JOIN payment_totals pt ON pt."studentId" = s.id
      WHERE s.status = 'ACTIVE'::"StudentStatus"
        ${studentBranchPredicate(branchId)}
        ${classBranchPredicate(branchId)}
        AND ft."totalDue" > COALESCE(pt."totalPaid", 0)
    )
    SELECT
      "studentId",
      "studentName",
      "admissionNumber",
      "className",
      "totalDue",
      "totalPaid",
      balance,
      "ageDays",
      CASE
        WHEN "ageDays" <= 0 THEN 'current'
        WHEN "ageDays" <= 30 THEN '1-30'
        WHEN "ageDays" <= 60 THEN '31-60'
        WHEN "ageDays" <= 90 THEN '61-90'
        ELSE '90+'
      END AS bucket,
      "guardianPhone",
      "guardianEmail"
    FROM receivables
    ORDER BY balance DESC, "studentId" ASC
  `);

  const receivables: AgedReceivable[] = rows.map(row => ({
    studentId: row.studentId,
    studentName: row.studentName,
    admissionNumber: row.admissionNumber,
    className: row.className || 'N/A',
    totalDue: toNumber(row.totalDue, 'receivable total due'),
    totalPaid: toNumber(row.totalPaid, 'receivable total paid'),
    balance: toNumber(row.balance, 'receivable balance'),
    ageDays: toNumber(row.ageDays, 'receivable age'),
    bucket: row.bucket,
    guardianPhone: row.guardianPhone,
    guardianEmail: row.guardianEmail,
  }));
  const summary: Record<ReceivableBucket | 'total', number> = {
    current: 0,
    '1-30': 0,
    '31-60': 0,
    '61-90': 0,
    '90+': 0,
    total: 0,
  };
  receivables.forEach(row => {
    summary[row.bucket] += row.balance;
    summary.total += row.balance;
  });

  return {
    receivables,
    summary,
    studentCount: receivables.length,
    generatedAt: asOfDate,
  };
};

export const getFinanceOverviewAggregates = async (
  branchId?: string,
  database: FinancialAggregateDatabase = prisma,
): Promise<{ totalFeesAssigned: number; totalFeeAmountPaid: number; overdueCount: number }> => {
  const tenantId = requireTenantId();
  const rows = await database.$queryRaw<FinanceOverviewRow[]>(Prisma.sql`
    WITH eligible_students AS (
      SELECT s.id
      FROM students s
      INNER JOIN classes c
        ON c.id = s."classId"
       AND c."tenantId" = ${tenantId}
      WHERE s."tenantId" = ${tenantId}
        ${studentBranchPredicate(branchId)}
        ${classBranchPredicate(branchId)}
    ), fee_totals AS (
      SELECT
        sfs."studentId",
        SUM(sfs."amountDue") AS due,
        SUM(sfs."amountPaid") AS "feeAmountPaid"
      FROM student_fee_structures sfs
      INNER JOIN eligible_students es ON es.id = sfs."studentId"
      WHERE sfs."tenantId" = ${tenantId}
      GROUP BY sfs."studentId"
    ), payment_totals AS (
      SELECT p."studentId", SUM(p.amount) AS paid
      FROM payments p
      INNER JOIN eligible_students es ON es.id = p."studentId"
      WHERE p."tenantId" = ${tenantId}
        AND p.status = 'COMPLETED'::"PaymentStatus"
        ${paymentBranchPredicate(branchId)}
      GROUP BY p."studentId"
    )
    SELECT
      COALESCE(SUM(ft.due), 0) AS "totalFeesAssigned",
      COALESCE(SUM(ft."feeAmountPaid"), 0) AS "totalFeeAmountPaid",
      COUNT(*) FILTER (WHERE ft.due > COALESCE(pt.paid, 0))::bigint AS "overdueCount"
    FROM fee_totals ft
    LEFT JOIN payment_totals pt ON pt."studentId" = ft."studentId"
  `);
  const row = rows[0];
  return {
    totalFeesAssigned: toNumber(row?.totalFeesAssigned, 'total fees assigned'),
    totalFeeAmountPaid: toNumber(row?.totalFeeAmountPaid, 'total fee amount paid'),
    overdueCount: toNumber(row?.overdueCount, 'overdue count'),
  };
};

export const getMonthlyRevenueAggregates = async (
  startDate?: Date,
  endDate?: Date,
  branchId?: string,
  database: FinancialAggregateDatabase = prisma,
): Promise<number[]> => {
  const tenantId = requireTenantId();
  const startPredicate = startDate ? Prisma.sql`AND p."paymentDate" >= ${startDate}` : Prisma.empty;
  const endPredicate = endDate ? Prisma.sql`AND p."paymentDate" <= ${endDate}` : Prisma.empty;
  const rows = await database.$queryRaw<MonthlyRevenueRow[]>(Prisma.sql`
    SELECT
      EXTRACT(MONTH FROM p."paymentDate")::integer AS month,
      SUM(p.amount) AS amount
    FROM payments p
    WHERE p."tenantId" = ${tenantId}
      AND p.status = 'COMPLETED'::"PaymentStatus"
      ${startPredicate}
      ${endPredicate}
      ${paymentBranchPredicate(branchId)}
    GROUP BY EXTRACT(MONTH FROM p."paymentDate")
    ORDER BY month ASC
  `);
  const monthlyRevenue = new Array<number>(12).fill(0);
  rows.forEach(row => {
    const monthIndex = toNumber(row.month, 'revenue month') - 1;
    if (Number.isInteger(monthIndex) && monthIndex >= 0 && monthIndex < monthlyRevenue.length) {
      monthlyRevenue[monthIndex] += toNumber(row.amount, 'monthly revenue');
    }
  });
  return monthlyRevenue;
};

/** Fee and payment CTEs are deliberately separate to preserve aggregate sums. */
export const getClassCollectionAggregates = async (
  branchId?: string,
  database: FinancialAggregateDatabase = prisma,
): Promise<ClassCollectionAggregate[]> => {
  const tenantId = requireTenantId();
  const rows = await database.$queryRaw<ClassCollectionRow[]>(Prisma.sql`
    WITH fee_totals AS (
      SELECT s."classId", SUM(sfs."amountDue") AS "totalDue"
      FROM students s
      INNER JOIN student_fee_structures sfs
        ON sfs."studentId" = s.id
       AND sfs."tenantId" = ${tenantId}
      WHERE s."tenantId" = ${tenantId}
        ${studentBranchPredicate(branchId)}
      GROUP BY s."classId"
    ), payment_totals AS (
      SELECT s."classId", SUM(p.amount) AS "totalCollected"
      FROM students s
      INNER JOIN payments p
        ON p."studentId" = s.id
       AND p."tenantId" = ${tenantId}
       AND p.status = 'COMPLETED'::"PaymentStatus"
      WHERE s."tenantId" = ${tenantId}
        ${studentBranchPredicate(branchId)}
        ${paymentBranchPredicate(branchId)}
      GROUP BY s."classId"
    )
    SELECT
      c.name AS "className",
      COALESCE(ft."totalDue", 0) AS "totalDue",
      COALESCE(pt."totalCollected", 0) AS "totalCollected"
    FROM classes c
    LEFT JOIN fee_totals ft ON ft."classId" = c.id
    LEFT JOIN payment_totals pt ON pt."classId" = c.id
    WHERE c."tenantId" = ${tenantId}
      ${classBranchPredicate(branchId)}
    ORDER BY
      CASE
        WHEN COALESCE(ft."totalDue", 0) > 0
          THEN COALESCE(pt."totalCollected", 0) / ft."totalDue"
        ELSE 0
      END DESC,
      c.name ASC
  `);

  return rows.map(row => {
    const totalDue = toNumber(row.totalDue, 'class total due');
    const totalCollected = toNumber(row.totalCollected, 'class total collected');
    return {
      className: row.className,
      totalDue,
      totalCollected,
      percentage: totalDue > 0 ? Math.round((totalCollected / totalDue) * 100) : 0,
    };
  });
};

export const getRecentMonthlyRevenueTrend = async (
  startDate: Date,
  branchId?: string,
  database: FinancialAggregateDatabase = prisma,
): Promise<Array<{ month: string; total: number }>> => {
  const tenantId = requireTenantId();
  const rows = await database.$queryRaw<RevenueTrendRow[]>(Prisma.sql`
    SELECT
      TO_CHAR(DATE_TRUNC('month', p."paymentDate"), 'YYYY-MM') AS month,
      SUM(p.amount) AS total
    FROM payments p
    WHERE p."tenantId" = ${tenantId}
      AND p.status = 'COMPLETED'::"PaymentStatus"
      AND p."paymentDate" >= ${startDate}
      ${paymentBranchPredicate(branchId)}
    GROUP BY DATE_TRUNC('month', p."paymentDate")
    ORDER BY DATE_TRUNC('month', p."paymentDate") ASC
  `);

  return rows.map(row => ({
    month: row.month,
    total: toNumber(row.total, 'monthly revenue trend'),
  }));
};
