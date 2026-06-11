/**
 * Migration Script: Add Term-Based Financial Tracking
 * 
 * This script migrates existing financial data to support term-based separation:
 * 1. Links StudentFeeStructures to their respective terms
 * 2. Associates existing payments with terms based on payment date
 * 3. Generates initial TermFinancialSummary records for all terms
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting term-based financial migration...\n');

  try {
    // Step 1: Link StudentFeeStructures to terms via their FeeTemplate
    console.log('📋 Step 1: Linking fee structures to terms...');
    await linkFeeStructuresToTerms();

    // Step 2: Associate payments with terms based on payment date
    console.log('\n💰 Step 2: Associating payments with terms...');
    await linkPaymentsToTerms();

    // Step 3: Generate term financial summaries
    console.log('\n📊 Step 3: Generating term financial summaries...');
    await generateAllTermSummaries();

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function linkFeeStructuresToTerms() {
  const feeStructures = await prisma.studentFeeStructure.findMany({
    include: { 
      feeTemplate: true,
      student: true 
    }
  });

  console.log(`   Found ${feeStructures.length} fee structures to process`);

  let updated = 0;
  let skipped = 0;

  for (const structure of feeStructures) {
    try {
      // Check if academicTermId already exists (in case of re-run)
      if ((structure as any).academicTermId) {
        skipped++;
        continue;
      }

      await prisma.studentFeeStructure.update({
        where: { id: structure.id },
        data: {
          academicTermId: structure.feeTemplate.academicTermId
        }
      });
      updated++;

      if (updated % 100 === 0) {
        console.log(`   Processed ${updated} fee structures...`);
      }
    } catch (error) {
      console.error(`   ⚠️  Failed to update fee structure ${structure.id}:`, error);
    }
  }

  console.log(`   ✓ Updated: ${updated}, Skipped: ${skipped}`);
}

async function linkPaymentsToTerms() {
  // Get all payments without a term assignment
  const payments = await prisma.payment.findMany({
    where: { 
      academicTermId: null,
      status: 'COMPLETED' // Only process completed payments
    },
    include: { student: true }
  });

  console.log(`   Found ${payments.length} payments to process`);

  // Get all terms ordered by date
  const terms = await prisma.academicTerm.findMany({
    orderBy: { startDate: 'asc' }
  });

  console.log(`   Found ${terms.length} academic terms`);

  let updated = 0;
  let unmatched = 0;

  for (const payment of payments) {
    try {
      // Find which term this payment falls into based on payment date
      const term = terms.find(t => 
        payment.paymentDate >= t.startDate && 
        payment.paymentDate <= t.endDate
      );

      if (term) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { academicTermId: term.id }
        });
        updated++;
      } else {
        // Payment doesn't fall within any term - try to match to nearest term
        const nearestTerm = findNearestTerm(payment.paymentDate, terms);
        if (nearestTerm) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: { academicTermId: nearestTerm.id }
          });
          updated++;
          console.log(`   ℹ️  Payment ${payment.transactionId} matched to nearest term: ${nearestTerm.name}`);
        } else {
          unmatched++;
          console.log(`   ⚠️  Could not match payment ${payment.transactionId} to any term`);
        }
      }

      if (updated % 100 === 0) {
        console.log(`   Processed ${updated} payments...`);
      }
    } catch (error) {
      console.error(`   ⚠️  Failed to update payment ${payment.id}:`, error);
    }
  }

  console.log(`   ✓ Updated: ${updated}, Unmatched: ${unmatched}`);
}

function findNearestTerm(date: Date, terms: any[]) {
  if (terms.length === 0) return null;

  let nearest = terms[0];
  let minDiff = Math.abs(date.getTime() - terms[0].startDate.getTime());

  for (const term of terms) {
    const diff = Math.abs(date.getTime() - term.startDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      nearest = term;
    }
  }

  return nearest;
}

async function generateAllTermSummaries() {
  const terms = await prisma.academicTerm.findMany({
    orderBy: { startDate: 'desc' }
  });

  console.log(`   Generating summaries for ${terms.length} terms`);

  for (const term of terms) {
    try {
      await generateTermFinancialSummary(term.id, term.name);
    } catch (error) {
      console.error(`   ⚠️  Failed to generate summary for term ${term.name}:`, error);
    }
  }

  console.log(`   ✓ Generated summaries for all terms`);
}

async function generateTermFinancialSummary(termId: string, termName: string) {
  console.log(`   Processing: ${termName}`);

  // Get all fee structures for this term
  const feeStructures = await prisma.studentFeeStructure.findMany({
    where: { academicTermId: termId },
    include: { student: true }
  });

  // Get all completed payments for this term
  const payments = await prisma.payment.findMany({
    where: { 
      academicTermId: termId,
      status: 'COMPLETED'
    }
  });

  // Calculate totals
  const totalExpected = feeStructures.reduce((sum, f) => 
    sum + Number(f.amountDue), 0
  );

  const totalCollected = payments.reduce((sum, p) => 
    sum + Number(p.amount), 0
  );

  const totalOutstanding = totalExpected - totalCollected;
  const collectionRate = totalExpected > 0 
    ? (totalCollected / totalExpected) * 100 
    : 0;

  // Payment method breakdown
  const cashTotal = payments
    .filter(p => p.method === 'CASH')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const mobileMoneyTotal = payments
    .filter(p => p.method === 'MOBILE_MONEY')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  const bankTotal = payments
    .filter(p => p.method === 'BANK_DEPOSIT')
    .reduce((sum, p) => sum + Number(p.amount), 0);

  // Student payment status counts
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
      branchId: null
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
        ...summaryData
      }
    });
  }

  console.log(`      ✓ ${termName}: ${studentStats.total} students, ${collectionRate.toFixed(1)}% collected`);
}

function calculateStudentStats(feeStructures: any[]) {
  // Group by student
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

// Run the migration
main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
