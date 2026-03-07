import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import aiService from '../services/aiService';
import aiUsageTracker from '../services/aiUsageTracker';
import * as convoService from '../services/conversationService';
import {
  getTrialBalance,
  getIncomeStatement,
  getCashFlowSummary,
  getAgedReceivables,
  getBalanceSheet,
} from '../services/accountingService';

// ========================================
// AI FINANCIAL ADVISOR
// ========================================

/**
 * Gather a COMPREHENSIVE financial snapshot — loops through ALL finance data
 * so the AI can answer any question about the school's financial state.
 */
async function gatherFinancialSnapshot(branchId?: string) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  // Date ranges
  const thisMonthStart = new Date(currentYear, currentMonth, 1);
  const lastMonthStart = new Date(currentYear, currentMonth - 1, 1);
  const lastMonthEnd = new Date(currentYear, currentMonth, 0);
  const thisYearStart = new Date(currentYear, 0, 1);

  const branchFilter: any = branchId ? { branchId } : {};

  // ================================================================
  // 1. REVENUE / PAYMENTS — aggregated + recent individual records
  // ================================================================
  const [
    totalRevenueThisMonth,
    totalRevenueLastMonth,
    totalRevenueThisYear,
    revenueByMethod,
    monthlyRevenueTrend,
    recentPayments,
    totalStudents,
    activeStudents,
    totalFeesAssigned,
    agedReceivables,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: { status: 'COMPLETED', paymentDate: { gte: thisMonthStart }, ...branchFilter },
      _sum: { amount: true }, _count: true,
    }),
    prisma.payment.aggregate({
      where: { status: 'COMPLETED', paymentDate: { gte: lastMonthStart, lte: lastMonthEnd }, ...branchFilter },
      _sum: { amount: true }, _count: true,
    }),
    prisma.payment.aggregate({
      where: { status: 'COMPLETED', paymentDate: { gte: thisYearStart }, ...branchFilter },
      _sum: { amount: true }, _count: true,
    }),
    prisma.payment.groupBy({
      by: ['method'],
      where: { status: 'COMPLETED', paymentDate: { gte: thisYearStart }, ...branchFilter },
      _sum: { amount: true }, _count: true,
    }),
    prisma.payment.findMany({
      where: { status: 'COMPLETED', paymentDate: { gte: new Date(currentYear, currentMonth - 6, 1) }, ...branchFilter },
      select: { paymentDate: true, amount: true },
    }),
    // Recent 30 individual payments
    prisma.payment.findMany({
      where: { ...branchFilter },
      orderBy: { paymentDate: 'desc' },
      take: 30,
      select: {
        transactionId: true, amount: true, method: true, status: true, paymentDate: true, notes: true,
        student: { select: { firstName: true, lastName: true, admissionNumber: true } },
        allocations: { select: { amount: true, studentFee: { select: { feeTemplate: { select: { name: true } } } } } },
      },
    }),
    prisma.student.count({ where: branchFilter }),
    prisma.student.count({ where: { status: 'ACTIVE', ...branchFilter } }),
    prisma.studentFeeStructure.aggregate({ _sum: { amountDue: true, amountPaid: true } }),
    getAgedReceivables(branchId).catch(() => null),
  ]);

  // ================================================================
  // 2. EXPENSES — aggregated + recent individual records
  // ================================================================
  const [
    totalExpensesThisMonth,
    totalExpensesLastMonth,
    totalExpensesThisYear,
    expensesByCategory,
    pendingExpenses,
    recentExpenses,
  ] = await Promise.all([
    prisma.expense.aggregate({
      where: { status: 'PAID', date: { gte: thisMonthStart }, ...branchFilter },
      _sum: { totalAmount: true }, _count: true,
    }),
    prisma.expense.aggregate({
      where: { status: 'PAID', date: { gte: lastMonthStart, lte: lastMonthEnd }, ...branchFilter },
      _sum: { totalAmount: true }, _count: true,
    }),
    prisma.expense.aggregate({
      where: { status: 'PAID', date: { gte: thisYearStart }, ...branchFilter },
      _sum: { totalAmount: true }, _count: true,
    }),
    prisma.expense.groupBy({
      by: ['category'],
      where: { status: 'PAID', date: { gte: thisYearStart }, ...branchFilter },
      _sum: { totalAmount: true }, _count: true,
    }),
    prisma.expense.aggregate({
      where: { status: 'PENDING_APPROVAL', ...branchFilter },
      _sum: { totalAmount: true }, _count: true,
    }),
    // Recent 30 individual expenses
    prisma.expense.findMany({
      where: { ...branchFilter },
      orderBy: { date: 'desc' },
      take: 30,
      select: {
        expenseNumber: true, date: true, category: true, description: true,
        amount: true, taxAmount: true, totalAmount: true, status: true,
        paymentMethod: true, paymentRef: true, isRecurring: true,
        vendor: { select: { name: true } },
      },
    }),
  ]);

  // ================================================================
  // 3. INVOICES — full picture
  // ================================================================
  const [invoiceSummary, recentInvoices, overdueInvoices] = await Promise.all([
    // Summary by status
    prisma.invoice.groupBy({
      by: ['status'],
      where: { ...branchFilter },
      _sum: { totalAmount: true, amountPaid: true, balanceDue: true },
      _count: true,
    }),
    // Recent 20 invoices
    prisma.invoice.findMany({
      where: { ...branchFilter },
      orderBy: { issueDate: 'desc' },
      take: 20,
      select: {
        invoiceNumber: true, issueDate: true, dueDate: true, status: true,
        totalAmount: true, amountPaid: true, balanceDue: true, discount: true,
        student: { select: { firstName: true, lastName: true, admissionNumber: true } },
        items: { select: { description: true, quantity: true, unitPrice: true, amount: true } },
      },
    }),
    // All overdue invoices
    prisma.invoice.findMany({
      where: { status: 'OVERDUE', ...branchFilter },
      select: {
        invoiceNumber: true, dueDate: true, balanceDue: true, totalAmount: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: { balanceDue: 'desc' },
    }),
  ]);

  // ================================================================
  // 4. FEE TEMPLATES & CATEGORIES — what fees exist
  // ================================================================
  const [feeTemplates, feeCategories, feeCollectionByTemplate] = await Promise.all([
    prisma.feeTemplate.findMany({
      select: {
        id: true, name: true, amount: true, applicableGrade: true,
        academicTerm: { select: { name: true } },
        category: { select: { name: true } },
        _count: { select: { studentFeeStructures: true } },
      },
    }),
    prisma.feeCategory.findMany({
      where: { isActive: true },
      select: { name: true, code: true, description: true },
    }),
    // Collection rate per fee template
    prisma.studentFeeStructure.groupBy({
      by: ['feeTemplateId'],
      _sum: { amountDue: true, amountPaid: true },
      _count: true,
    }),
  ]);

  // ================================================================
  // 5. INDIVIDUAL STUDENT FEE BALANCES — top 30 debtors with detail
  // ================================================================
  const studentFeeBalances = await prisma.$queryRaw<any[]>`
    SELECT sf."amountDue", sf."amountPaid", sf."dueDate",
           s."firstName", s."lastName", s."admissionNumber", s.status,
           c."gradeLevel" as grade, ft.name as "feeName"
    FROM student_fee_structures sf
    JOIN students s ON sf."studentId" = s.id
    JOIN classes c ON s."classId" = c.id
    JOIN fee_templates ft ON sf."feeTemplateId" = ft.id
    WHERE sf."amountPaid" < sf."amountDue"
    ORDER BY (sf."amountDue" - sf."amountPaid") DESC
    LIMIT 50
  `.catch(() => []);

  // Build per-student debt summaries
  const studentDebtMap: Record<string, any> = {};
  for (const sf of studentFeeBalances) {
    const owed = Number(sf.amountDue) - Number(sf.amountPaid);
    if (owed <= 0) continue;
    const key = sf.admissionNumber;
    if (!studentDebtMap[key]) {
      studentDebtMap[key] = {
        admissionNumber: sf.admissionNumber,
        name: `${sf.firstName} ${sf.lastName}`,
        grade: sf.grade,
        status: sf.status,
        totalOwed: 0,
        fees: [],
      };
    }
    studentDebtMap[key].totalOwed += owed;
    studentDebtMap[key].fees.push({
      feeName: sf.feeName,
      due: Number(sf.amountDue),
      paid: Number(sf.amountPaid),
      balance: owed,
      dueDate: sf.dueDate,
    });
  }
  const topDebtors = Object.values(studentDebtMap)
    .sort((a: any, b: any) => b.totalOwed - a.totalOwed)
    .slice(0, 30);

  // ================================================================
  // 6. PAYMENT PLANS
  // ================================================================
  const [paymentPlans, paymentPlanStats] = await Promise.all([
    prisma.paymentPlan.findMany({
      where: { status: { in: ['ACTIVE', 'DEFAULTED'] } },
      include: {
        schedules: { orderBy: { dueDate: 'asc' } },
      },
      take: 20,
    }),
    prisma.paymentPlan.groupBy({
      by: ['status'],
      _count: true,
      _sum: { totalAmount: true },
    }),
  ]);

  // ================================================================
  // 7. PAYROLL — aggregated + all payroll runs + staff structures
  // ================================================================
  const [latestPayroll, totalPayrollThisYear, payrollRuns, staffPayrolls] = await Promise.all([
    prisma.payrollRun.findFirst({
      where: { status: 'PAID', ...(branchId ? { branchId } : {}) },
      orderBy: { paidAt: 'desc' },
      include: { _count: { select: { payslips: true } } },
    }),
    prisma.payslip.aggregate({
      where: { isPaid: true, paidAt: { gte: thisYearStart }, payrollRun: branchId ? { branchId } : {} },
      _sum: { grossSalary: true, netSalary: true, payeTax: true, napsaContribution: true, nhimaContribution: true, totalDeductions: true },
    }),
    // All payroll runs this year
    prisma.payrollRun.findMany({
      where: { year: currentYear, ...(branchId ? { branchId } : {}) },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      select: {
        runNumber: true, month: true, year: true, status: true,
        totalGross: true, totalDeductions: true, totalNet: true,
        paidAt: true,
        _count: { select: { payslips: true } },
      },
    }),
    // Staff salary structures
    prisma.staffPayroll.findMany({
      where: { isActive: true, ...(branchId ? { branchId } : {}) },
      select: {
        userId: true, basicSalary: true, housingAllowance: true,
        transportAllowance: true, otherAllowances: true, netSalary: true,
        taxDeduction: true, napsaDeduction: true, nhimaDeduction: true,
      },
    }),
  ]);

  // ================================================================
  // 8. BUDGETS — with item breakdowns
  // ================================================================
  const allBudgets = await prisma.budget.findMany({
    where: { ...(branchId ? { branchId } : {}) },
    include: { items: true },
    orderBy: { year: 'desc' },
  });

  // ================================================================
  // 9. PETTY CASH — accounts + recent transactions
  // ================================================================
  const [pettyCashAccounts, pettyCashTransactions] = await Promise.all([
    prisma.pettyCashAccount.findMany({
      where: { isActive: true, ...(branchId ? { branchId } : {}) },
    }),
    prisma.pettyCashTransaction.findMany({
      orderBy: { date: 'desc' },
      take: 20,
      select: {
        type: true, amount: true, description: true, category: true, date: true,
        account: { select: { name: true } },
      },
    }),
  ]);

  // ================================================================
  // 10. CHART OF ACCOUNTS & JOURNAL ENTRIES
  // ================================================================
  const [chartOfAccounts, recentJournalEntries] = await Promise.all([
    prisma.chartOfAccount.findMany({
      where: { isActive: true, ...branchFilter },
      select: { code: true, name: true, type: true, isSystem: true, description: true },
      orderBy: { code: 'asc' },
    }),
    prisma.journalEntry.findMany({
      where: { isPosted: true, ...branchFilter },
      orderBy: { date: 'desc' },
      take: 20,
      select: {
        entryNumber: true, date: true, description: true, reference: true, referenceType: true,
        lines: {
          select: {
            debit: true, credit: true, description: true,
            account: { select: { code: true, name: true } },
          },
        },
      },
    }),
  ]);

  // ================================================================
  // 11. TRIAL BALANCE, BALANCE SHEET, INCOME STATEMENT, CASH FLOW
  // ================================================================
  let trialBalance = null;
  let balanceSheet = null;
  let incomeStatement = null;
  let cashFlow = null;
  try { trialBalance = await getTrialBalance(thisYearStart, now, branchId); } catch { /* ignore */ }
  try { balanceSheet = await getBalanceSheet(now, branchId); } catch { /* ignore */ }
  try { incomeStatement = await getIncomeStatement(thisYearStart, now, branchId); } catch { /* ignore */ }
  try { cashFlow = await getCashFlowSummary(thisYearStart, now, branchId); } catch { /* ignore */ }

  // ================================================================
  // 12. REFUNDS & CREDIT NOTES
  // ================================================================
  const [refunds, creditNotes] = await Promise.all([
    prisma.refund.findMany({
      where: { ...(branchId ? { branchId } : {}) },
      orderBy: { requestedAt: 'desc' },
      take: 15,
      select: {
        refundNumber: true, amount: true, reason: true, method: true, status: true, requestedAt: true,
      },
    }),
    prisma.creditNote.findMany({
      orderBy: { issuedAt: 'desc' },
      take: 15,
      select: {
        creditNoteNumber: true, amount: true, reason: true, issuedAt: true,
        invoice: { select: { invoiceNumber: true } },
      },
    }),
  ]);

  // ================================================================
  // 13. MOBILE MONEY / LENCO TRANSACTIONS
  // ================================================================
  const [mobileMoneyStats, recentMobileMoney] = await Promise.all([
    prisma.mobileMoneyCollection.groupBy({
      by: ['status'],
      _count: true,
      _sum: { amount: true },
    }),
    prisma.mobileMoneyCollection.findMany({
      orderBy: { initiatedAt: 'desc' },
      take: 15,
      select: {
        reference: true, amount: true, phone: true, operator: true, status: true,
        initiatedAt: true, completedAt: true, reasonForFailure: true,
        student: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  // ================================================================
  // 14. VENDORS
  // ================================================================
  const vendors = await prisma.vendor.findMany({
    where: { isActive: true, ...branchFilter },
    select: {
      name: true, contactName: true, email: true, phone: true, taxId: true,
      _count: { select: { expenses: true } },
    },
  });

  // ================================================================
  // 15. DEBT COLLECTION CAMPAIGNS
  // ================================================================
  const debtCampaigns = await (prisma as any).debtCollectionCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      name: true, status: true, targetSegments: true, channels: true,
      totalTargeted: true, totalSent: true, totalDelivered: true, totalPaid: true,
      amountTargeted: true, amountCollected: true,
      createdAt: true, executedAt: true,
    },
  }).catch(() => []);

  // ================================================================
  // 16. FINANCIAL AUDIT LOG — recent activity
  // ================================================================
  const recentAuditLogs = await prisma.financialAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      action: true, entityType: true, description: true, amount: true, createdAt: true,
    },
  });

  // ================================================================
  // BUILD THE COMPLETE SNAPSHOT
  // ================================================================

  // Monthly revenue trend
  const monthlyTrend: Record<string, number> = {};
  for (const p of monthlyRevenueTrend) {
    const key = `${p.paymentDate.getFullYear()}-${String(p.paymentDate.getMonth() + 1).padStart(2, '0')}`;
    monthlyTrend[key] = (monthlyTrend[key] || 0) + Number(p.amount);
  }

  // Fee template collection map
  const templateCollectionMap: Record<string, any> = {};
  for (const fc of feeCollectionByTemplate) {
    templateCollectionMap[fc.feeTemplateId] = {
      studentsAssigned: fc._count,
      totalDue: Number(fc._sum.amountDue || 0),
      totalPaid: Number(fc._sum.amountPaid || 0),
    };
  }

  const revenueThisMonth = Number(totalRevenueThisMonth._sum.amount || 0);
  const revenueLastMonth = Number(totalRevenueLastMonth._sum.amount || 0);
  const revenueYTD = Number(totalRevenueThisYear._sum.amount || 0);
  const expensesThisMonth = Number(totalExpensesThisMonth._sum.totalAmount || 0);
  const expensesLastMonth = Number(totalExpensesLastMonth._sum.totalAmount || 0);
  const expensesYTD = Number(totalExpensesThisYear._sum.totalAmount || 0);
  const totalFeesDue = Number(totalFeesAssigned._sum.amountDue || 0);
  const totalFeesPaid = Number(totalFeesAssigned._sum.amountPaid || 0);
  const collectionRate = totalFeesDue > 0 ? ((totalFeesPaid / totalFeesDue) * 100).toFixed(1) : '0';
  const revenueGrowth = revenueLastMonth > 0
    ? (((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100).toFixed(1)
    : 'N/A';

  return {
    generatedAt: now.toISOString(),
    currency: 'ZMW',

    // ---- SCHOOL OVERVIEW ----
    school: {
      totalStudents,
      activeStudents,
    },

    // ---- REVENUE SUMMARY ----
    revenue: {
      thisMonth: revenueThisMonth,
      lastMonth: revenueLastMonth,
      yearToDate: revenueYTD,
      transactionsThisMonth: totalRevenueThisMonth._count,
      growthPercent: revenueGrowth,
      byMethod: revenueByMethod.map((r: any) => ({
        method: r.method, total: Number(r._sum.amount), count: r._count,
      })),
      monthlyTrend: Object.entries(monthlyTrend)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, total]) => ({ month, total })),
    },

    // ---- RECENT PAYMENTS (individual records) ----
    recentPayments: recentPayments.map((p: any) => ({
      txnId: p.transactionId,
      student: `${p.student.firstName} ${p.student.lastName}`,
      admissionNumber: p.student.admissionNumber,
      amount: Number(p.amount),
      method: p.method,
      status: p.status,
      date: p.paymentDate,
      notes: p.notes,
      allocatedTo: p.allocations.map((a: any) => ({
        fee: a.studentFee?.feeTemplate?.name,
        amount: Number(a.amount),
      })),
    })),

    // ---- FEE COLLECTION ----
    feeCollection: {
      totalDue: totalFeesDue,
      totalPaid: totalFeesPaid,
      outstanding: totalFeesDue - totalFeesPaid,
      collectionRatePercent: collectionRate,
      agedReceivables: agedReceivables ? {
        summary: agedReceivables.summary,
        studentCount: agedReceivables.studentCount,
        topDebtors: (agedReceivables.receivables as any[])?.slice(0, 10).map((r: any) => ({
          student: r.studentName, balance: r.balance, ageDays: r.ageDays,
        })),
      } : null,
    },

    // ---- FEE TEMPLATES & CATEGORIES ----
    feeStructure: {
      categories: feeCategories.map((c: any) => ({ name: c.name, code: c.code })),
      templates: feeTemplates.map((t: any) => ({
        name: t.name,
        amount: Number(t.amount),
        grade: t.applicableGrade,
        term: t.academicTerm?.name,
        category: t.category?.name,
        studentsAssigned: t._count.studentFeeStructures,
        ...(templateCollectionMap[t.id] ? {
          totalDue: templateCollectionMap[t.id].totalDue,
          totalPaid: templateCollectionMap[t.id].totalPaid,
          collectionRate: templateCollectionMap[t.id].totalDue > 0
            ? ((templateCollectionMap[t.id].totalPaid / templateCollectionMap[t.id].totalDue) * 100).toFixed(1) + '%'
            : 'N/A',
        } : {}),
      })),
    },

    // ---- TOP DEBTORS (individual student breakdowns) ----
    topDebtors: topDebtors,

    // ---- PAYMENT PLANS ----
    paymentPlans: {
      summary: paymentPlanStats.map((s: any) => ({
        status: s.status, count: s._count, totalAmount: Number(s._sum.totalAmount || 0),
      })),
      activePlans: paymentPlans.map((pp: any) => ({
        studentId: pp.studentId,
        totalAmount: Number(pp.totalAmount),
        installments: pp.installments,
        frequency: pp.frequency,
        status: pp.status,
        schedules: pp.schedules.map((s: any) => ({
          dueDate: s.dueDate, amountDue: Number(s.amountDue),
          amountPaid: Number(s.amountPaid), isPaid: s.isPaid,
        })),
      })),
    },

    // ---- EXPENSES SUMMARY ----
    expenses: {
      thisMonth: expensesThisMonth,
      lastMonth: expensesLastMonth,
      yearToDate: expensesYTD,
      pendingApproval: {
        amount: Number(pendingExpenses._sum.totalAmount || 0),
        count: pendingExpenses._count,
      },
      byCategory: expensesByCategory.map((e: any) => ({
        category: e.category, total: Number(e._sum.totalAmount), count: e._count,
      })),
    },

    // ---- RECENT EXPENSES (individual records) ----
    recentExpenses: recentExpenses.map((e: any) => ({
      expenseNumber: e.expenseNumber,
      date: e.date,
      category: e.category,
      description: e.description,
      amount: Number(e.amount),
      tax: Number(e.taxAmount),
      total: Number(e.totalAmount),
      status: e.status,
      vendor: e.vendor?.name || null,
      paymentMethod: e.paymentMethod,
      isRecurring: e.isRecurring,
    })),

    // ---- INVOICES ----
    invoices: {
      summary: invoiceSummary.map((i: any) => ({
        status: i.status, count: i._count,
        totalAmount: Number(i._sum.totalAmount || 0),
        totalPaid: Number(i._sum.amountPaid || 0),
        totalOutstanding: Number(i._sum.balanceDue || 0),
      })),
      overdue: overdueInvoices.map((i: any) => ({
        invoiceNumber: i.invoiceNumber,
        student: `${i.student.firstName} ${i.student.lastName}`,
        dueDate: i.dueDate,
        balance: Number(i.balanceDue),
        total: Number(i.totalAmount),
      })),
      recent: recentInvoices.map((i: any) => ({
        invoiceNumber: i.invoiceNumber,
        student: `${i.student.firstName} ${i.student.lastName}`,
        issueDate: i.issueDate,
        dueDate: i.dueDate,
        status: i.status,
        total: Number(i.totalAmount),
        paid: Number(i.amountPaid),
        balance: Number(i.balanceDue),
        discount: Number(i.discount),
        items: i.items.map((item: any) => ({
          description: item.description, qty: item.quantity,
          unitPrice: Number(item.unitPrice), amount: Number(item.amount),
        })),
      })),
    },

    // ---- PROFITABILITY ----
    profitability: {
      netIncomeThisMonth: revenueThisMonth - expensesThisMonth,
      netIncomeYTD: revenueYTD - expensesYTD,
      expenseRatioPercent: revenueYTD > 0 ? ((expensesYTD / revenueYTD) * 100).toFixed(1) : 'N/A',
    },

    // ---- PAYROLL ----
    payroll: {
      lastRun: latestPayroll ? {
        month: latestPayroll.month, year: latestPayroll.year,
        staffCount: latestPayroll._count.payslips,
        totalGross: Number(latestPayroll.totalGross),
        totalNet: Number(latestPayroll.totalNet),
      } : null,
      yearToDate: {
        totalGross: Number(totalPayrollThisYear._sum?.grossSalary || 0),
        totalNet: Number(totalPayrollThisYear._sum?.netSalary || 0),
        totalPAYE: Number(totalPayrollThisYear._sum?.payeTax || 0),
        totalNAPSA: Number(totalPayrollThisYear._sum?.napsaContribution || 0) * 2,
        totalNHIMA: Number(totalPayrollThisYear._sum?.nhimaContribution || 0) * 2,
        totalDeductions: Number(totalPayrollThisYear._sum?.totalDeductions || 0),
      },
      allRuns: payrollRuns.map((r: any) => ({
        runNumber: r.runNumber, month: r.month, year: r.year, status: r.status,
        totalGross: Number(r.totalGross), totalDeductions: Number(r.totalDeductions),
        totalNet: Number(r.totalNet), staffCount: r._count.payslips, paidAt: r.paidAt,
      })),
      staffStructures: staffPayrolls.map((s: any) => ({
        userId: s.userId,
        basicSalary: Number(s.basicSalary),
        housing: Number(s.housingAllowance),
        transport: Number(s.transportAllowance),
        otherAllowances: Number(s.otherAllowances),
        netSalary: Number(s.netSalary),
        paye: Number(s.taxDeduction),
        napsa: Number(s.napsaDeduction),
        nhima: Number(s.nhimaDeduction),
      })),
    },

    // ---- BUDGETS (with item breakdowns) ----
    budgets: allBudgets.map(b => ({
      name: b.name, period: b.period, year: b.year, status: b.status,
      totalBudget: Number(b.totalBudget),
      totalSpent: Number(b.totalSpent),
      utilizationPercent: Number(b.totalBudget) > 0
        ? ((Number(b.totalSpent) / Number(b.totalBudget)) * 100).toFixed(1) + '%'
        : '0%',
      items: b.items.map(i => ({
        category: i.category, description: i.description,
        allocated: Number(i.allocated), spent: Number(i.spent), remaining: Number(i.remaining),
      })),
    })),

    // ---- PETTY CASH ----
    pettyCash: {
      totalBalance: pettyCashAccounts.reduce((sum, a) => sum + Number(a.balance), 0),
      accounts: pettyCashAccounts.map(a => ({
        name: a.name, balance: Number(a.balance), floatAmount: Number(a.floatAmount),
      })),
      recentTransactions: pettyCashTransactions.map((t: any) => ({
        type: t.type, amount: Number(t.amount), description: t.description,
        category: t.category, date: t.date, account: t.account?.name,
      })),
    },

    // ---- CHART OF ACCOUNTS ----
    chartOfAccounts: chartOfAccounts.map((a: any) => ({
      code: a.code, name: a.name, type: a.type, isSystem: a.isSystem,
    })),

    // ---- JOURNAL ENTRIES (recent posted) ----
    recentJournalEntries: recentJournalEntries.map((je: any) => ({
      entryNumber: je.entryNumber, date: je.date, description: je.description,
      reference: je.reference, refType: je.referenceType,
      lines: je.lines.map((l: any) => ({
        account: `${l.account.code} - ${l.account.name}`,
        debit: Number(l.debit), credit: Number(l.credit), description: l.description,
      })),
    })),

    // ---- ACCOUNTING REPORTS ----
    trialBalance: trialBalance ? trialBalance.map((a: any) => ({
      account: `${a.accountCode} - ${a.accountName}`, type: a.accountType,
      debit: a.debit, credit: a.credit, balance: a.balance,
    })) : null,

    balanceSheet: balanceSheet ? {
      assets: balanceSheet.assets, totalAssets: balanceSheet.totalAssets,
      liabilities: balanceSheet.liabilities, totalLiabilities: balanceSheet.totalLiabilities,
      equity: balanceSheet.equity, totalEquity: balanceSheet.totalEquity,
    } : null,

    incomeStatement: incomeStatement ? {
      income: incomeStatement.income, totalIncome: incomeStatement.totalIncome,
      expenses: incomeStatement.expenses, totalExpenses: incomeStatement.totalExpenses,
      netIncome: incomeStatement.netIncome,
    } : null,

    cashFlow: cashFlow ? {
      inflows: cashFlow.inflows,
      outflows: cashFlow.outflows,
      netCashFlow: cashFlow.netCashFlow,
    } : null,

    // ---- REFUNDS & CREDIT NOTES ----
    refunds: refunds.map((r: any) => ({
      refundNumber: r.refundNumber, amount: Number(r.amount), reason: r.reason,
      method: r.method, status: r.status, date: r.requestedAt,
    })),
    creditNotes: creditNotes.map((cn: any) => ({
      number: cn.creditNoteNumber, amount: Number(cn.amount), reason: cn.reason,
      invoice: cn.invoice?.invoiceNumber, date: cn.issuedAt,
    })),

    // ---- MOBILE MONEY / ONLINE PAYMENTS ----
    mobileMoney: {
      summary: mobileMoneyStats.map((s: any) => ({
        status: s.status, count: s._count, totalAmount: Number(s._sum.amount || 0),
      })),
      recent: recentMobileMoney.map((m: any) => ({
        reference: m.reference, amount: Number(m.amount), phone: m.phone,
        operator: m.operator, status: m.status,
        student: `${m.student.firstName} ${m.student.lastName}`,
        initiatedAt: m.initiatedAt, completedAt: m.completedAt,
        failureReason: m.reasonForFailure,
      })),
    },

    // ---- VENDORS / SUPPLIERS ----
    vendors: vendors.map((v: any) => ({
      name: v.name, contact: v.contactName, email: v.email, phone: v.phone,
      taxId: v.taxId, expenseCount: v._count.expenses,
    })),

    // ---- DEBT COLLECTION CAMPAIGNS ----
    debtCollectionCampaigns: debtCampaigns,

    // ---- FINANCIAL AUDIT TRAIL (recent activity) ----
    recentFinancialActivity: recentAuditLogs.map((l: any) => ({
      action: l.action, entity: l.entityType, description: l.description,
      amount: l.amount ? Number(l.amount) : null, date: l.createdAt,
    })),
  };
}

