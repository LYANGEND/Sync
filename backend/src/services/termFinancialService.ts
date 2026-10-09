/**
 * Term Financial Service
 * 
 * Handles term-based financial operations including:
 * - Term financial summaries and reporting
 * - Term-to-term comparisons
 * - Student fee tracking by term
 * - Outstanding balance calculations per term
 */

import { prisma } from '../utils/prisma';
import { runTermWriteTransaction } from './termLifecycleService';

export interface TermFinancialSummary {
  termId: string;
  termName: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  totalFeesExpected: number;
  totalFeesCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  totalCashReceived: number;
  totalRefunded: number;
  netCashReceived: number;
  unallocatedCredit: number;
  cashCollected: number;
  mobileMoneyCollected: number;
  bankCollected: number;
  totalStudents: number;
  studentsFullyPaid: number;
  studentsPartiallyPaid: number;
  studentsNotPaid: number;
  lastCalculatedAt: Date;
}

export interface StudentTermBalance {
  studentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  paymentStatus: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'NOT_PAID';
  feeBreakdown: {
    feeName: string;
    amountDue: number;
    amountPaid: number;
    balance: number;
  }[];
}

export interface TermComparison {
  terms: {
    id: string;
    name: string;
    collectionRate: number;
    totalCollected: number;
    totalOutstanding: number;
  }[];
  insights: {
    bestPerformingTerm: string;
    worstPerformingTerm: string;
    averageCollectionRate: number;
    totalRevenueAllTerms: number;
  };
}

/**
 * Get financial summary for a specific term
 */
export async function getTermFinancialSummary(
  termId: string,
  branchId?: string
): Promise<TermFinancialSummary | null> {
  const term = await prisma.academicTerm.findUnique({
    where: { id: termId },
    include: {
      financialSummaries: {
        where: { branchId: branchId || null }
      }
    }
  });

  if (!term) return null;

  const summary = term.financialSummaries[0];

  if (!summary) {
    // Generate summary if it doesn't exist
    await recalculateTermSummary(termId, branchId);
    return getTermFinancialSummary(termId, branchId);
  }

  return {
    termId: term.id,
    termName: term.name,
    startDate: term.startDate,
    endDate: term.endDate,
    isActive: term.isActive,
    totalFeesExpected: Number(summary.totalFeesExpected),
    totalFeesCollected: Number(summary.totalFeesCollected),
    totalOutstanding: Number(summary.totalOutstanding),
    collectionRate: Number(summary.collectionRate),
    totalCashReceived: Number(summary.totalCashReceived),
    totalRefunded: Number(summary.totalRefunded),
    netCashReceived: Number(summary.netCashReceived),
    unallocatedCredit: Number(summary.unallocatedCredit),
    cashCollected: Number(summary.cashCollected),
    mobileMoneyCollected: Number(summary.mobileMoneyCollected),
    bankCollected: Number(summary.bankCollected),
    totalStudents: summary.totalStudents,
    studentsFullyPaid: summary.studentsFullyPaid,
    studentsPartiallyPaid: summary.studentsPartiallyPaid,
    studentsNotPaid: summary.studentsNotPaid,
    lastCalculatedAt: summary.lastCalculatedAt
  };
}

export type AgeingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

/** Days past the earliest fee due date; zero or less means not yet due. */
export function getAgeingBucket(ageDays: number): AgeingBucket {
  if (ageDays <= 0) return 'current';
  if (ageDays <= 30) return '1-30';
  if (ageDays <= 60) return '31-60';
  if (ageDays <= 90) return '61-90';
  return '90+';
}

/**
 * Per-student balance for a term: fees billed minus completed payments received.
 * Single source for "still owed", debtor counts and fee reminders. Payments are
 * counted whether or not they have been allocated to individual fee lines.
 */
