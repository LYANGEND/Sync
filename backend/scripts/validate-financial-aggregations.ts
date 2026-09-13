import crypto from 'crypto';
import { performance } from 'perf_hooks';
import { Prisma } from '@prisma/client';
import { runWithTenant } from '../src/middleware/tenantContext';
import { systemPrisma } from '../src/utils/prisma';
import {
  FinancialAggregateDatabase,
  getAgedReceivablesAggregates,
  getBalanceSheetAggregates,
  getClassCollectionAggregates,
  getFinanceOverviewAggregates,
  getIncomeStatementAggregates,
  getMonthlyRevenueAggregates,
  getRecentMonthlyRevenueTrend,
  getTrialBalanceAggregates,
} from '../src/services/financialAggregationService';

const LOAD_STUDENTS = 1_000;
const LOAD_FEES_PER_STUDENT = 4;
const LOAD_PAYMENTS_PER_STUDENT = 4;
const LOAD_LEDGER_ACCOUNTS = 20;
const LOAD_JOURNAL_ENTRIES = 200;
const LOAD_JOURNAL_LINES = 10_000;

interface CapturedQuery {
  label: string;
  query: Prisma.Sql;
  durationMs: number;
  heapDeltaBytes: number;
  returnedRows: number;
}

interface ExplainNode {
  'Node Type'?: string;
  'Index Name'?: string;
  Plans?: ExplainNode[];
}

interface ExplainDocument {
  Plan?: ExplainNode;
}

interface ExplainRow {
  'QUERY PLAN': ExplainDocument[];
}

interface ValidationDatabase extends FinancialAggregateDatabase {
  $executeRaw(query: Prisma.Sql): Promise<number>;
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

class RollbackValidation extends Error {
  constructor(readonly report: unknown) {
    super('Rollback financial aggregation validation data');
  }
}

class ProfilingDatabase implements FinancialAggregateDatabase {
  private label = 'unlabelled';
  readonly queries: CapturedQuery[] = [];

  constructor(private readonly database: FinancialAggregateDatabase) {}

  setLabel(label: string): void {
    this.label = label;
  }

  async $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> {
    const heapBefore = process.memoryUsage().heapUsed;
    const startedAt = performance.now();
    const result = await this.database.$queryRaw<T>(query);
    const durationMs = performance.now() - startedAt;
    const returnedRows = Array.isArray(result) ? result.length : 1;

    this.queries.push({
      label: this.label,
      query,
      durationMs,
      heapDeltaBytes: Math.max(0, process.memoryUsage().heapUsed - heapBefore),
      returnedRows,
    });
    return result;
  }
}

const fingerprint = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);

const collectPlanDetails = (node: ExplainNode | undefined, details: string[] = []): string[] => {
  if (!node) return details;
  const index = node['Index Name'] ? `:${node['Index Name']}` : '';
  details.push(`${node['Node Type'] || 'Unknown'}${index}`);
  node.Plans?.forEach(child => collectPlanDetails(child, details));
  return details;
};

const explain = async (captured: CapturedQuery, database: ValidationDatabase) => {
  const rows = await database.$queryRawUnsafe<ExplainRow[]>(
    `EXPLAIN (FORMAT JSON) ${captured.query.text}`,
    ...captured.query.values,
  );
  const document = rows[0]?.['QUERY PLAN']?.[0] || {};
  return {
    label: captured.label,
    nodes: collectPlanDetails(document.Plan),
  };
};

const cleanupStalePeakFixtures = async (database: ValidationDatabase) => {
  await database.$executeRaw(Prisma.sql`DELETE FROM journal_entry_lines WHERE id LIKE 'tv014-line-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM journal_entries WHERE id LIKE 'tv014-journal-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM chart_of_accounts WHERE id LIKE 'tv014-account-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM payments WHERE id LIKE 'tv014-payment-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM student_fee_structures WHERE id LIKE 'tv014-fee-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM fee_templates WHERE id LIKE 'tv014-template-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM students WHERE id LIKE 'tv014-student-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM classes WHERE id LIKE 'tv014-class-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM academic_terms WHERE id LIKE 'tv014-term-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM users WHERE id LIKE 'tv014-teacher-%'`);
  await database.$executeRaw(Prisma.sql`DELETE FROM branches WHERE id LIKE 'tv014-branch-%'`);
};