/**
 * Build the financial advisor system prompt — comprehensive with all data sections
 */
function buildFinancialAdvisorPrompt(snapshot: any): string {
  return `You are a Financial Advisor AI for a Zambian school management system called Sync.
You have COMPLETE ACCESS to every piece of financial data in the school system.
You analyze school financial data and provide actionable insights, recommendations, and warnings.

ROLE: You are a certified financial analyst specializing in Zambian educational institutions.
CURRENCY: All amounts are in Zambian Kwacha (ZMW).
CONTEXT: This is a school — revenue comes from student fees, expenses include salaries, utilities, supplies, etc.

=== COMPLETE FINANCIAL DATA (as of ${snapshot.generatedAt}) ===
${JSON.stringify(snapshot, null, 2)}

=== DATA SECTIONS YOU HAVE ACCESS TO ===
You have full access to ALL of the following financial data sections.
Use them to answer ANY question about the school's finances:

1. **revenue** — Monthly/YTD totals, growth %, revenue by payment method, 6-month trend
2. **recentPayments** — Last 30 individual payment records with student names, amounts, methods, dates, fee allocations
3. **feeCollection** — Total fees due/paid/outstanding, collection rate %, aged receivables with top debtors
4. **feeStructure** — All fee templates (names, amounts, grades, terms, categories) with per-template collection rates
5. **topDebtors** — Top 30 students who owe money, with detailed fee breakdowns per student
6. **paymentPlans** — Active/defaulted payment plans with installment schedules
7. **expenses** — Monthly/YTD totals, expenses by category, pending approvals
8. **recentExpenses** — Last 30 individual expense records with vendors, categories, amounts, statuses
9. **invoices** — Summary by status, all overdue invoices, recent 20 invoices with line items
10. **profitability** — Net income (monthly + YTD), expense ratio
11. **payroll** — Latest run, YTD totals (gross, net, PAYE, NAPSA, NHIMA), all payroll runs this year, individual staff salary structures
12. **budgets** — All budgets with item-level breakdowns (allocated vs spent vs remaining per category)
13. **pettyCash** — Account balances + recent 20 transactions
14. **chartOfAccounts** — Full chart of accounts (code, name, type)
15. **recentJournalEntries** — Last 20 posted journal entries with debit/credit lines
16. **trialBalance** — Full trial balance (all accounts with debits, credits, balances)
17. **balanceSheet** — Assets, liabilities, equity with account-level detail
18. **incomeStatement** — Income and expense accounts with totals, net income
19. **cashFlow** — Inflows (fee collections) vs outflows (expenses + payroll), net cash flow
20. **refunds** — Recent refund requests with statuses
21. **creditNotes** — Recent credit notes issued
22. **mobileMoney** — Mobile money collection stats + recent transactions (Airtel, MTN)
23. **vendors** — Supplier directory with expense counts
24. **debtCollectionCampaigns** — Debt collection campaign history with results
25. **recentFinancialActivity** — Audit trail of recent financial actions

GUIDELINES:
- Be specific with numbers — reference actual ZMW amounts from the data
- When asked about specific students, fees, payments, or expenses, look them up in the individual records
- When asked about a specific vendor, look in the vendors section
- When asked about budgets, show the item-level breakdown not just totals
- Highlight critical issues first (cash flow problems, low collection rates, budget overruns)
- Provide actionable recommendations the school admin can implement
- Consider Zambian context: ZRA compliance (PAYE, NAPSA, NHIMA), school term cycles, economic factors
- Compare month-over-month and identify trends
- Flag any compliance risks (statutory deductions, overdue payments)
- Keep responses concise but insightful — use bullet points and clear headings
- If data is limited (e.g., no journal entries yet), acknowledge this and advise on getting started
- Format currency as "ZMW X,XXX.XX"
- You can answer questions about ANY individual payment, expense, invoice, student fee balance, or staff salary

EXECUTABLE ACTIONS:
You can DO things — not just answer questions. When the user asks you to CREATE, SEND, or PERFORM something, include an ACTION BLOCK at the very end of your response using this exact format:

\`\`\`action
{"type": "ACTION_TYPE", "param1": "value1", "param2": "value2"}
\`\`\`

IMPORTANT: Only ONE action block per response. Always confirm what you're about to do before including the action block.

=== AVAILABLE ACTIONS ===

**VENDOR MANAGEMENT:**
- CREATE_VENDOR — Create a new vendor/supplier
  Required: name (string, min 2 chars)
  Optional: contactName, email, phone, address, taxId (TPIN), bankName, bankAccount, bankBranch, notes
  Example: {"type":"CREATE_VENDOR","name":"Lusaka Office Supplies","phone":"+260977123456","email":"info@los.zm","taxId":"1234567890"}

**EXPENSE MANAGEMENT:**
- CREATE_EXPENSE — Record a new expense
  Required: date (YYYY-MM-DD), category (one of: SALARIES, UTILITIES, SUPPLIES, MAINTENANCE, TRANSPORT, FOOD_CATERING, RENT, INSURANCE, MARKETING, TECHNOLOGY, PROFESSIONAL_FEES, BANK_CHARGES, TAXES, DEPRECIATION, MISCELLANEOUS), description (min 3 chars), amount (positive number)
  Optional: taxAmount (default 0), vendorName (string — will look up vendor by name), paymentMethod (CASH/MOBILE_MONEY/BANK_DEPOSIT/CHEQUE/BANK_TRANSFER), paymentRef, notes, isRecurring (bool), recurringFrequency (monthly/quarterly/annual)
  Example: {"type":"CREATE_EXPENSE","date":"2026-03-05","category":"UTILITIES","description":"March electricity bill","amount":2500,"vendorName":"ZESCO"}

**INVOICE MANAGEMENT:**
- CREATE_INVOICE — Create a student invoice
  Required: studentName (string — will look up student), dueDate (YYYY-MM-DD), items (array of {description, quantity, unitPrice})
  Optional: discount (number, default 0), notes
  Example: {"type":"CREATE_INVOICE","studentName":"Chisomo Zimba","dueDate":"2026-04-01","items":[{"description":"Term 1 Tuition","quantity":1,"unitPrice":5000}]}

**PAYMENT RECORDING:**
- RECORD_PAYMENT — Record a fee payment from a student
  Required: studentName (string — will look up student), amount (positive number), method (CASH/MOBILE_MONEY/BANK_DEPOSIT/CHEQUE/BANK_TRANSFER)
  Optional: notes
  Example: {"type":"RECORD_PAYMENT","studentName":"David Banda","amount":2000,"method":"CASH","notes":"Partial term 1 payment"}

**BUDGET MANAGEMENT:**
- CREATE_BUDGET — Create a new budget
  Required: name (string, min 3 chars), period (term/annual/quarterly), year (int), startDate (YYYY-MM-DD), endDate (YYYY-MM-DD), items (array of {category, allocated} — category uses same expense categories)
  Optional: notes, termId
  Example: {"type":"CREATE_BUDGET","name":"Term 2 2026 Budget","period":"term","year":2026,"startDate":"2026-05-01","endDate":"2026-08-31","items":[{"category":"SALARIES","allocated":50000},{"category":"UTILITIES","allocated":8000}]}

**PETTY CASH:**
- CREATE_PETTY_CASH_TRANSACTION — Record a petty cash disbursement or replenishment
  Required: accountName (string — will look up account by name), type (DISBURSEMENT or REPLENISHMENT), amount (positive number), description (min 3 chars)
  Optional: category (same expense categories)
  Example: {"type":"CREATE_PETTY_CASH_TRANSACTION","accountName":"Main Petty Cash","type":"DISBURSEMENT","amount":150,"description":"Office pens and paper","category":"SUPPLIES"}

**FEE TEMPLATES:**
- CREATE_FEE_TEMPLATE — Create a new fee template
  Required: name (string, min 2 chars), amount (positive number), applicableGrade (int 0-12), academicTermName (string — will look up term)
  Optional: categoryName (string — will look up category)
  Example: {"type":"CREATE_FEE_TEMPLATE","name":"Computer Lab Fee","amount":500,"applicableGrade":10,"academicTermName":"Term 1 2026"}

**DEBT COLLECTION:**
- SEND_REMINDERS — Send fee reminders to debtors. Params: channels (EMAIL/SMS/WHATSAPP), segments (WILL_PAY/NEEDS_NUDGE/AT_RISK/HARDSHIP), minDaysOverdue
- CREATE_CAMPAIGN — Create a debt collection campaign. Params: name, minAmountOwed, targetSegments
- VIEW_DEBTORS — Navigate to the Debt Collection dashboard

=== ACTION RULES ===
1. ONLY include an action block when the user EXPLICITLY asks you to create/record/send something
2. For regular analysis questions, just answer normally — NO action block
3. Before creating, confirm the details with the user in your response text, then add the action block
4. Use the data you have to fill in smart defaults (e.g., current date for expenses)
5. If the user's request is missing required fields, ASK for them — don't guess
6. For studentName/vendorName lookups, use names from your data when possible`;
}

