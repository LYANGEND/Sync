/**
 * AI Parent Report Letter Service
 * ────────────────────────────────
 * Generates a warm, personalised narrative letter to a student's
 * guardian summarising the term's academic performance, attendance,
 * behaviour highlights, and forward-looking encouragement.
 *
 * Key inputs  : studentId, termId
 * Key outputs : HTML-ready letter string + plain-text version
 */

import { prisma } from '../utils/prisma';
import aiService from './aiService';

export interface ParentLetterResponse {
  studentId: string;
  studentName: string;
  guardianName: string | null;
  termName: string;
  letterHtml: string;
  letterPlainText: string;
  generatedAt: string;
}

export async function generateParentLetter(
  studentId: string,
  termId: string,
): Promise<ParentLetterResponse> {
  // ── 1. Load student with class ───────────────────────────────────────
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: {
        select: { name: true, gradeLevel: true },
      },
    },
  });
  if (!student) throw new Error('Student not found');

  // ── 2. Load term ─────────────────────────────────────────────────────
  const term = await prisma.academicTerm.findUnique({ where: { id: termId } });
  if (!term) throw new Error('Term not found');

  // ── 3. Load term results for this student ────────────────────────────
  const termResults = await prisma.termResult.findMany({
    where: { studentId, termId },
    include: { subject: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  // ── 4. Load attendance ───────────────────────────────────────────────
  // Attendance for the whole term (use term dates if available)
  const attendanceWhere: any = { studentId };
  if (term.startDate) attendanceWhere.date = { gte: new Date(term.startDate) };
  if (term.endDate) {
    attendanceWhere.date = { ...(attendanceWhere.date || {}), lte: new Date(term.endDate) };
  }

  const attendance = await prisma.attendance.findMany({
    where: attendanceWhere,
    select: { status: true } as any,
  });

  const totalDays = attendance.length;
  const presentDays = (attendance as any[]).filter(
    (a: any) => a.status === 'PRESENT' || a.status === 'LATE',
  ).length;
  const absentDays = totalDays - presentDays;
  const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : null;

  // ── 5. Load student term report (if exists) ──────────────────────────
  const termReport = await (prisma.studentTermReport as any).findFirst({
    where: { studentId, termId },
    select: {
      classTeacherRemark: true,
      principalRemark: true,
      conductGrade: true,
      position: true,
      totalStudents: true,
    },
  });

  // ── 6. Build subject summary ─────────────────────────────────────────
  const subjectSummary = termResults.map((r: any) => ({
    name: r.subject.name,
    score: Number(r.totalScore),
    grade: r.grade || 'N/A',
  }));

  const avgScore =
    subjectSummary.length > 0
      ? subjectSummary.reduce((sum, s) => sum + s.score, 0) / subjectSummary.length
      : null;

  const topSubjects = [...subjectSummary].sort((a, b) => b.score - a.score).slice(0, 3);
  const weakSubjects = [...subjectSummary].sort((a, b) => a.score - b.score).slice(0, 2);

  // ── 7. Determine guardian name ───────────────────────────────────────
  const guardianName =
    (student as any).guardianName ||
    (student as any).parentName ||
    null;

  const salutation = guardianName
    ? `Dear ${guardianName},`
    : `Dear Parent/Guardian of ${student.firstName} ${student.lastName},`;

  // ── 8. Build AI prompt ───────────────────────────────────────────────
  const prompt = `Write a warm, professional, and personalised parent/guardian letter for a Zambian school.

STUDENT DETAILS:
- Name: ${student.firstName} ${student.lastName}
- Class: ${(student as any).class?.name} (Grade ${(student as any).class?.gradeLevel})
- Term: ${term.name}
- Gender: ${student.gender || 'Not specified'}

ACADEMIC PERFORMANCE:
- Overall Average: ${avgScore !== null ? avgScore.toFixed(1) + '%' : 'N/A'}
- Class Position: ${termReport?.position ? `${termReport.position} out of ${termReport.totalStudents}` : 'N/A'}
- Subject Results: ${subjectSummary.map(s => `${s.name}: ${s.score}% (${s.grade})`).join(', ')}
- Top Subjects: ${topSubjects.map(s => s.name).join(', ')}
- Subjects Needing Attention: ${weakSubjects.filter(s => s.score < 60).map(s => s.name).join(', ') || 'None'}

ATTENDANCE:
- Days Present: ${presentDays} / ${totalDays} (${attendanceRate !== null ? attendanceRate + '%' : 'N/A'} attendance rate)
- Days Absent: ${absentDays}

TEACHER REMARKS:
- Class Teacher: "${termReport?.classTeacherRemark || 'Not recorded'}"
- Conduct Grade: ${termReport?.conductGrade || 'Not recorded'}

SALUTATION TO USE: "${salutation}"

Write a letter that:
1. Opens with the salutation above
2. Has a warm personal greeting about the term
3. Highlights the student's achievements and strengths specifically 
4. Addresses attendance honestly but encouragingly
5. Acknowledges weaker subjects with constructive suggestions (e.g., tutoring, revision)
6. Ends with forward-looking encouragement for next term
7. Signs off as "The Academic Team" for the school

Tone: Warm, professional, encouraging, and parent-friendly. NOT robotic or generic.
Length: 4–6 paragraphs. 

Return JSON:
{
  "letterPlainText": "...",
  "letterHtml": "<p>...</p><p>...</p>..."
}`;

  let aiResult: any = { letterPlainText: '', letterHtml: '' };
  try {
    aiResult = await aiService.generateJSON<any>(prompt, {
      systemPrompt: `You are a compassionate school administrator writing parent letters for a Zambian school. 
Always write warm, specific letters — never generic. Use the student's actual performance data.`,
      temperature: 0.7,
    });
  } catch (err) {
    console.error('[ParentLetter] AI generation failed:', err);
    // Fallback: generate plain text
    const fallbackContent = await aiService.generateText(prompt, {
      systemPrompt: 'Write a parent letter for a Zambian school.',
      temperature: 0.7,
    });
    aiResult = {
      letterPlainText: fallbackContent,
      letterHtml: `<p>${fallbackContent.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
    };
  }

  return {
    studentId,
    studentName: `${student.firstName} ${student.lastName}`,
    guardianName,
    termName: term.name,
    letterHtml: aiResult.letterHtml || '',
    letterPlainText: aiResult.letterPlainText || '',
    generatedAt: new Date().toISOString(),
  };
}
