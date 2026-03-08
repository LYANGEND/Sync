/**
 * AI Fee Defaulter Prediction Service
 * ─────────────────────────────────────
 * Analyses each student's fee payment history (current + prior terms),
 * outstanding balances, and payment behaviour patterns, then uses AI
 * to score each student's default risk and suggest targeted actions.
 *
 * Key inputs  : termId (optional — defaults to active term)
 * Key outputs : per-student default risk profile + class-level summary
 */

import { prisma } from '../utils/prisma';
import aiService from './aiService';

export interface StudentDefaultRisk {
  studentId: string;
  studentName: string;
  className: string;
  totalFees: number;
  totalPaid: number;
  outstanding: number;
  paymentCompletionRate: number;      // 0–100 %
  daysOverdue: number;                // days since last expected payment
  priorTermDefaulted: boolean;
  riskScore: number;                  // 0–100 (higher = riskier)
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction: string;
  contactDetails: { phone: string | null; email: string | null };
  actionPriority: 'immediate' | 'this-week' | 'monitor';
}

export interface DefaulterPredictionResponse {
  termId: string;
  termName: string;
  generatedAt: string;
  totalStudentsAnalysed: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  totalOutstanding: number;
  projectedCollectionRate: number;
  students: StudentDefaultRisk[];
  executiveSummary: string;
  recommendedCampaigns: string[];
}