/**
 * POST /api/v1/financial/ai-advisor
 * AI-powered financial analysis and recommendations
 */
export const getAIFinancialAdvice = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { question, conversationHistory } = req.body;

    if (!question?.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Check AI availability
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return res.status(503).json({
        error: 'AI is not configured. Please set up AI in School Settings (Settings → AI Configuration).',
      });
    }

    // Gather financial data
    const branchId = user.role !== 'SUPER_ADMIN' ? user.branchId : undefined;
    const snapshot = await gatherFinancialSnapshot(branchId);

    // Build messages
    const systemPrompt = buildFinancialAdvisorPrompt(snapshot);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (last 10 messages)
    if (conversationHistory && Array.isArray(conversationHistory)) {
      const recentHistory = conversationHistory.slice(-10);
      for (const msg of recentHistory) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Add current question
    messages.push({ role: 'user', content: question });

    // Call AI
    const startTime = Date.now();
    const aiResponse = await aiService.chat(messages, {
      temperature: 0.4,
      maxTokens: 4000,
    });
    const responseTimeMs = Date.now() - startTime;

    // Track usage
    aiUsageTracker.track({
      userId: user.userId,
      branchId: user.branchId,
      feature: 'financial-advisor',
      action: 'chat',
      tokensUsed: aiResponse.tokensUsed,
      responseTimeMs,
      model: aiResponse.model,
    });

    // Auto-save to conversation if conversationId provided, or create new one
    let conversationId = req.body.conversationId || null;
    try {
      if (conversationId) {
        // Append to existing conversation
        await convoService.saveMessage(conversationId, 'user', question);
        await convoService.saveMessage(conversationId, 'assistant', aiResponse.content, aiResponse.tokensUsed || undefined);
        // Update title if this is the first real exchange (title is still default)
        const convoData = await prisma.aIConversation.findUnique({ where: { id: conversationId } });
        if (convoData && convoData.title === 'New Conversation') {
          const shortTitle = question.length > 60 ? question.slice(0, 57) + '...' : question;
          await convoService.updateConversation(conversationId, user.userId, shortTitle);
        }
      } else {
        // Create a new conversation with initial messages
        const shortTitle = question.length > 60 ? question.slice(0, 57) + '...' : question;
        const convo = await convoService.createConversation(user.userId, 'financial-advisor', shortTitle);
        await convoService.saveMessage(convo.id, 'user', question);
        await convoService.saveMessage(convo.id, 'assistant', aiResponse.content, aiResponse.tokensUsed || undefined);
        conversationId = convo.id;
      }
    } catch (saveErr: any) {
      console.error('Failed to save conversation:', saveErr.message);
      // Don't fail the response if save fails
    }

    // Extract action block if present and strip it from the displayed answer
    let action = null;
    let cleanAnswer = aiResponse.content;
    const actionMatch = aiResponse.content.match(/```action\n([\s\S]*?)\n```/);
    if (actionMatch) {
      try {
        const parsed = JSON.parse(actionMatch[1].trim());
        const { type, ...params } = parsed;
        action = { type, params };
        // Remove the action block from the displayed text
        cleanAnswer = cleanAnswer.replace(/```action\n[\s\S]*?\n```/, '').trim();
      } catch { /* ignore parse errors */ }
    }

    res.json({
      answer: cleanAnswer,
      action, // null or { type: "SEND_REMINDERS", params: { channels: [...], ... } }
      tokensUsed: aiResponse.tokensUsed,
      conversationId,
      snapshotSummary: {
        revenueThisMonth: snapshot.revenue.thisMonth,
        expensesThisMonth: snapshot.expenses.thisMonth,
        netIncome: snapshot.profitability.netIncomeThisMonth,
        collectionRate: snapshot.feeCollection.collectionRatePercent,
        outstandingFees: snapshot.feeCollection.outstanding,
      },
    });
  } catch (error: any) {
    console.error('AI Financial Advisor error:', error);
    res.status(500).json({ error: error.message || 'Failed to get AI financial advice' });
  }
};