export async function getTermStudentBalances(termId: string, branchId?: string, studentIds?: string[]) {
  const studentScope = {
    ...(branchId ? { branchId } : {}),
    ...(studentIds && studentIds.length > 0 ? { id: { in: studentIds } } : {}),
  };
  const [feeStructures, paymentsByStudent] = await Promise.all([
    prisma.studentFeeStructure.findMany({
      where: { academicTermId: termId, student: studentScope },
      select: { studentId: true, amountDue: true, dueDate: true },
    }),
    prisma.payment.groupBy({
      by: ['studentId'],
      where: { status: 'COMPLETED', academicTermId: termId, student: studentScope },
      _sum: { amount: true },
    }),
  ]);

  const totals = new Map<string, { billed: number; paid: number; feeCount: number; earliestDueDate: Date | null }>();
  for (const fee of feeStructures) {
    const entry = totals.get(fee.studentId) || { billed: 0, paid: 0, feeCount: 0, earliestDueDate: null };
    entry.billed += Number(fee.amountDue);
    entry.feeCount += 1;
    if (fee.dueDate && (!entry.earliestDueDate || fee.dueDate < entry.earliestDueDate)) entry.earliestDueDate = fee.dueDate;
    totals.set(fee.studentId, entry);
  }
  for (const payment of paymentsByStudent) {
    const entry = totals.get(payment.studentId) || { billed: 0, paid: 0, feeCount: 0, earliestDueDate: null };
    entry.paid += Number(payment._sum.amount || 0);
    totals.set(payment.studentId, entry);
  }

  const students = await prisma.student.findMany({
    where: { id: { in: Array.from(totals.keys()) } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNumber: true,
      status: true,
      guardianName: true,
      guardianEmail: true,
      guardianPhone: true,
      class: { select: { name: true } },
      termEnrollments: { where: { academicTermId: termId }, select: { class: { select: { name: true } } }, take: 1 },
    },
  });

  return students.map(student => {
    const entry = totals.get(student.id)!;
    return {
      ...student,
      className: student.termEnrollments[0]?.class.name || student.class?.name || 'No class',
      billed: entry.billed,
      paid: entry.paid,
      balance: entry.billed - entry.paid,
      feeCount: entry.feeCount,
      earliestDueDate: entry.earliestDueDate,
    };
  });
}

/**
 * Get all students with outstanding balances for a specific term
 */
export async function getTermOutstandingBalances(
  termId: string,
  branchId?: string
): Promise<StudentTermBalance[]> {
  const feeStructures = await prisma.studentFeeStructure.findMany({
    where: {
      academicTermId: termId,
      ...(branchId && {
        student: {
          branchId: branchId
        }
      })
    },
    include: {
      student: {
        include: {
          termEnrollments: {
            where: { academicTermId: termId },
            include: { class: true },
            take: 1
          }
        }
      },
      feeTemplate: true
    }
  });

  // Group by student
  const studentMap = new Map<string, any>();

  for (const fee of feeStructures) {
    const placement = fee.student.termEnrollments[0];
    if (!placement) continue;
    if (!studentMap.has(fee.studentId)) {
      studentMap.set(fee.studentId, {
        studentId: fee.student.id,
        studentName: `${fee.student.firstName} ${fee.student.lastName}`,
        admissionNumber: fee.student.admissionNumber,
        className: placement.class.name,
        totalDue: 0,
        totalPaid: 0,
        feeBreakdown: []
      });
    }

    const student = studentMap.get(fee.studentId);
    const balance = Number(fee.amountDue) - Number(fee.amountPaid);

    student.totalDue += Number(fee.amountDue);
    student.totalPaid += Number(fee.amountPaid);
    student.feeBreakdown.push({
      feeName: fee.feeTemplate.name,
      amountDue: Number(fee.amountDue),
      amountPaid: Number(fee.amountPaid),
      balance: balance
    });
  }

  // Convert to array and add payment status
  const results: StudentTermBalance[] = Array.from(studentMap.values()).map(student => {
    const balance = student.totalDue - student.totalPaid;
    let paymentStatus: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'NOT_PAID';

    if (student.totalPaid >= student.totalDue) {
      paymentStatus = 'FULLY_PAID';
    } else if (student.totalPaid > 0) {
      paymentStatus = 'PARTIALLY_PAID';
    } else {
      paymentStatus = 'NOT_PAID';
    }

    return {
      ...student,
      balance,
      paymentStatus
    };
  });

  // Filter out fully paid students and sort by balance descending
  return results
    .filter(s => s.balance > 0)
    .sort((a, b) => b.balance - a.balance);
}

/**
 * Get student's fee breakdown across all terms
 */