const createPeakFixture = async (tenantId: string, database: ValidationDatabase) => {
  const suffix = crypto.randomBytes(6).toString('hex');
  const branchId = `tv014-branch-${suffix}`;
  const classId = `tv014-class-${suffix}`;
  const teacherId = `tv014-teacher-${suffix}`;
  const termId = `tv014-term-${suffix}`;

  await database.$executeRaw(Prisma.sql`
    INSERT INTO branches (id, name, code, status, "createdAt", "updatedAt", "tenantId")
    VALUES (
      ${branchId}, 'TV-014 Peak Branch', ${`TV14-${suffix}`}, 'ACTIVE'::"BranchStatus",
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${tenantId}
    )
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO users (
      id, "fullName", email, "passwordHash", role, "isActive", "createdAt", "updatedAt", "tenantId", "branchId"
    ) VALUES (
      ${teacherId}, 'TV-014 Teacher', ${`tv014-${suffix}@example.test`}, 'validation-only',
      'TEACHER'::"Role", TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
      ${tenantId}, ${branchId}
    )
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO academic_terms (
      id, name, "startDate", "endDate", "isActive", "tenantId"
    ) VALUES (
      ${termId}, 'TV-014 Term', CURRENT_TIMESTAMP - INTERVAL '1 year',
      CURRENT_TIMESTAMP + INTERVAL '1 year', FALSE, ${tenantId}
    )
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO classes (
      id, name, "gradeLevel", "teacherId", "academicTermId", "branchId", "tenantId"
    ) VALUES (
      ${classId}, 'TV-014 Peak Class', 99, ${teacherId}, ${termId}, ${branchId}, ${tenantId}
    )
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO students (
      id, "admissionNumber", "firstName", "lastName", "dateOfBirth", gender, status,
      "createdAt", "updatedAt", "classId", "branchId", "tenantId"
    )
    SELECT
      ${`tv014-student-${suffix}-`} || n,
      ${`TV14-${suffix}-`} || n,
      'Peak',
      'Student ' || n,
      DATE '2015-01-01',
      'MALE'::"Gender",
      'ACTIVE'::"StudentStatus",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      ${classId},
      ${branchId},
      ${tenantId}
    FROM generate_series(1, ${LOAD_STUDENTS}) AS n
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO fee_templates (
      id, name, amount, "academicTermId", "applicableGrade", "tenantId"
    )
    SELECT
      ${`tv014-template-${suffix}-`} || f,
      'TV-014 Fee ' || f,
      1000.00,
      ${termId},
      99,
      ${tenantId}
    FROM generate_series(1, ${LOAD_FEES_PER_STUDENT}) AS f
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO student_fee_structures (
      id, "studentId", "feeTemplateId", "amountDue", "amountPaid", "dueDate",
      "createdAt", "updatedAt", "academicTermId", "tenantId"
    )
    SELECT
      ${`tv014-fee-${suffix}-`} || s || '-' || f,
      ${`tv014-student-${suffix}-`} || s,
      ${`tv014-template-${suffix}-`} || f,
      1000.00,
      250.00,
      CURRENT_TIMESTAMP - ((f * 35) || ' days')::interval,
      CURRENT_TIMESTAMP - ((f * 35) || ' days')::interval,
      CURRENT_TIMESTAMP,
      ${termId},
      ${tenantId}
    FROM generate_series(1, ${LOAD_STUDENTS}) AS s
    CROSS JOIN generate_series(1, ${LOAD_FEES_PER_STUDENT}) AS f
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO payments (
      id, "transactionId", "studentId", amount, "paymentDate", method, status,
      "createdAt", "branchId", "tenantId"
    )
    SELECT
      ${`tv014-payment-${suffix}-`} || s || '-' || p,
      ${`TV14-TXN-${suffix}-`} || s || '-' || p,
      ${`tv014-student-${suffix}-`} || s,
      250.00,
      CURRENT_TIMESTAMP - ((p * 20) || ' days')::interval,
      'CASH'::"PaymentMethod",
      'COMPLETED'::"PaymentStatus",
      CURRENT_TIMESTAMP,
      ${branchId},
      ${tenantId}
    FROM generate_series(1, ${LOAD_STUDENTS}) AS s
    CROSS JOIN generate_series(1, ${LOAD_PAYMENTS_PER_STUDENT}) AS p
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO chart_of_accounts (
      id, code, name, type, "isActive", "isSystem", "branchId", "createdAt", "updatedAt", "tenantId"
    )
    SELECT
      ${`tv014-account-${suffix}-`} || a,
      'TV14-' || ${suffix} || '-' || LPAD(a::text, 3, '0'),
      'TV-014 Account ' || a,
      CASE
        WHEN a % 5 = 0 THEN 'ASSET'::"AccountType"
        WHEN a % 5 = 1 THEN 'LIABILITY'::"AccountType"
        WHEN a % 5 = 2 THEN 'EQUITY'::"AccountType"
        WHEN a % 5 = 3 THEN 'INCOME'::"AccountType"
        ELSE 'EXPENSE'::"AccountType"
      END,
      TRUE,
      FALSE,
      ${branchId},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      ${tenantId}
    FROM generate_series(1, ${LOAD_LEDGER_ACCOUNTS}) AS a
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO journal_entries (
      id, "entryNumber", date, description, "isPosted", "postedAt", "branchId",
      "createdAt", "updatedAt", "tenantId"
    )
    SELECT
      ${`tv014-journal-${suffix}-`} || j,
      ${`TV14-JE-${suffix}-`} || j,
      CURRENT_TIMESTAMP - ((j % 365) || ' days')::interval,
      'TV-014 peak validation entry',
      TRUE,
      CURRENT_TIMESTAMP,
      ${branchId},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      ${tenantId}
    FROM generate_series(1, ${LOAD_JOURNAL_ENTRIES}) AS j
  `);
  await database.$executeRaw(Prisma.sql`
    INSERT INTO journal_entry_lines (
      id, "journalId", "accountId", debit, credit, "createdAt", "tenantId"
    )
    SELECT
      ${`tv014-line-${suffix}-`} || j,
      ${`tv014-journal-${suffix}-`} || ((j - 1) % ${LOAD_JOURNAL_ENTRIES} + 1),
      ${`tv014-account-${suffix}-`} || ((j - 1) % ${LOAD_LEDGER_ACCOUNTS} + 1),
      CASE WHEN j % 2 = 0 THEN 100.00 ELSE 0.00 END,
      CASE WHEN j % 2 = 1 THEN 100.00 ELSE 0.00 END,
      CURRENT_TIMESTAMP,
      ${tenantId}
    FROM generate_series(1, ${LOAD_JOURNAL_LINES}) AS j
  `);

  return { branchId };
};

