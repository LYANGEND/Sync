/**
 * AI Timetable Generator Service
 * ────────────────────────────────
 * Uses AI to generate a conflict-free weekly timetable for a class or the
 * entire school, respecting teacher availability, subject hour requirements,
 * and school-day constraints.
 *
 * Key inputs  : termId, classIds (or all classes), periodsPerDay, school days
 * Key outputs : array of TimetablePeriod-compatible records ready to save
 */

import { prisma } from '../utils/prisma';
import aiService from './aiService';

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY';

export interface GeneratedPeriod {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;   // "HH:MM"
  endTime: string;     // "HH:MM"
  periodNumber: number;
}

export interface TimetableGenerationResult {
  termId: string;
  termName: string;
  generatedAt: string;
  classesScheduled: number;
  totalPeriods: number;
  conflicts: string[];
  periods: GeneratedPeriod[];
  notes: string;
}

const SCHOOL_DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

/** Standard Zambian secondary-school period times (40-min periods) */
const DEFAULT_PERIOD_TIMES = [
  { period: 1, start: '07:30', end: '08:10' },
  { period: 2, start: '08:10', end: '08:50' },
  { period: 3, start: '08:50', end: '09:30' },
  { period: 4, start: '09:30', end: '10:10' },
  // Break 10:10–10:30
  { period: 5, start: '10:30', end: '11:10' },
  { period: 6, start: '11:10', end: '11:50' },
  { period: 7, start: '11:50', end: '12:30' },
  // Lunch 12:30–13:30
  { period: 8, start: '13:30', end: '14:10' },
  { period: 9, start: '14:10', end: '14:50' },
];