export async function getStudentFeesByTerm(
  studentId: string
): Promise<{
  termId: string;
  termName: string;
  totalDue: number;
  totalPaid: number;
  balance: number;
  fees: {
    feeName: string;
    amountDue: number;
    amountPaid: number;
  }[];
}[]> {
  const feeStructures = await prisma.studentFeeStructure.findMany({
    where: { studentId },
    include: {
      academicTerm: true,
      feeTemplate: true
    },
    orderBy: {
      academicTerm: {
        startDate: 'desc'
      }
    }
  });

  // Group by term
  const termMap = new Map<string, any>();

  for (const fee of feeStructures) {
    if (!termMap.has(fee.academicTermId)) {
      termMap.set(fee.academicTermId, {
        termId: fee.academicTerm.id,
        termName: fee.academicTerm.name,
        totalDue: 0,
        totalPaid: 0,
        fees: []
      });
    }

    const term = termMap.get(fee.academicTermId);
    term.totalDue += Number(fee.amountDue);
    term.totalPaid += Number(fee.amountPaid);
    term.fees.push({
      feeName: fee.feeTemplate.name,
      amountDue: Number(fee.amountDue),
      amountPaid: Number(fee.amountPaid)
    });
  }

  return Array.from(termMap.values()).map(term => ({
    ...term,
    balance: term.totalDue - term.totalPaid
  }));
}

/**
 * Compare financial performance across multiple terms
 */
export async function compareTerms(
  termIds: string[],
  branchId?: string
): Promise<TermComparison> {
  const summaries = await Promise.all(
    termIds.map(id => getTermFinancialSummary(id, branchId))
  );

  const validSummaries = summaries.filter(s => s !== null) as TermFinancialSummary[];

  if (validSummaries.length === 0) {
    throw new Error('No valid term summaries found');
  }

  const terms = validSummaries.map(s => ({
    id: s.termId,
    name: s.termName,
    collectionRate: s.collectionRate,
    totalCollected: s.totalFeesCollected,
    totalOutstanding: s.totalOutstanding
  }));

  // Find best and worst performing terms
  const sortedByRate = [...terms].sort((a, b) => b.collectionRate - a.collectionRate);
  const bestPerformingTerm = sortedByRate[0]?.name || 'N/A';
  const worstPerformingTerm = sortedByRate[sortedByRate.length - 1]?.name || 'N/A';

  // Calculate averages
  const averageCollectionRate = terms.reduce((sum, t) => sum + t.collectionRate, 0) / terms.length;
  const totalRevenueAllTerms = terms.reduce((sum, t) => sum + t.totalCollected, 0);

  return {
    terms,
    insights: {
      bestPerformingTerm,
      worstPerformingTerm,
      averageCollectionRate,
      totalRevenueAllTerms
    }
  };
}

/**
 * Recalculate financial summary for a term
 */
export async function recalculateTermSummary(
  termId: string,
  branchId?: string
): Promise<void> {
  await runTermWriteTransaction(termId, 'FINANCIAL_RECEIPT', async tx => {
    const feeStructures = await tx.studentFeeStructure.findMany({
      where: {
        academicTermId: termId,
        ...(branchId && {
          student: {
            branchId: branchId
          }
        })
      }
    });

    const payments = await tx.payment.findMany({
      where: {
        academicTermId: termId,
        status: 'COMPLETED',
        ...(branchId && { branchId })
      },
      include: {
        refunds: {
          where: { status: 'PROCESSED' },
          select: { amount: true },
        },
        allocations: {
          select: {
            amount: true,
            refundAllocations: {
              where: { refund: { status: 'PROCESSED' } },
              select: { amount: true },
            },
          },
        },
      },
    });

    const totalExpected = feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
    const totalCollected = feeStructures.reduce((sum, f) => sum + Number(f.amountPaid), 0);
    const totalOutstanding = feeStructures.reduce(
      (sum, fee) => sum + Math.max(0, Number(fee.amountDue) - Number(fee.amountPaid)),
      0,
    );
    const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

    const paymentCash = payments.map(payment => {
      const refunded = payment.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
      const allocated = payment.allocations.reduce((sum, allocation) => {
        const reversed = allocation.refundAllocations.reduce(
          (reversalSum, reversal) => reversalSum + Number(reversal.amount),
          0,
        );
        return sum + Number(allocation.amount) - reversed;
      }, 0);
      const gross = Number(payment.amount);
      const net = Math.max(0, gross - refunded);
      return {
        method: payment.method,
        gross,
        refunded,
        net,
        unallocated: Math.max(0, net - allocated),
      };
    });
    const totalCashReceived = paymentCash.reduce((sum, payment) => sum + payment.gross, 0);
    const totalRefunded = paymentCash.reduce((sum, payment) => sum + payment.refunded, 0);
    const netCashReceived = paymentCash.reduce((sum, payment) => sum + payment.net, 0);
    const unallocatedCredit = paymentCash.reduce((sum, payment) => sum + payment.unallocated, 0);

    const cashTotal = paymentCash
      .filter(p => p.method === 'CASH')
      .reduce((sum, p) => sum + p.net, 0);

    const mobileMoneyTotal = paymentCash
      .filter(p => p.method === 'MOBILE_MONEY')
      .reduce((sum, p) => sum + p.net, 0);

    const bankTotal = paymentCash
      .filter(p => p.method === 'BANK_DEPOSIT')
      .reduce((sum, p) => sum + p.net, 0);

    const studentStats = calculateStudentStats(feeStructures);

    const summaryData = {
      totalFeesExpected: totalExpected,
      totalFeesCollected: totalCollected,
      totalOutstanding: totalOutstanding,
      collectionRate: collectionRate,
      totalCashReceived,
      totalRefunded,
      netCashReceived,
      unallocatedCredit,
      cashCollected: cashTotal,
      mobileMoneyCollected: mobileMoneyTotal,
      bankCollected: bankTotal,
      totalStudents: studentStats.total,
      studentsFullyPaid: studentStats.fullyPaid,
      studentsPartiallyPaid: studentStats.partiallyPaid,
      studentsNotPaid: studentStats.notPaid,
      lastCalculatedAt: new Date()
    };

    const existingSummary = await tx.termFinancialSummary.findFirst({
      where: {
        academicTermId: termId,
        branchId: branchId || null
      }
    });

    if (existingSummary) {
      await tx.termFinancialSummary.update({
        where: { id: existingSummary.id },
        data: summaryData
      });
    } else {
      await tx.termFinancialSummary.create({
        data: {
          academicTermId: termId,
          ...(branchId && { branchId }),
          ...summaryData
        }
      });
    }
  });
}

