/**
 * AI Parent Engagement Service
 * ────────────────────────────────
 * Provides AI-powered parent communication and student monitoring:
 * - Weekly progress updates
 * - Early warning detection
 * - Intervention recommendations
 * 
 * Follows DRY principle by reusing aiService for all AI calls
 */

import { prisma } from '../utils/prisma';
import aiService from './aiService';

// ==========================================
// TYPES
// ==========================================

export interface WeeklyUpdateResponse {
  studentId: string;
  studentName: string;
  weekOf: string;
  message: string;
  metrics: {
    attendanceRate: number;
    recentGrades: Array<{
      subject: string;
      score: number;
      grade: string;
    }>;
    behaviorNotes?: string[];
  };
  highlights: string[];
  concerns: string[];
}

export interface EarlyWarning {
  type: 'attendance' | 'academic' | 'behavior' | 'fee';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  metric?: string;
  recommendation: string;
}

export interface Intervention {
  title: string;
  description: string;
  actionSteps: string[];
  expectedOutcome: string;
  timeframe: string;
  involvedParties: string[];
}

// ==========================================
// WEEKLY UPDATES
// ==========================================

/**
 * Generate a personalized weekly update for parents
 */
export async function generateWeeklyUpdate(
  studentId: string
): Promise<WeeklyUpdateResponse> {
  // 1. Get student with recent data
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: { select: { name: true, gradeLevel: true } },
      attendance: {
        where: { date: { gte: weekAgo } },
        select: { status: true, date: true },
      },
      grades: {
        where: { createdAt: { gte: weekAgo } },
        include: { subject: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!student) {
    throw new Error('Student not found');
  }

  // 2. Calculate metrics
  const attendanceRecords = student.attendance || [];
  const totalDays = attendanceRecords.length;
  const presentDays = attendanceRecords.filter(
    (a: any) => a.status === 'PRESENT' || a.status === 'LATE'
  ).length;
  const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 100;

  const recentGrades = (student.grades || []).map((g: any) => ({
    subject: g.subject.name,
    score: Number(g.score || 0),
    grade: g.grade || 'N/A',
  }));

  // 3. Generate AI summary
  const prompt = `Generate a warm, encouraging weekly update for a parent about their child's progress.

STUDENT: ${student.firstName} ${student.lastName}
CLASS: ${student.class?.name || 'Not assigned'}
WEEK OF: ${new Date().toLocaleDateString()}

ATTENDANCE THIS WEEK:
- Days present: ${presentDays} out of ${totalDays} (${attendanceRate}%)
${attendanceRecords.length > 0 ? `- Dates: ${attendanceRecords.map((a: any) => `${new Date(a.date).toLocaleDateString()}: ${a.status}`).join(', ')}` : ''}

RECENT GRADES:
${recentGrades.length > 0 ? recentGrades.map(g => `- ${g.subject}: ${g.score}% (${g.grade})`).join('\n') : '- No new grades this week'}

Write a 2-3 paragraph update that:
1. Opens with a warm greeting
2. Highlights positive achievements and strengths
3. Mentions attendance (if below 90%, suggest gentle improvement)
4. Notes any academic areas needing attention
5. Ends with encouragement and next steps

Tone: Warm, supportive, parent-friendly. Be specific with data but not robotic.
Length: 150-250 words.

Return JSON:
{
  "message": "The full update message",
  "highlights": ["Positive point 1", "Positive point 2"],
  "concerns": ["Concern 1 if any", "Concern 2 if any"]
}`;

  const result = await aiService.generateJSON<{
    message: string;
    highlights: string[];
    concerns: string[];
  }>(prompt, {
    systemPrompt: `You are a caring, experienced Zambian teacher writing to parents. 
Be specific, encouraging, and culturally sensitive. 
Use the student's actual data - don't make things up.`,
    temperature: 0.7,
  });

  return {
    studentId,
    studentName: `${student.firstName} ${student.lastName}`,
    weekOf: new Date().toISOString(),
    message: result.message,
    metrics: {
      attendanceRate,
      recentGrades,
    },
    highlights: result.highlights || [],
    concerns: result.concerns || [],
  };
}

// ==========================================
// EARLY WARNING DETECTION
// ==========================================

/**
 * Detect early warning signs for a student
 */
export async function detectEarlyWarnings(
  studentId: string
): Promise<EarlyWarning[]> {
  // 1. Get comprehensive student data
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: { select: { name: true } },
      attendance: {
        where: { date: { gte: oneMonthAgo } },
        select: { status: true, date: true },
      },
      grades: {
        where: { createdAt: { gte: oneMonthAgo } },
        include: { subject: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      invoices: {
        where: {
          status: { in: ['PENDING', 'OVERDUE'] },
        },
        select: {
          status: true,
          balanceDue: true,
          dueDate: true,
        },
      },
    },
  });

  if (!student) {
    throw new Error('Student not found');
  }

  const warnings: EarlyWarning[] = [];

  // 2. Check attendance
  const attendanceRecords = student.attendance || [];
  const totalDays = attendanceRecords.length;
  const presentDays = attendanceRecords.filter(
    (a: any) => a.status === 'PRESENT' || a.status === 'LATE'
  ).length;
  const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 100;

  if (attendanceRate < 80 && totalDays >= 5) {
    warnings.push({
      type: 'attendance',
      severity: attendanceRate < 60 ? 'high' : 'medium',
      title: 'Low Attendance Rate',
      description: `${student.firstName} has attended only ${presentDays} out of ${totalDays} days (${Math.round(attendanceRate)}%) in the past month.`,
      metric: `${Math.round(attendanceRate)}% attendance`,
      recommendation: 'Schedule a parent meeting to discuss attendance barriers and create an improvement plan.',
    });
  }

  // 3. Check academic performance
  const recentGrades = student.grades || [];
  if (recentGrades.length >= 3) {
    const avgScore = recentGrades.reduce((sum: number, g: any) => sum + Number(g.score || 0), 0) / recentGrades.length;
    const failingGrades = recentGrades.filter((g: any) => Number(g.score || 0) < 50);

    if (avgScore < 50) {
      warnings.push({
        type: 'academic',
        severity: 'high',
        title: 'Struggling Academically',
        description: `Average score of ${Math.round(avgScore)}% across recent assessments. Failing ${failingGrades.length} out of ${recentGrades.length} subjects.`,
        metric: `${Math.round(avgScore)}% average`,
        recommendation: 'Arrange tutoring support and meet with subject teachers to identify specific learning gaps.',
      });
    } else if (avgScore < 60) {
      warnings.push({
        type: 'academic',
        severity: 'medium',
        title: 'Below Average Performance',
        description: `Average score of ${Math.round(avgScore)}% indicates room for improvement.`,
        metric: `${Math.round(avgScore)}% average`,
        recommendation: 'Provide additional practice materials and consider peer study groups.',
      });
    }

    // Check for declining trend
    if (recentGrades.length >= 4) {
      const recent = recentGrades.slice(0, 2).reduce((sum: number, g: any) => sum + Number(g.score || 0), 0) / 2;
      const older = recentGrades.slice(2, 4).reduce((sum: number, g: any) => sum + Number(g.score || 0), 0) / 2;
      
      if (recent < older - 10) {
        warnings.push({
          type: 'academic',
          severity: 'medium',
          title: 'Declining Performance',
          description: `Recent scores (${Math.round(recent)}%) are significantly lower than previous scores (${Math.round(older)}%).`,
          metric: `${Math.round(older - recent)}% drop`,
          recommendation: 'Investigate potential causes (health, home situation, learning difficulties) and provide targeted support.',
        });
      }
    }
  }

  // 4. Check fee status
  const overdueInvoices = (student.invoices || []).filter((inv: any) => inv.status === 'OVERDUE');
  if (overdueInvoices.length > 0) {
    const totalOverdue = overdueInvoices.reduce((sum: number, inv: any) => sum + Number(inv.balanceDue || 0), 0);
    
    warnings.push({
      type: 'fee',
      severity: totalOverdue > 1000 ? 'high' : 'medium',
      title: 'Outstanding Fees',
      description: `${overdueInvoices.length} overdue invoice(s) totaling K${totalOverdue.toFixed(2)}.`,
      metric: `K${totalOverdue.toFixed(2)} overdue`,
      recommendation: 'Contact parent to discuss payment plan options and available financial assistance.',
    });
  }

  return warnings;
}

