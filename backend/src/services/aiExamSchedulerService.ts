/**
 * AI Smart Exam Scheduling Service
 * ──────────────────────────────────
 * Analyses all existing assessments for a term, detects scheduling
 * conflicts (same class double-booked, students over-assessed in one week,
 * etc.) and uses AI to suggest an optimised exam calendar.
 *
 * Key inputs  : termId, classIds (optional)
 * Key outputs : conflict report, optimised schedule suggestions
 */

import { prisma } from '../utils/prisma';
import aiService from './aiService';

export interface AssessmentConflict {
  type: 'DOUBLE_BOOKING' | 'OVERLOAD' | 'TOO_CLOSE' | 'TEACHER_CLASH';
  description: string;
  affectedClasses: string[];
  date: string;
  severity: 'low' | 'medium' | 'high';
}

export interface ScheduleSuggestion {
  assessmentId: string;
  assessmentTitle: string;
  currentDate: string;
  suggestedDate: string;
  reason: string;
  className: string;
  subjectName: string;
}

export interface ExamScheduleAnalysis {
  termId: string;
  termName: string;
  generatedAt: string;
  totalAssessments: number;
  conflictsFound: number;
  overloadedWeeks: string[];
  conflicts: AssessmentConflict[];
  suggestions: ScheduleSuggestion[];
  optimisedCalendar: Record<string, string[]>; // date → list of "Class: Subject" strings
  executiveSummary: string;
}