function calculateStudentStats(feeStructures: any[]) {
  const studentMap = new Map<string, { due: number; paid: number }>();

  for (const fee of feeStructures) {
    const existing = studentMap.get(fee.studentId) || { due: 0, paid: 0 };
    studentMap.set(fee.studentId, {
      due: existing.due + Number(fee.amountDue),
      paid: existing.paid + Number(fee.amountPaid)
    });
  }

  let fullyPaid = 0;
  let partiallyPaid = 0;
  let notPaid = 0;

  for (const [_, stats] of studentMap) {
    if (stats.paid >= stats.due) {
      fullyPaid++;
    } else if (stats.paid > 0) {
      partiallyPaid++;
    } else {
      notPaid++;
    }
  }

  return {
    total: studentMap.size,
    fullyPaid,
    partiallyPaid,
    notPaid
  };
}

/**
 * Get all term summaries for a branch (or all branches)
 */
export async function getAllTermSummaries(
  branchId?: string
): Promise<TermFinancialSummary[]> {
  const terms = await prisma.academicTerm.findMany({
    include: {
      financialSummaries: {
        where: { branchId: branchId || null }
      }
    },
    orderBy: { startDate: 'desc' }
  });

  const summaries: TermFinancialSummary[] = [];

  for (const term of terms) {
    const summary = term.financialSummaries[0];
    
    if (summary) {
      summaries.push({
        termId: term.id,
        termName: term.name,
        startDate: term.startDate,
        endDate: term.endDate,
        isActive: term.isActive,
        totalFeesExpected: Number(summary.totalFeesExpected),
        totalFeesCollected: Number(summary.totalFeesCollected),
        totalOutstanding: Number(summary.totalOutstanding),
        collectionRate: Number(summary.collectionRate),
        totalCashReceived: Number(summary.totalCashReceived),
        totalRefunded: Number(summary.totalRefunded),
        netCashReceived: Number(summary.netCashReceived),
        unallocatedCredit: Number(summary.unallocatedCredit),
        cashCollected: Number(summary.cashCollected),
        mobileMoneyCollected: Number(summary.mobileMoneyCollected),
        bankCollected: Number(summary.bankCollected),
        totalStudents: summary.totalStudents,
        studentsFullyPaid: summary.studentsFullyPaid,
        studentsPartiallyPaid: summary.studentsPartiallyPaid,
        studentsNotPaid: summary.studentsNotPaid,
        lastCalculatedAt: summary.lastCalculatedAt
      });
    }
  }

  return summaries;
}

export default {
  getTermFinancialSummary,
  getTermOutstandingBalances,
  getStudentFeesByTerm,
  compareTerms,
  recalculateTermSummary,
  getAllTermSummaries
};