// ==========================================
// INTERVENTION RECOMMENDATIONS
// ==========================================

/**
 * Suggest interventions for a student based on their challenges
 */
export async function suggestInterventions(
  studentId: string,
  issueType?: 'attendance' | 'academic' | 'behavior' | 'general'
): Promise<Intervention[]> {
  // 1. Get student data and warnings
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: { select: { name: true, gradeLevel: true } },
    },
  });

  if (!student) {
    throw new Error('Student not found');
  }

  const warnings = await detectEarlyWarnings(studentId);

  // 2. Filter warnings by issue type if specified
  const relevantWarnings = issueType
    ? warnings.filter(w => w.type === issueType)
    : warnings;

  if (relevantWarnings.length === 0) {
    return [{
      title: 'Preventive Support',
      description: 'Student is performing well. Continue monitoring and providing encouragement.',
      actionSteps: [
        'Maintain regular communication with parents',
        'Celebrate achievements publicly',
        'Provide enrichment opportunities',
      ],
      expectedOutcome: 'Sustained positive performance',
      timeframe: 'Ongoing',
      involvedParties: ['Teacher', 'Parent'],
    }];
  }

  // 3. Generate AI-powered intervention recommendations
  const prompt = `Suggest practical, culturally-appropriate interventions for a Zambian student facing challenges.

STUDENT: ${student.firstName} ${student.lastName}
CLASS: ${student.class?.name || 'Not assigned'} (Grade ${student.class?.gradeLevel || 'Unknown'})

IDENTIFIED CHALLENGES:
${relevantWarnings.map(w => `- ${w.title} (${w.severity} severity): ${w.description}`).join('\n')}

For each challenge, suggest 1-2 practical interventions that:
1. Are culturally appropriate for Zambian schools
2. Involve parents, teachers, and school leadership as needed
3. Have clear, actionable steps
4. Include realistic timeframes
5. Consider resource constraints

Return JSON array:
[
  {
    "title": "Intervention name",
    "description": "Brief description of the intervention",
    "actionSteps": ["Step 1", "Step 2", "Step 3"],
    "expectedOutcome": "What success looks like",
    "timeframe": "How long to implement (e.g., '2 weeks', '1 month')",
    "involvedParties": ["Teacher", "Parent", "Counselor", etc.]
  }
]`;

  const result = await aiService.generateJSON<Intervention[]>(
    prompt,
    {
      systemPrompt: `You are an experienced Zambian school counselor and education specialist.
Suggest practical, evidence-based interventions that work in resource-constrained settings.
Be culturally sensitive and realistic about what schools and families can implement.`,
      temperature: 0.6,
    }
  );

  return result;
}
