/**
 * AI Grade Forecast Service
 * ─────────────────────────
 * Analyses each student's continuous assessment scores + attendance
 * for the current term and predicts their end-of-term score, grade,
 * and risk level using the configured AI model.
 *
 * Key inputs  : classId, optional subjectId
 * Key outputs : per-student forecast with confidence, grade prediction,
 *               risk flag, and personalised intervention tips.
 */

import { prisma } from '../utils/prisma';
import aiService from './aiService';

export interface StudentForecast {
  studentId: string;
  studentName: string;
  currentAverage: number | null;
  attendanceRate: number | null;
  predictedScore: number;
  predictedGrade: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: 'high' | 'medium' | 'low';
  trend: 'improving' | 'stable' | 'declining';
  interventions: string[];
  strengths: string[];
}

export interface GradeForecastResponse {
  classId: string;
  className: string;
  termName: string | null;
  subjectName: string | null;
  generatedAt: string;
  classAverageCurrent: number | null;
  classAveragePredicted: number;
  atRiskCount: number;
  students: StudentForecast[];
  classInsights: string;
}

export async function generateGradeForecast(
  classId: string,
  subjectId?: string,
): Promise<GradeForecastResponse> {
  // ── 1. Load class with students ──────────────────────────────────────
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      students: {
        where: { status: 'ACTIVE' },
        select: { id: true, firstName: true, lastName: true, gender: true },
        orderBy: { lastName: 'asc' },
      },
      academicTerm: { select: { id: true, name: true } },
    },
  });
  if (!cls) throw new Error('Class not found');

  const termId = cls.academicTerm?.id;
  const termName = cls.academicTerm?.name || null;
  const studentIds = cls.students.map((s: any) => s.id);

  // ── 2. Load subject name (optional filter) ───────────────────────────
  let subjectName: string | null = null;
  if (subjectId) {
    const subj = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { name: true },
    });
    subjectName = subj?.name || null;
  }

  // ── 3. Load term results (existing grades) ───────────────────────────
  const termResultsWhere: any = { classId };
  if (termId) termResultsWhere.termId = termId;
  if (subjectId) termResultsWhere.subjectId = subjectId;

  const termResults = await prisma.termResult.findMany({
    where: termResultsWhere,
    select: {
      studentId: true,
      totalScore: true,
      subjectId: true,
      grade: true,
    } as any,
  });

  // ── 4. Load continuous assessment results ───────────────────────────
  const assessmentResultsWhere: any = { studentId: { in: studentIds } };
  if (subjectId) {
    // Join via assessment → filter by subjectId
    const assessments = await (prisma.assessment as any).findMany({
      where: { classId, ...(subjectId ? { subjectId } : {}), ...(termId ? { termId } : {}) },
      select: { id: true, totalMarks: true, weight: true, date: true },
    });
    const assessmentIds = assessments.map((a: any) => a.id);
    if (assessmentIds.length > 0) {
      assessmentResultsWhere.assessmentId = { in: assessmentIds };
    }
  }

  const assessmentResults = await (prisma.assessmentResult as any).findMany({
    where: assessmentResultsWhere,
    include: {
      assessment: { select: { totalMarks: true, weight: true, date: true, type: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // ── 5. Load attendance for last 60 days ──────────────────────────────
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const attendance = await prisma.attendance.findMany({
    where: {
      studentId: { in: studentIds },
      date: { gte: sixtyDaysAgo },
    },
    select: { studentId: true, status: true } as any,
  });

  // ── 6. Aggregate per-student data ────────────────────────────────────
  interface StudentData {
    name: string;
    gender: string;
    termScores: number[];
    assessmentScores: { score: number; totalMarks: number; weight: number; dateStr: string }[];
    attendancePresent: number;
    attendanceTotal: number;
  }

  const studentDataMap: Record<string, StudentData> = {};
  for (const s of cls.students as any[]) {
    studentDataMap[s.id] = {
      name: `${s.firstName} ${s.lastName}`,
      gender: s.gender || 'Unknown',
      termScores: [],
      assessmentScores: [],
      attendancePresent: 0,
      attendanceTotal: 0,
    };
  }

  for (const r of termResults as any[]) {
    if (studentDataMap[r.studentId]) {
      studentDataMap[r.studentId].termScores.push(Number(r.totalScore));
    }
  }

  for (const ar of assessmentResults as any[]) {
    if (studentDataMap[ar.studentId] && ar.assessment) {
      studentDataMap[ar.studentId].assessmentScores.push({
        score: Number(ar.score),
        totalMarks: Number(ar.assessment.totalMarks),
        weight: Number(ar.assessment.weight || 1),
        dateStr: ar.assessment.date
          ? new Date(ar.assessment.date).toISOString().split('T')[0]
          : 'N/A',
      });
    }
  }

  for (const a of attendance as any[]) {
    if (studentDataMap[a.studentId]) {
      studentDataMap[a.studentId].attendanceTotal++;
      if (a.status === 'PRESENT' || a.status === 'LATE') {
        studentDataMap[a.studentId].attendancePresent++;
      }
    }
  }

  // ── 7. Build AI prompt ───────────────────────────────────────────────
  const studentSummaries = Object.entries(studentDataMap).map(([id, d]) => {
    const currentAvg =
      d.termScores.length > 0
        ? (d.termScores.reduce((a, b) => a + b, 0) / d.termScores.length).toFixed(1)
        : 'N/A';

    const assessmentSummary =
      d.assessmentScores.length > 0
        ? d.assessmentScores
            .map(a => `${(( a.score / a.totalMarks) * 100).toFixed(0)}% (wt:${a.weight}, ${a.dateStr})`)
            .join(', ')
        : 'No assessments recorded';

    const attRate =
      d.attendanceTotal > 0
        ? `${Math.round((d.attendancePresent / d.attendanceTotal) * 100)}%`
        : 'N/A';

    return `• ${d.name} [${id.slice(-6)}]: TermAvg=${currentAvg}%, Assessments=[${assessmentSummary}], Attendance=${attRate}`;
  });

  const prompt = `You are an educational data analyst for a Zambian school. 
Analyse these student academic profiles and predict their end-of-term performance.

CLASS: ${cls.name} (Grade ${cls.gradeLevel})${subjectName ? `, Subject: ${subjectName}` : ''}
TERM: ${termName || 'Current Term'}

STUDENT PROFILES:
${studentSummaries.join('\n')}

For EACH student, predict:
1. End-of-term score (0–100%)
2. Predicted grade (A, B, C, D, E, F — Zambian grading)
3. Risk level (low/medium/high/critical)
4. Trend (improving/stable/declining)
5. Confidence of prediction (high/medium/low — based on data completeness)
6. Top 2 specific interventions the teacher should take NOW
7. One identified strength

Return a JSON object with this exact structure:
{
  "students": [
    {
      "studentId": "last-6-chars-of-id",
      "predictedScore": 72,
      "predictedGrade": "B",
      "riskLevel": "low",
      "trend": "stable",
      "confidence": "medium",
      "interventions": ["Provide extra practice on weak areas", "Arrange peer tutoring"],
      "strengths": ["Shows consistent effort in assessments"]
    }
  ],
  "classInsights": "2-3 sentence overview of the class performance trend and main concerns"
}`;

  let aiResult: any = { students: [], classInsights: '' };
  try {
    aiResult = await aiService.generateJSON<any>(prompt, {
      systemPrompt: 'You are an educational data analyst. Always respond with valid JSON only.',
      temperature: 0.3,
    });
  } catch (err) {
    console.error('[GradeForecast] AI generation failed:', err);
  }

  // ── 8. Map AI results back to full student data ───────────────────────
  const aiStudentMap: Record<string, any> = {};
  for (const s of aiResult.students || []) {
    aiStudentMap[s.studentId] = s;
  }

  const students: StudentForecast[] = Object.entries(studentDataMap).map(([id, d]) => {
    const shortId = id.slice(-6);
    const ai = aiStudentMap[shortId] || {};
    const currentAvg =
      d.termScores.length > 0
        ? d.termScores.reduce((a, b) => a + b, 0) / d.termScores.length
        : null;
    const attendanceRate =
      d.attendanceTotal > 0
        ? Math.round((d.attendancePresent / d.attendanceTotal) * 100)
        : null;

    return {
      studentId: id,
      studentName: d.name,
      currentAverage: currentAvg !== null ? Number(currentAvg.toFixed(1)) : null,
      attendanceRate,
      predictedScore: ai.predictedScore ?? (currentAvg ? Math.round(currentAvg) : 50),
      predictedGrade: ai.predictedGrade ?? 'N/A',
      riskLevel: ai.riskLevel ?? (currentAvg && currentAvg < 40 ? 'high' : 'low'),
      confidence: ai.confidence ?? 'low',
      trend: ai.trend ?? 'stable',
      interventions: ai.interventions ?? [],
      strengths: ai.strengths ? (Array.isArray(ai.strengths) ? ai.strengths : [ai.strengths]) : [],
    };
  });

  const allCurrentAvgs = students.filter(s => s.currentAverage !== null).map(s => s.currentAverage as number);
  const classAverageCurrent =
    allCurrentAvgs.length > 0
      ? Number((allCurrentAvgs.reduce((a, b) => a + b, 0) / allCurrentAvgs.length).toFixed(1))
      : null;

  const allPredicted = students.map(s => s.predictedScore);
  const classAveragePredicted = Number(
    (allPredicted.reduce((a, b) => a + b, 0) / allPredicted.length).toFixed(1),
  );

  return {
    classId,
    className: cls.name,
    termName,
    subjectName,
    generatedAt: new Date().toISOString(),
    classAverageCurrent,
    classAveragePredicted,
    atRiskCount: students.filter(s => s.riskLevel === 'high' || s.riskLevel === 'critical').length,
    students,
    classInsights: aiResult.classInsights || '',
  };
}
