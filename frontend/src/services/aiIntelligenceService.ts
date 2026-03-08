/**
 * AI Intelligence Service
 * ────────────────────────
 * Frontend API client for all new AI-powered intelligence endpoints.
 */

import api from '../utils/api';

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

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

export interface StudentDefaultRisk {
  studentId: string;
  studentName: string;
  className: string;
  totalFees: number;
  totalPaid: number;
  outstanding: number;
  paymentCompletionRate: number;
  daysOverdue: number;
  priorTermDefaulted: boolean;
  riskScore: number;
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

export interface GeneratedPeriod {
  classId: string;
  className: string;
  subjectId: string;
  subjectName: string;
  teacherId: string;
  teacherName: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
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
  saveResult?: { created: number; errors: string[] } | null;
}

export interface AssessmentConflict {
  type: string;
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
  optimisedCalendar: Record<string, string[]>;
  executiveSummary: string;
}

export interface ParentLetterResponse {
  studentId: string;
  studentName: string;
  guardianName: string | null;
  termName: string;
  letterHtml: string;
  letterPlainText: string;
  generatedAt: string;
}

// ─────────────────────────────────────────
// API Calls
// ─────────────────────────────────────────

export const aiIntelligenceService = {
  /**
   * Get AI-powered grade forecast for a class (and optional subject).
   */
  async getGradeForecast(classId: string, subjectId?: string): Promise<GradeForecastResponse> {
    const params = new URLSearchParams({ classId });
    if (subjectId) params.set('subjectId', subjectId);
    const { data } = await api.get(`/ai/grade-forecast?${params.toString()}`);
    return data;
  },

  /**
   * Get AI-predicted fee defaulter risk list for the current (or given) term.
   */
  async getFeeDefaulters(termId?: string): Promise<DefaulterPredictionResponse> {
    const params = termId ? `?termId=${termId}` : '';
    const { data } = await api.get(`/ai/fee-defaulters${params}`);
    return data;
  },

  /**
   * Generate an AI timetable. If saveToDb=true the periods are persisted immediately.
   */
  async generateTimetable(
    termId: string,
    classIds?: string[],
    saveToDb = false,
    clearExisting = false,
  ): Promise<TimetableGenerationResult> {
    const { data } = await api.post('/ai/timetable/generate', {
      termId,
      classIds,
      saveToDb,
      clearExisting,
    });
    return data;
  },

  /**
   * Save a previously generated timetable to the database.
   */
  async saveTimetable(
    periods: GeneratedPeriod[],
    termId: string,
    termName: string,
    clearExisting = false,
  ): Promise<{ created: number; errors: string[] }> {
    const { data } = await api.post('/ai/timetable/save', {
      periods,
      termId,
      termName,
      clearExisting,
    });
    return data;
  },

  /**
   * Analyse the exam schedule for conflicts and get AI suggestions.
   */
  async analyseExamSchedule(termId: string, classIds?: string[]): Promise<ExamScheduleAnalysis> {
    const params = new URLSearchParams({ termId });
    if (classIds?.length) params.set('classIds', classIds.join(','));
    const { data } = await api.get(`/ai/exam-schedule?${params.toString()}`);
    return data;
  },

  /**
   * Generate a personalised parent/guardian letter for a student's term report.
   */
  async generateParentLetter(studentId: string, termId: string): Promise<ParentLetterResponse> {
    const { data } = await api.post('/ai/parent-letter', { studentId, termId });
    return data;
  },
};

export default aiIntelligenceService;