/**
 * GET /api/v1/financial/ai-advisor/snapshot
 * Get the raw financial snapshot (no AI — for dashboard display)
 */
export const getFinancialSnapshot = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const branchId = user.role !== 'SUPER_ADMIN' ? user.branchId : undefined;
    const snapshot = await gatherFinancialSnapshot(branchId);

    res.json(snapshot);
  } catch (error: any) {
    console.error('Financial snapshot error:', error);
    res.status(500).json({ error: 'Failed to generate financial snapshot' });
  }
};

/**
 * POST /api/v1/financial/ai-advisor/quick-insights
 * Get quick AI-generated insights without a specific question
 */
export const getQuickInsights = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return res.status(503).json({
        error: 'AI is not configured. Please set up AI in School Settings.',
      });
    }

    const branchId = user.role !== 'SUPER_ADMIN' ? user.branchId : undefined;
    const snapshot = await gatherFinancialSnapshot(branchId);
    const systemPrompt = buildFinancialAdvisorPrompt(snapshot);

    const startTime = Date.now();
    const result = await aiService.generateJSON<{
      healthScore: number;
      healthLabel: string;
      criticalAlerts: Array<{ title: string; description: string; severity: 'high' | 'medium' | 'low' }>;
      recommendations: Array<{ title: string; description: string; impact: string }>;
      keyMetrics: Array<{ label: string; value: string; trend: 'up' | 'down' | 'stable'; isGood: boolean }>;
    }>(
      `Based on the financial data provided, generate a structured financial health report.
Respond with JSON only:
{
  "healthScore": <number 0-100, overall financial health>,
  "healthLabel": "<Excellent/Good/Fair/Needs Attention/Critical>",
  "criticalAlerts": [{"title": "...", "description": "...", "severity": "high|medium|low"}],
  "recommendations": [{"title": "...", "description": "...", "impact": "..."}],
  "keyMetrics": [{"label": "...", "value": "ZMW X,XXX", "trend": "up|down|stable", "isGood": true|false}]
}
Include 2-4 critical alerts, 3-5 recommendations, and 4-6 key metrics.
Focus on the most important insights for a school administrator.`,
      {
        systemPrompt,
        temperature: 0.3,
      }
    );

    // Track usage
    aiUsageTracker.track({
      userId: user.userId,
      branchId: user.branchId,
      feature: 'financial-advisor',
      action: 'quick-insights',
      responseTimeMs: Date.now() - startTime,
    });

    res.json({
      ...result,
      snapshot: {
        revenueThisMonth: snapshot.revenue.thisMonth,
        expensesThisMonth: snapshot.expenses.thisMonth,
        netIncome: snapshot.profitability.netIncomeThisMonth,
        collectionRate: snapshot.feeCollection.collectionRatePercent,
        outstandingFees: snapshot.feeCollection.outstanding,
      },
    });
  } catch (error: any) {
    console.error('Quick insights error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate insights' });
  }
};

