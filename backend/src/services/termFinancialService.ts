/**
 * Term Financial Service
 * 
 * Handles term-based financial operations including:
 * - Term financial summaries and reporting
 * - Term-to-term comparisons
 * - Student fee tracking by term
 * - Outstanding balance calculations per term
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
          class: true
        }
      },
      feeTemplate: true
    }
  });

  // Group by student
  const studentMap = new Map<string, any>();

  for (const fee of feeStructures) {
    if (!studentMap.has(fee.studentId)) {
      studentMap.set(fee.studentId, {
        studentId: fee.student.id,
        studentName: `${fee.student.firstName} ${fee.student.lastName}`,
        admissionNumber: fee.student.admissionNumber,
        className: fee.student.class.name,
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
  const feeStructures = await prisma.studentFeeStructure.findMany({
    where: {
      academicTermId: termId,
      ...(branchId && {
        student: {
          branchId: branchId
        }
      })
    }
  });

  const payments = await prisma.payment.findMany({
    where: {
      academicTermId: termId,
      status: 'COMPLETED',
      ...(branchId && { branchId })
    }
  });

  const totalExpected = feeStructures.reduce((sum, f) => sum + Number(f.amountDue), 0);
  const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const totalOutstanding = totalExpected - totalCollected;
  const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;

  const cashTotal = payments
    .filter(p => p.method === 'CASH')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const mobileMoneyTotal = payments
    .filter(p => p.method === 'MOBILE_MONEY')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const bankTotal = payments
    .filter(p => p.method === 'BANK_DEPOSIT')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const studentStats = calculateStudentStats(feeStructures);

  const summaryData = {
    totalFeesExpected: totalExpected,
    totalFeesCollected: totalCollected,
    totalOutstanding: totalOutstanding,
    collectionRate: collectionRate,
    cashCollected: cashTotal,
    mobileMoneyCollected: mobileMoneyTotal,
    bankCollected: bankTotal,
    totalStudents: studentStats.total,
    studentsFullyPaid: studentStats.fullyPaid,
    studentsPartiallyPaid: studentStats.partiallyPaid,
    studentsNotPaid: studentStats.notPaid,
    lastCalculatedAt: new Date()
  };

  const existingSummary = await prisma.termFinancialSummary.findFirst({
    where: {
      academicTermId: termId,
      branchId: branchId || null
    }
  });

  if (existingSummary) {
    await prisma.termFinancialSummary.update({
      where: { id: existingSummary.id },
      data: summaryData
    });
  } else {
    await prisma.termFinancialSummary.create({
      data: {
        academicTermId: termId,
        ...(branchId && { branchId }),
        ...summaryData
      }
    });
  }
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