export async function predictFeeDefaulters(
  termId?: string,
): Promise<DefaulterPredictionResponse> {
  // ── 1. Resolve active term if not provided ───────────────────────────
  let term: any;
  if (termId) {
    term = await prisma.academicTerm.findUnique({ where: { id: termId } });
  } else {
    term = await prisma.academicTerm.findFirst({ where: { isActive: true } });
  }
  if (!term) throw new Error('No active academic term found');

  const resolvedTermId = term.id;

  // ── 2. Load all student fee structures for the term ─────────────────
  const feeStructures = await (prisma.studentFeeStructure as any).findMany({
    where: { termId: resolvedTermId },
    include: {
      student: {
        include: {
          class: { select: { name: true, gradeLevel: true } },
        },
      },
    },
  });

  if (feeStructures.length === 0) {
    return {
      termId: resolvedTermId,
      termName: term.name,
      generatedAt: new Date().toISOString(),
      totalStudentsAnalysed: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
      totalOutstanding: 0,
      projectedCollectionRate: 100,
      students: [],
      executiveSummary: 'No student fee structures found for this term.',
      recommendedCampaigns: [],
    };
  }

  const studentIds = feeStructures.map((f: any) => f.studentId);

  // ── 3. Load payment records for this term ────────────────────────────
  const payments = await (prisma.payment as any).findMany({
    where: {
      studentId: { in: studentIds },
      termId: resolvedTermId,
    },
    select: {
      studentId: true,
      amount: true,
      paidAt: true,
      status: true,
    },
  });

  // ── 4. Check prior term defaults ─────────────────────────────────────
  const priorTerms = await prisma.academicTerm.findMany({
    where: { isActive: false },
    orderBy: { startDate: 'desc' },
    take: 3,
    select: { id: true },
  });
  const priorTermIds = priorTerms.map((t: any) => t.id);

  const priorDefaulters = new Set<string>();
  if (priorTermIds.length > 0) {
    const priorStructures = await (prisma.studentFeeStructure as any).findMany({
      where: {
        studentId: { in: studentIds },
        termId: { in: priorTermIds },
      },
      select: { studentId: true, totalAmount: true },
    });

    const priorPayments = await (prisma.payment as any).findMany({
      where: {
        studentId: { in: studentIds },
        termId: { in: priorTermIds },
        status: 'PAID',
      },
      select: { studentId: true, amount: true },
    });

    // Aggregate prior payments per student
    const priorPaidMap: Record<string, number> = {};
    for (const p of priorPayments as any[]) {
      priorPaidMap[p.studentId] = (priorPaidMap[p.studentId] || 0) + Number(p.amount);
    }

    for (const fs of priorStructures as any[]) {
      const paid = priorPaidMap[fs.studentId] || 0;
      const total = Number(fs.totalAmount);
      if (total > 0 && paid / total < 0.5) {
        priorDefaulters.add(fs.studentId);
      }
    }
  }

  // ── 5. Aggregate per-student payment data ────────────────────────────
  const paidByStudent: Record<string, number> = {};
  const lastPaymentByStudent: Record<string, Date> = {};
  for (const p of payments as any[]) {
    if (p.status === 'PAID') {
      paidByStudent[p.studentId] = (paidByStudent[p.studentId] || 0) + Number(p.amount);
    }
    if (p.paidAt) {
      const paidAt = new Date(p.paidAt);
      if (!lastPaymentByStudent[p.studentId] || paidAt > lastPaymentByStudent[p.studentId]) {
        lastPaymentByStudent[p.studentId] = paidAt;
      }
    }
  }

  // ── 6. Build student risk profiles ───────────────────────────────────
  const now = new Date();
  const termStartDate = new Date(term.startDate || now);
  const daysSinceTermStart = Math.max(
    1,
    Math.round((now.getTime() - termStartDate.getTime()) / (1000 * 60 * 60 * 24)),
  );

  const studentProfiles: Array<{
    studentId: string;
    studentName: string;
    className: string;
    totalFees: number;
    totalPaid: number;
    outstanding: number;
    completionRate: number;
    daysOverdue: number;
    priorDefault: boolean;
    phone: string | null;
    email: string | null;
  }> = [];

  for (const fs of feeStructures as any[]) {
    const student = fs.student;
    if (!student) continue;

    const totalFees = Number(fs.totalAmount || 0);
    const totalPaid = paidByStudent[fs.studentId] || 0;
    const outstanding = Math.max(0, totalFees - totalPaid);
    const completionRate = totalFees > 0 ? Math.round((totalPaid / totalFees) * 100) : 100;

    const lastPay = lastPaymentByStudent[fs.studentId];
    const daysOverdue = lastPay
      ? Math.round((now.getTime() - lastPay.getTime()) / (1000 * 60 * 60 * 24))
      : daysSinceTermStart;

    studentProfiles.push({
      studentId: fs.studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      className: student.class?.name || 'Unknown',
      totalFees,
      totalPaid,
      outstanding,
      completionRate,
      daysOverdue,
      priorDefault: priorDefaulters.has(fs.studentId),
      phone: student.guardianPhone || null,
      email: student.guardianEmail || null,
    });
  }

  // ── 7. Build AI prompt ───────────────────────────────────────────────
  const profileSummaries = studentProfiles.map(p =>
    `${p.studentName} [${p.studentId.slice(-6)}] | ${p.className} | ` +
    `Paid ${p.completionRate}% (K${p.totalPaid.toFixed(0)}/K${p.totalFees.toFixed(0)}) | ` +
    `LastPay ${p.daysOverdue}d ago | PriorDefault=${p.priorDefault}`,
  );

  const aiPrompt = `You are a school financial risk analyst for a Zambian school. 
Analyse student fee payment profiles and predict default risk.

TERM: ${term.name}
DAYS INTO TERM: ${daysSinceTermStart}

STUDENT PAYMENT PROFILES:
${profileSummaries.slice(0, 80).join('\n')}

For EACH student (identified by last-6 chars of ID), predict:
- riskScore: 0–100 (higher = more likely to default)
- riskLevel: "low" | "medium" | "high" | "critical"
- recommendedAction: specific, actionable (e.g., "Call guardian immediately", "Send WhatsApp reminder", "Offer payment plan")
- actionPriority: "immediate" | "this-week" | "monitor"

Also provide:
- executiveSummary: 3-sentence overview of the school's fee collection health
- recommendedCampaigns: array of 3-5 school-wide actions to improve collection rate

Return JSON:
{
  "students": [
    {"studentId": "last6", "riskScore": 75, "riskLevel": "high", "recommendedAction": "...", "actionPriority": "immediate"}
  ],
  "executiveSummary": "...",
  "recommendedCampaigns": ["...", "..."]
}`;

  let aiResult: any = { students: [], executiveSummary: '', recommendedCampaigns: [] };
  try {
    aiResult = await aiService.generateJSON<any>(aiPrompt, {
      systemPrompt: 'You are a financial risk analyst. Respond with valid JSON only.',
      temperature: 0.2,
    });
  } catch (err) {
    console.error('[FeeDefaulter] AI generation failed:', err);
  }

  // ── 8. Merge AI results with student profiles ────────────────────────
  const aiStudentMap: Record<string, any> = {};
  for (const s of aiResult.students || []) {
    aiStudentMap[s.studentId] = s;
  }

  const students: StudentDefaultRisk[] = studentProfiles.map(p => {
    const shortId = p.studentId.slice(-6);
    const ai = aiStudentMap[shortId] || {};

    // Fallback risk scoring if AI didn't return data
    let riskScore = ai.riskScore;
    if (riskScore === undefined) {
      riskScore = 0;
      if (p.completionRate < 25) riskScore += 40;
      else if (p.completionRate < 50) riskScore += 25;
      else if (p.completionRate < 75) riskScore += 10;
      if (p.daysOverdue > 30) riskScore += 20;
      if (p.priorDefault) riskScore += 20;
      if (p.outstanding === 0) riskScore = 0;
    }

    const riskLevel: StudentDefaultRisk['riskLevel'] =
      ai.riskLevel ??
      (riskScore >= 75 ? 'critical' : riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low');

    return {
      studentId: p.studentId,
      studentName: p.studentName,
      className: p.className,
      totalFees: p.totalFees,
      totalPaid: p.totalPaid,
      outstanding: p.outstanding,
      paymentCompletionRate: p.completionRate,
      daysOverdue: p.daysOverdue,
      priorTermDefaulted: p.priorDefault,
      riskScore,
      riskLevel,
      recommendedAction: ai.recommendedAction ?? (p.outstanding === 0 ? 'No action needed' : 'Send payment reminder'),
      contactDetails: { phone: p.phone, email: p.email },
      actionPriority: ai.actionPriority ?? (riskLevel === 'critical' ? 'immediate' : riskLevel === 'high' ? 'this-week' : 'monitor'),
    };
  });

  // Sort by risk score descending
  students.sort((a, b) => b.riskScore - a.riskScore);

  const totalOutstanding = students.reduce((sum, s) => sum + s.outstanding, 0);
  const totalFees = students.reduce((sum, s) => sum + s.totalFees, 0);
  const projectedCollectionRate = totalFees > 0
    ? Math.round(((totalFees - totalOutstanding) / totalFees) * 100)
    : 100;

  return {
    termId: resolvedTermId,
    termName: term.name,
    generatedAt: new Date().toISOString(),
    totalStudentsAnalysed: students.length,
    criticalCount: students.filter(s => s.riskLevel === 'critical').length,
    highCount: students.filter(s => s.riskLevel === 'high').length,
    mediumCount: students.filter(s => s.riskLevel === 'medium').length,
    lowCount: students.filter(s => s.riskLevel === 'low').length,
    totalOutstanding,
    projectedCollectionRate,
    students,
    executiveSummary: aiResult.executiveSummary || '',
    recommendedCampaigns: aiResult.recommendedCampaigns || [],
  };
}