// ========================================
// CONVERSATION HISTORY ENDPOINTS
// ========================================

/**
 * GET /api/v1/financial/ai-advisor/conversations
 * List user's financial advisor conversations
 */
export const listConversations = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const conversations = await convoService.listConversations(user.userId, 'financial-advisor');
    res.json(conversations);
  } catch (error: any) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
};

/**
 * GET /api/v1/financial/ai-advisor/conversations/:id
 * Get a specific conversation with all messages
 */
export const getConversation = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const result = await convoService.getConversation(req.params.id, user.userId);
    if (!result) return res.status(404).json({ error: 'Conversation not found' });
    res.json(result);
  } catch (error: any) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to load conversation' });
  }
};

/**
 * PATCH /api/v1/financial/ai-advisor/conversations/:id
 * Rename a conversation
 */
export const updateConversation = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    const updated = await convoService.updateConversation(req.params.id, user.userId, title);
    if (!updated) return res.status(404).json({ error: 'Conversation not found' });
    res.json(updated);
  } catch (error: any) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
};

/**
 * DELETE /api/v1/financial/ai-advisor/conversations/:id
 * Delete a conversation
 */
export const deleteConversation = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const deleted = await convoService.deleteConversation(req.params.id, user.userId);
    if (!deleted) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ message: 'Conversation deleted' });
  } catch (error: any) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};