const runProfile = async (
  tenantId: string,
  branchId: string | undefined,
  peak: boolean,
  validationDatabase: ValidationDatabase,
) => {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 6, 1));
  const database = new ProfilingDatabase(validationDatabase);
  const profile = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    database.setLabel(label);
    return operation();
  };

  const results = await runWithTenant(tenantId, async () => ({
    overview: await profile('finance-overview', () => getFinanceOverviewAggregates(branchId, database)),
    aged: await profile('aged-receivables', () => getAgedReceivablesAggregates(branchId, now, database)),
    monthly: await profile('monthly-revenue', () => getMonthlyRevenueAggregates(yearStart, now, branchId, database)),
    classes: await profile('class-collection', () => getClassCollectionAggregates(branchId, database)),
    trial: await profile('trial-balance', () => getTrialBalanceAggregates(yearStart, now, branchId, database)),
    income: await profile('income-statement', () => getIncomeStatementAggregates(yearStart, now, branchId, database)),
    balance: await profile('balance-sheet', () => getBalanceSheetAggregates(now, branchId, database)),
    trend: await profile('recent-revenue-trend', () => getRecentMonthlyRevenueTrend(trendStart, branchId, database)),
  }));

  const plans = [];
  for (const query of database.queries) plans.push(await explain(query, validationDatabase));
  const financialIndexRows = await validationDatabase.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'students_tenantId_branchId_status_idx',
          'student_fee_structures_tenantId_studentId_idx',
          'payments_tenantId_status_studentId_idx',
          'payments_tenantId_status_paymentDate_idx',
          'journal_entries_tenantId_isPosted_date_idx',
          'journal_entries_tenantId_branchId_isPosted_date_idx',
          'journal_entry_lines_tenantId_journalId_accountId_idx'
        )`,
  );

  const tenantPredicateCoverage = database.queries.every(query => query.query.text.includes('"tenantId"'));
  const queryCountBounded = database.queries.length === 8;
  const monthlyContractPreserved = results.monthly.length === 12;
  const responseBytes = Buffer.byteLength(JSON.stringify(results));
  const totalDurationMs = database.queries.reduce((sum, query) => sum + query.durationMs, 0);
  const maximumHeapDeltaBytes = database.queries.reduce(
    (maximum, query) => Math.max(maximum, query.heapDeltaBytes),
    0,
  );
  const expectedMinimumSourceRows = peak
    ? LOAD_STUDENTS * (LOAD_FEES_PER_STUDENT + LOAD_PAYMENTS_PER_STUDENT) + LOAD_JOURNAL_LINES
    : 0;
  const sourceRows = peak ? {
    studentFees: LOAD_STUDENTS * LOAD_FEES_PER_STUDENT,
    payments: LOAD_STUDENTS * LOAD_PAYMENTS_PER_STUDENT,
    journalLines: LOAD_JOURNAL_LINES,
    activeStudents: LOAD_STUDENTS,
    classes: 1,
  } : {
    studentFees: await systemPrisma.studentFeeStructure.count({ where: { tenantId } }),
    payments: await systemPrisma.payment.count({ where: { tenantId } }),
    journalLines: await systemPrisma.journalEntryLine.count({ where: { tenantId } }),
    activeStudents: await systemPrisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
    classes: await systemPrisma.class.count({ where: { tenantId } }),
  };
  const sourceFactRows = sourceRows.studentFees + sourceRows.payments + sourceRows.journalLines;
  const aggregateFactRows = results.aged.studentCount
    + results.classes.length
    + results.trial.length
    + results.income.income.length
    + results.income.expenses.length
    + results.balance.assets.length
    + results.balance.liabilities.length
    + results.balance.equity.length
    + results.trend.length
    + results.monthly.length
    + 1;
  const aggregateReduction = sourceFactRows > 0 ? 1 - (aggregateFactRows / sourceFactRows) : 1;
  const financialIndexesPresent = Number(financialIndexRows[0]?.count || 0) === 7;
  const datasetLargeEnough = sourceFactRows >= expectedMinimumSourceRows;

  return {
    passed: tenantPredicateCoverage
      && queryCountBounded
      && monthlyContractPreserved
      && financialIndexesPresent
      && datasetLargeEnough,
    mode: peak ? 'transaction-local-peak' : 'existing-data',
    branch: branchId ? fingerprint(branchId) : 'all-branches',
    sourceRows,
    aggregateRows: {
      agedReceivables: results.aged.studentCount,
      classCollection: results.classes.length,
      trialBalance: results.trial.length,
      incomeAccounts: results.income.income.length + results.income.expenses.length,
      balanceSheetAccounts:
        results.balance.assets.length + results.balance.liabilities.length + results.balance.equity.length,
      recentRevenueMonths: results.trend.length,
      fixedMonthlyBuckets: results.monthly.length,
    },
    overview: results.overview,
    profile: {
      queryCount: database.queries.length,
      totalDurationMs: Number(totalDurationMs.toFixed(3)),
      maximumHeapDeltaBytes,
      responseBytes,
      aggregateReductionPercent: Number((aggregateReduction * 100).toFixed(3)),
      queries: database.queries.map(query => ({
        label: query.label,
        durationMs: Number(query.durationMs.toFixed(3)),
        heapDeltaBytes: query.heapDeltaBytes,
        returnedRows: query.returnedRows,
      })),
    },
    plans,
    assertions: {
      tenantPredicateCoverage,
      queryCountBounded,
      monthlyContractPreserved,
      financialIndexesPresent,
      datasetLargeEnough,
    },
  };
};

const main = async () => {
  const configuredTenantId = process.env.FINANCIAL_VALIDATION_TENANT_ID?.trim();
  const tenant = configuredTenantId
    ? await systemPrisma.tenant.findFirst({
      where: { id: configuredTenantId, status: 'ACTIVE' },
      select: { id: true },
    })
    : await systemPrisma.tenant.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

  if (!tenant) {
    throw new Error('No active tenant is available for financial aggregation validation');
  }

  const rootDatabase = systemPrisma as unknown as ValidationDatabase;
  await cleanupStalePeakFixtures(rootDatabase);

  const usePeakFixture = process.env.FINANCIAL_VALIDATION_EXISTING_DATA_ONLY !== 'true';
  let report: any;
  if (usePeakFixture) {
    try {
      await systemPrisma.$transaction(async transaction => {
        const database = transaction as unknown as ValidationDatabase;
        const fixture = await createPeakFixture(tenant.id, database);
        throw new RollbackValidation(await runProfile(tenant.id, fixture.branchId, true, database));
      }, { timeout: 300_000 });
    } catch (error) {
      if (error instanceof RollbackValidation) report = error.report;
      else throw error;
    }
  } else {
    report = await runProfile(tenant.id, undefined, false, rootDatabase);
  }

  report = {
    ...report,
    tenant: fingerprint(tenant.id),
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
};

main()
  .catch(error => {
    console.error('Financial aggregation validation failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await systemPrisma.$disconnect();
  });