export async function analyseExamSchedule(
  termId: string,
  classIds?: string[],
): Promise<ExamScheduleAnalysis> {
  // ── 1. Load term ─────────────────────────────────────────────────────
  const term = await prisma.academicTerm.findUnique({ where: { id: termId } });
  if (!term) throw new Error('Term not found');

  // ── 2. Load all assessments for the term ─────────────────────────────
  const assessmentWhere: any = { termId };
  if (classIds?.length) assessmentWhere.classId = { in: classIds };

  const assessments = await (prisma.assessment as any).findMany({
    where: assessmentWhere,
    include: {
      class: { select: { id: true, name: true, gradeLevel: true } },
      subject: { select: { id: true, name: true } },
    },
    orderBy: { date: 'asc' },
  });

  if (assessments.length === 0) {
    return {
      termId,
      termName: term.name,
      generatedAt: new Date().toISOString(),
      totalAssessments: 0,
      conflictsFound: 0,
      overloadedWeeks: [],
      conflicts: [],
      suggestions: [],
      optimisedCalendar: {},
      executiveSummary: 'No assessments found for this term.',
    };
  }

  // ── 3. Build scheduling matrix ───────────────────────────────────────
  // date → classId → list of assessments that day
  const dateClassMap: Record<string, Record<string, any[]>> = {};
  // date → list of all assessments
  const dateMap: Record<string, any[]> = {};

  for (const a of assessments) {
    if (!a.date) continue;
    const dateStr = new Date(a.date).toISOString().split('T')[0];
    if (!dateMap[dateStr]) dateMap[dateStr] = [];
    dateMap[dateStr].push(a);

    if (!dateClassMap[dateStr]) dateClassMap[dateStr] = {};
    if (!dateClassMap[dateStr][a.classId]) dateClassMap[dateStr][a.classId] = [];
    dateClassMap[dateStr][a.classId].push(a);
  }

  // ── 4. Build AI prompt ───────────────────────────────────────────────
  const calendarLines: string[] = [];
  for (const [date, items] of Object.entries(dateMap).sort()) {
    const dayName = new Date(date + 'T12:00:00Z').toLocaleDateString('en-ZM', {
      weekday: 'long',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    const assessmentList = items.map(a =>
      `  • ${a.class?.name} — ${a.subject?.name} (${a.type}, ${a.totalMarks} marks)`,
    );
    calendarLines.push(`${dayName}:\n${assessmentList.join('\n')}`);
  }

  const termStart = term.startDate ? new Date(term.startDate).toISOString().split('T')[0] : 'N/A';
  const termEnd = term.endDate ? new Date(term.endDate).toISOString().split('T')[0] : 'N/A';

  const prompt = `You are an educational assessment scheduler for a Zambian school.
Analyse this term's assessment calendar and identify conflicts, overloads, and improvements.

TERM: ${term.name} (${termStart} to ${termEnd})
TOTAL ASSESSMENTS: ${assessments.length}

CURRENT ASSESSMENT CALENDAR:
${calendarLines.join('\n\n')}

Identify and report:
1. DOUBLE BOOKINGS: Same class has more than 1 assessment on the same day
2. OVERLOADED WEEKS: Any week with 4+ assessments across the school
3. TOO-CLOSE SPACING: Same class has assessments within 2 days of each other  
4. TEACHER CLASHES: If the same teacher is expected in multiple places at once

For each conflict, suggest a better date (must be within the term dates and on a weekday).
Also suggest which week of the term each assessment type (TEST, EXAM, HOMEWORK) should cluster.

Return JSON:
{
  "conflicts": [
    {
      "type": "DOUBLE_BOOKING",
      "description": "...",
      "affectedClasses": ["Form 2A"],
      "date": "2025-03-05",
      "severity": "high"
    }
  ],
  "suggestions": [
    {
      "assessmentId": "use title as identifier since no ID provided",
      "assessmentTitle": "Mathematics Mid-Term Test",
      "currentDate": "2025-03-05",
      "suggestedDate": "2025-03-07",
      "reason": "Moves it away from the double-booking",
      "className": "Form 2A",
      "subjectName": "Mathematics"
    }
  ],
  "overloadedWeeks": ["Week of March 3 – 7"],
  "executiveSummary": "3-sentence overview of the assessment schedule quality and main issues"
}`;

  let aiResult: any = { conflicts: [], suggestions: [], overloadedWeeks: [], executiveSummary: '' };
  try {
    aiResult = await aiService.generateJSON<any>(prompt, {
      systemPrompt: 'You are an educational scheduler. Respond with valid JSON only.',
      temperature: 0.3,
    });
  } catch (err) {
    console.error('[ExamScheduler] AI analysis failed:', err);
  }

  // ── 5. Build optimised calendar ──────────────────────────────────────
  const optimisedCalendar: Record<string, string[]> = {};
  for (const [date, items] of Object.entries(dateMap)) {
    optimisedCalendar[date] = items.map(a => `${a.class?.name}: ${a.subject?.name} (${a.type})`);
  }

  // Apply suggestions to the optimised calendar
  for (const sug of aiResult.suggestions || []) {
    if (!sug.currentDate || !sug.suggestedDate) continue;
    const label = `${sug.className}: ${sug.subjectName}`;
    // Remove from current date
    if (optimisedCalendar[sug.currentDate]) {
      optimisedCalendar[sug.currentDate] = optimisedCalendar[sug.currentDate].filter(
        l => !l.startsWith(sug.className),
      );
      if (optimisedCalendar[sug.currentDate].length === 0) {
        delete optimisedCalendar[sug.currentDate];
      }
    }
    // Add to suggested date
    if (!optimisedCalendar[sug.suggestedDate]) {
      optimisedCalendar[sug.suggestedDate] = [];
    }
    optimisedCalendar[sug.suggestedDate].push(`${label} [MOVED]`);
  }

  return {
    termId,
    termName: term.name,
    generatedAt: new Date().toISOString(),
    totalAssessments: assessments.length,
    conflictsFound: (aiResult.conflicts || []).length,
    overloadedWeeks: aiResult.overloadedWeeks || [],
    conflicts: aiResult.conflicts || [],
    suggestions: aiResult.suggestions || [],
    optimisedCalendar,
    executiveSummary: aiResult.executiveSummary || '',
  };
}