// ========================================
// AI ACTION EXECUTOR — handles create operations triggered by AI
// ========================================

import { generateSequenceNumber } from '../services/accountingService';

/**
 * POST /api/v1/financial/ai-advisor/execute-action
 * Execute an AI-suggested action (create vendor, expense, invoice, etc.)
 */
export const executeAIAction = async (req: Request, res: Response) => {
  try {
    const user = (req as AuthRequest).user;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { type, params } = req.body;
    if (!type) return res.status(400).json({ error: 'Action type is required' });

    const branchId = user.branchId || undefined;

    switch (type) {
      // ============ CREATE VENDOR ============
      case 'CREATE_VENDOR': {
        const { name, contactName, email, phone, address, taxId, bankName, bankAccount, bankBranch, notes } = params;
        if (!name || name.trim().length < 2) {
          return res.status(400).json({ error: 'Vendor name is required (min 2 chars)' });
        }
        const vendor = await prisma.vendor.create({
          data: {
            name: name.trim(),
            contactName: contactName || null,
            email: email || null,
            phone: phone || null,
            address: address || null,
            taxId: taxId || null,
            bankName: bankName || null,
            bankAccount: bankAccount || null,
            bankBranch: bankBranch || null,
            notes: notes || null,
            branchId: branchId || null,
          },
        });
        return res.json({ success: true, message: `Vendor "${vendor.name}" created successfully`, created: 'vendor', data: vendor });
      }

      // ============ CREATE EXPENSE ============
      case 'CREATE_EXPENSE': {
        const { date, category, description, amount, taxAmount, vendorName, paymentMethod, paymentRef, notes: expNotes, isRecurring, recurringFrequency } = params;
        if (!date || !category || !description || !amount || amount <= 0) {
          return res.status(400).json({ error: 'date, category, description, and amount (positive) are required' });
        }
        // Look up vendor by name if provided
        let vendorId: string | null = null;
        if (vendorName) {
          const vendor = await prisma.vendor.findFirst({ where: { name: { contains: vendorName, mode: 'insensitive' } } });
          if (vendor) vendorId = vendor.id;
        }
        const tax = Number(taxAmount) || 0;
        const total = Number(amount) + tax;
        const expenseNumber = await generateSequenceNumber('EXP', branchId);
        const expense = await prisma.expense.create({
          data: {
            expenseNumber,
            date: new Date(date),
            category: category as any,
            description: description.trim(),
            amount: Number(amount),
            taxAmount: tax,
            totalAmount: total,
            vendorId,
            paymentMethod: paymentMethod || null,
            paymentRef: paymentRef || null,
            notes: expNotes || null,
            isRecurring: isRecurring || false,
            recurringFrequency: recurringFrequency || null,
            status: 'PENDING_APPROVAL',
            requestedBy: user.userId,
            branchId: branchId || null,
          },
        });
        return res.json({ success: true, message: `Expense ${expense.expenseNumber} created (ZMW ${total.toFixed(2)}) — pending approval`, created: 'expense', data: expense });
      }

      // ============ CREATE INVOICE ============
      case 'CREATE_INVOICE': {
        const { studentName, dueDate, items, discount: discAmt, notes: invNotes } = params;
        if (!studentName || !dueDate || !items?.length) {
          return res.status(400).json({ error: 'studentName, dueDate, and items are required' });
        }
        // Look up student by name
        const nameParts = studentName.trim().split(/\s+/);
        const student = await prisma.student.findFirst({
          where: {
            OR: [
              { firstName: { contains: nameParts[0], mode: 'insensitive' }, lastName: { contains: nameParts[nameParts.length - 1], mode: 'insensitive' } },
              { firstName: { contains: studentName, mode: 'insensitive' } },
              { lastName: { contains: studentName, mode: 'insensitive' } },
            ],
          },
        });
        if (!student) return res.status(404).json({ error: `Student "${studentName}" not found` });

        // Find active term
        const activeTerm = await prisma.academicTerm.findFirst({ where: { isActive: true }, orderBy: { startDate: 'desc' } });

        const disc = Number(discAmt) || 0;
        const subtotal = items.reduce((sum: number, i: any) => sum + (Number(i.quantity || 1) * Number(i.unitPrice)), 0);
        const totalAmount = subtotal - disc;
        const invoiceNumber = await generateSequenceNumber('INV', branchId);

        const invoice = await prisma.invoice.create({
          data: {
            invoiceNumber,
            studentId: student.id,
            termId: activeTerm?.id || '',
            dueDate: new Date(dueDate),
            subtotal,
            discount: disc,
            taxAmount: 0,
            totalAmount,
            amountPaid: 0,
            balanceDue: totalAmount,
            status: 'SENT',
            notes: invNotes || null,
            branchId: branchId || null,
            items: {
              create: items.map((i: any) => ({
                description: i.description,
                quantity: Number(i.quantity || 1),
                unitPrice: Number(i.unitPrice),
                amount: Number(i.quantity || 1) * Number(i.unitPrice),
              })),
            },
          },
        });
        return res.json({ success: true, message: `Invoice ${invoice.invoiceNumber} created for ${studentName} — ZMW ${totalAmount.toFixed(2)}`, created: 'invoice', data: invoice });
      }

      // ============ RECORD PAYMENT ============
      case 'RECORD_PAYMENT': {
        const { studentName: payStudentName, amount: payAmt, method, notes: payNotes } = params;
        if (!payStudentName || !payAmt || payAmt <= 0 || !method) {
          return res.status(400).json({ error: 'studentName, amount (positive), and method are required' });
        }
        const payNameParts = payStudentName.trim().split(/\s+/);
        const payStudent = await prisma.student.findFirst({
          where: {
            OR: [
              { firstName: { contains: payNameParts[0], mode: 'insensitive' }, lastName: { contains: payNameParts[payNameParts.length - 1], mode: 'insensitive' } },
              { firstName: { contains: payStudentName, mode: 'insensitive' } },
              { lastName: { contains: payStudentName, mode: 'insensitive' } },
            ],
          },
        });
        if (!payStudent) return res.status(404).json({ error: `Student "${payStudentName}" not found` });

        const txnId = `TXN-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const payment = await prisma.payment.create({
          data: {
            transactionId: txnId,
            studentId: payStudent.id,
            amount: Number(payAmt),
            method: method as any,
            notes: payNotes || `AI-recorded payment`,
            status: 'COMPLETED',
            recordedByUserId: user.userId,
            branchId: branchId || null,
          },
        });
        return res.json({ success: true, message: `Payment ${txnId} recorded — ZMW ${Number(payAmt).toFixed(2)} from ${payStudentName} (${method})`, created: 'payment', data: payment });
      }

      // ============ CREATE BUDGET ============
      case 'CREATE_BUDGET': {
        const { name: budgetName, period, year, startDate: bStart, endDate: bEnd, items: budgetItems, notes: budgetNotes } = params;
        if (!budgetName || !period || !year || !bStart || !bEnd || !budgetItems?.length) {
          return res.status(400).json({ error: 'name, period, year, startDate, endDate, and items are required' });
        }
        const totalBudget = budgetItems.reduce((sum: number, i: any) => sum + Number(i.allocated || 0), 0);
        const budget = await prisma.budget.create({
          data: {
            name: budgetName.trim(),
            period,
            year: Number(year),
            startDate: new Date(bStart),
            endDate: new Date(bEnd),
            totalBudget,
            totalSpent: 0,
            status: 'DRAFT',
            notes: budgetNotes || null,
            createdBy: user.userId,
            branchId: branchId || null,
            items: {
              create: budgetItems.map((i: any) => ({
                category: i.category as any,
                description: i.description || null,
                allocated: Number(i.allocated),
                spent: 0,
                remaining: Number(i.allocated),
              })),
            },
          },
        });
        return res.json({ success: true, message: `Budget "${budget.name}" created — ZMW ${totalBudget.toFixed(2)} total (${budgetItems.length} categories)`, created: 'budget', data: budget });
      }

      // ============ PETTY CASH TRANSACTION ============
      case 'CREATE_PETTY_CASH_TRANSACTION': {
        const { accountName, type: pcType, amount: pcAmt, description: pcDesc, category: pcCat } = params;
        if (!accountName || !pcType || !pcAmt || pcAmt <= 0 || !pcDesc) {
          return res.status(400).json({ error: 'accountName, type, amount, and description are required' });
        }
        const account = await prisma.pettyCashAccount.findFirst({
          where: { name: { contains: accountName, mode: 'insensitive' }, isActive: true },
        });
        if (!account) return res.status(404).json({ error: `Petty cash account "${accountName}" not found` });

        // Update balance
        const balanceChange = pcType === 'REPLENISHMENT' ? Number(pcAmt) : -Number(pcAmt);
        if (pcType === 'DISBURSEMENT' && Number(account.balance) < Number(pcAmt)) {
          return res.status(400).json({ error: `Insufficient petty cash balance (ZMW ${Number(account.balance).toFixed(2)} available)` });
        }

        const [txn] = await prisma.$transaction([
          prisma.pettyCashTransaction.create({
            data: {
              accountId: account.id,
              type: pcType as any,
              amount: Number(pcAmt),
              description: pcDesc.trim(),
              category: pcCat || null,
              recordedBy: user.userId,
            },
          }),
          prisma.pettyCashAccount.update({
            where: { id: account.id },
            data: { balance: { increment: balanceChange } },
          }),
        ]);
        return res.json({ success: true, message: `Petty cash ${pcType.toLowerCase()} of ZMW ${Number(pcAmt).toFixed(2)} recorded for "${account.name}"`, created: 'petty_cash_transaction', data: txn });
      }

      // ============ CREATE FEE TEMPLATE ============
      case 'CREATE_FEE_TEMPLATE': {
        const { name: feeName, amount: feeAmt, applicableGrade, academicTermName, categoryName } = params;
        if (!feeName || !feeAmt || feeAmt <= 0 || applicableGrade === undefined || !academicTermName) {
          return res.status(400).json({ error: 'name, amount, applicableGrade, and academicTermName are required' });
        }
        // Look up academic term by name
        const term = await prisma.academicTerm.findFirst({
          where: { name: { contains: academicTermName, mode: 'insensitive' } },
          orderBy: { startDate: 'desc' },
        });
        if (!term) return res.status(404).json({ error: `Academic term "${academicTermName}" not found` });

        let categoryId: string | null = null;
        if (categoryName) {
          const cat = await prisma.feeCategory.findFirst({ where: { name: { contains: categoryName, mode: 'insensitive' } } });
          if (cat) categoryId = cat.id;
        }

        const feeTemplate = await prisma.feeTemplate.create({
          data: {
            name: feeName.trim(),
            amount: Number(feeAmt),
            applicableGrade: Number(applicableGrade),
            academicTermId: term.id,
            categoryId,
          },
        });
        return res.json({ success: true, message: `Fee template "${feeTemplate.name}" created — ZMW ${Number(feeAmt).toFixed(2)} for grade ${applicableGrade}`, created: 'fee_template', data: feeTemplate });
      }

      // ============ DEBT COLLECTION (existing) ============
      case 'SEND_REMINDERS':
        // Forward to debt collection — this action is handled by the frontend calling /debt-collection/send directly
        return res.json({ success: true, message: 'Use the Send Reminders button to execute this action', forward: '/debt-collection/send', params });

      case 'CREATE_CAMPAIGN':
        return res.json({ success: true, message: 'Use the Create Campaign button to execute this action', forward: '/debt-collection/campaigns', params });

      case 'VIEW_DEBTORS':
        return res.json({ success: true, message: 'Switch to the Debt Collection tab to view all debtors' });

      default:
        return res.status(400).json({ error: `Unknown action type: ${type}` });
    }
  } catch (error: any) {
    console.error('AI Action execution error:', error);
    res.status(500).json({ error: error.message || 'Failed to execute action' });
  }
};