export async function generateTimetable(
  termId: string,
  classIds?: string[],
): Promise<TimetableGenerationResult> {
  // ── 1. Load term ─────────────────────────────────────────────────────
  const term = await prisma.academicTerm.findUnique({ where: { id: termId } });
  if (!term) throw new Error('Academic term not found');

  // ── 2. Load classes ──────────────────────────────────────────────────
  const classWhere: any = classIds?.length ? { id: { in: classIds } } : {};
  const classes = await prisma.class.findMany({
    where: classWhere,
    include: {
      subjects: { select: { id: true, name: true, code: true } },
      _count: { select: { students: true } },
    },
    orderBy: [{ gradeLevel: 'asc' }, { name: 'asc' }],
    take: 20, // Limit to 20 classes per generation to keep prompt manageable
  });

  if (classes.length === 0) throw new Error('No classes found');

  // ── 3. Load teacher assignments (TeacherSubject) ─────────────────────
  const teacherSubjects = await prisma.teacherSubject.findMany({
    where: { classId: { in: classes.map((c: any) => c.id) } },
    include: {
      teacher: { select: { id: true, fullName: true } },
      subject: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
    },
  });

  // Build lookup: classId → subject → teacherId
  const assignmentMap: Record<string, Record<string, { teacherId: string; teacherName: string }>> = {};
  for (const ts of teacherSubjects as any[]) {
    if (!assignmentMap[ts.classId]) assignmentMap[ts.classId] = {};
    assignmentMap[ts.classId][ts.subjectId] = {
      teacherId: ts.teacher.id,
      teacherName: ts.teacher.fullName,
    };
  }

  // ── 4. Build timetable constraints summary for AI ────────────────────
  const classSummaries = classes.map((c: any) => {
    const assignments = Object.entries(assignmentMap[c.id] || {});
    const subjectList = c.subjects.map((s: any) => {
      const teacherAssignment = assignmentMap[c.id]?.[s.id];
      return `${s.name}${teacherAssignment ? ` (Teacher: ${teacherAssignment.teacherName})` : ' (no teacher assigned)'}`;
    });
    return `CLASS: ${c.name} (Grade ${c.gradeLevel}, ${c._count.students} students)\n  Subjects: ${subjectList.join(', ')}`;
  });

  // Build all unique teacher names
  const allTeachers = new Set<string>();
  for (const ts of teacherSubjects as any[]) {
    allTeachers.add(ts.teacher.fullName);
  }

  // ── 5. Build AI prompt ───────────────────────────────────────────────
  const periodsPerDay = DEFAULT_PERIOD_TIMES.length;
  const totalSlotsPerClass = periodsPerDay * SCHOOL_DAYS.length;

  const prompt = `You are a school timetable expert for a Zambian school. 
Generate a conflict-free weekly timetable for the following classes.

TERM: ${term.name}
SCHOOL DAYS: Monday to Friday
PERIODS PER DAY: ${periodsPerDay} (periods 1–${periodsPerDay})

PERIOD TIMES:
${DEFAULT_PERIOD_TIMES.map(p => `Period ${p.period}: ${p.start}–${p.end}`).join('\n')}

CLASSES AND TEACHER ASSIGNMENTS:
${classSummaries.join('\n\n')}

CONSTRAINTS:
1. Each teacher can only teach ONE class at any given time slot (no double-booking)
2. Each subject should appear 4–6 times per week per class (spread evenly)
3. Core subjects (Maths, English, Science) should appear in morning slots (periods 1–4)
4. No teacher should teach more than 3 consecutive periods without a break
5. Each class needs a full week schedule (${totalSlotsPerClass} slots filled)

Generate a timetable as JSON:
{
  "periods": [
    {
      "className": "Form 1A",
      "subjectName": "Mathematics",
      "teacherName": "Mr. Banda",
      "dayOfWeek": "MONDAY",
      "periodNumber": 1
    }
  ],
  "conflicts": ["Any conflicts detected or teacher shortages noted"],
  "notes": "Any observations about the generated timetable"
}

Generate complete, realistic timetables for ALL ${classes.length} classes. Include every class, every day, every period.`;

  let aiResult: any = { periods: [], conflicts: [], notes: '' };
  try {
    aiResult = await aiService.generateJSON<any>(prompt, {
      systemPrompt: 'You are a school timetable scheduler. Generate valid JSON timetables.',
      temperature: 0.4,
    });
  } catch (err) {
    console.error('[TimetableGenerator] AI generation failed:', err);
    throw new Error('AI timetable generation failed: ' + (err as Error).message);
  }

  // ── 6. Map AI output to full GeneratedPeriod records ─────────────────
  // Build reverse lookups
  const classNameToId: Record<string, string> = {};
  const subjectNameToId: Record<string, { subjectId: string; classId: string }[]> = {};
  const teacherNameToId: Record<string, string> = {};

  for (const c of classes as any[]) {
    classNameToId[c.name] = c.id;
    for (const s of c.subjects) {
      if (!subjectNameToId[s.name]) subjectNameToId[s.name] = [];
      subjectNameToId[s.name].push({ subjectId: s.id, classId: c.id });
    }
  }
  for (const ts of teacherSubjects as any[]) {
    teacherNameToId[ts.teacher.fullName] = ts.teacher.id;
  }

  const periods: GeneratedPeriod[] = [];
  const seen = new Set<string>(); // Dedup: class+day+period

  for (const p of aiResult.periods || []) {
    const classId = classNameToId[p.className];
    if (!classId) continue;

    // Resolve subjectId from name+classId
    const subjectMatches = subjectNameToId[p.subjectName] || [];
    const subjectMatch = subjectMatches.find(m => m.classId === classId) || subjectMatches[0];
    if (!subjectMatch) continue;

    const teacherId = teacherNameToId[p.teacherName];
    if (!teacherId) continue;

    const periodTimes = DEFAULT_PERIOD_TIMES.find(pt => pt.period === p.periodNumber);
    if (!periodTimes) continue;

    const slotKey = `${classId}-${p.dayOfWeek}-${p.periodNumber}`;
    if (seen.has(slotKey)) continue;
    seen.add(slotKey);

    periods.push({
      classId,
      className: p.className,
      subjectId: subjectMatch.subjectId,
      subjectName: p.subjectName,
      teacherId,
      teacherName: p.teacherName,
      dayOfWeek: p.dayOfWeek as DayOfWeek,
      startTime: periodTimes.start,
      endTime: periodTimes.end,
      periodNumber: p.periodNumber,
    });
  }

  return {
    termId,
    termName: term.name,
    generatedAt: new Date().toISOString(),
    classesScheduled: classes.length,
    totalPeriods: periods.length,
    conflicts: aiResult.conflicts || [],
    periods,
    notes: aiResult.notes || '',
  };
}

/**
 * Save generated timetable periods to the database.
 * Optionally clears existing periods for the given classes first.
 */
export async function saveTimetablePeriods(
  result: TimetableGenerationResult,
  clearExisting = false,
): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  if (clearExisting) {
    const classIds = [...new Set(result.periods.map(p => p.classId))];
    await (prisma.timetablePeriodClass as any).deleteMany({
      where: { class: { id: { in: classIds } } },
    });
    // Then delete orphan periods
    await (prisma.timetablePeriod as any).deleteMany({
      where: { academicTermId: result.termId },
    });
  }

  for (const p of result.periods) {
    try {
      const period = await (prisma.timetablePeriod as any).create({
        data: {
          subjectId: p.subjectId,
          teacherId: p.teacherId,
          dayOfWeek: p.dayOfWeek,
          startTime: p.startTime,
          endTime: p.endTime,
          academicTermId: result.termId,
        },
      });

      await (prisma.timetablePeriodClass as any).create({
        data: {
          timetablePeriodId: period.id,
          classId: p.classId,
        },
      });

      created++;
    } catch (err) {
      errors.push(`${p.className} ${p.dayOfWeek} P${p.periodNumber}: ${(err as Error).message}`);
    }
  }

  return { created, errors };
}
