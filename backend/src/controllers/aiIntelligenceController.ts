/**
 * AI Intelligence Controller
 * ───────────────────────────
 * Exposes the new AI-powered academic intelligence endpoints:
 *  - Grade Forecasting
 *  - Fee Defaulter Prediction
 *  - AI Timetable Generation
 *  - Smart Exam Scheduling
 *  - Parent Report Letter
 */

import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import aiUsageTracker from '../services/aiUsageTracker';
import { generateGradeForecast } from '../services/aiGradeForecastService';
import { predictFeeDefaulters } from '../services/aiDefaulterPredictionService';
import { generateTimetable, saveTimetablePeriods } from '../services/aiTimetableService';
import { analyseExamSchedule } from '../services/aiExamSchedulerService';
import { generateParentLetter } from '../services/aiParentReportService';

// ─────────────────────────────────────────
// Grade Forecasting
// ─────────────────────────────────────────

/**
 * GET /ai/grade-forecast?classId=...&subjectId=...
 * Returns predicted end-of-term scores for every student in a class.
 */
export const getGradeForecast = async (req: AuthRequest, res: Response) => {
  try {
    const { classId, subjectId } = req.query as Record<string, string>;
    if (!classId) return res.status(400).json({ error: 'classId is required' });

    const startTime = Date.now();
    const result = await generateGradeForecast(classId, subjectId || undefined);

    aiUsageTracker.track({
      userId: req.user?.userId || 'unknown',
      branchId: req.user?.branchId,
      feature: 'grade-forecast',
      action: 'generate',
      responseTimeMs: Date.now() - startTime,
      metadata: { classId, subjectId },
    });

    res.json(result);
  } catch (error: any) {
    console.error('[GradeForecast] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate grade forecast' });
  }
};

// ─────────────────────────────────────────
// Fee Defaulter Prediction
// ─────────────────────────────────────────

/**
 * GET /ai/fee-defaulters?termId=...
 * Returns AI-ranked list of students likely to default on fees this term.
 */
export const getFeeDefaulterPrediction = async (req: AuthRequest, res: Response) => {
  try {
    const { termId } = req.query as Record<string, string>;

    const startTime = Date.now();
    const result = await predictFeeDefaulters(termId || undefined);

    aiUsageTracker.track({
      userId: req.user?.userId || 'unknown',
      branchId: req.user?.branchId,
      feature: 'fee-defaulter',
      action: 'predict',
      responseTimeMs: Date.now() - startTime,
      metadata: { termId },
    });

    res.json(result);
  } catch (error: any) {
    console.error('[FeeDefaulter] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to predict fee defaulters' });
  }
};

// ─────────────────────────────────────────
// AI Timetable Generator
// ─────────────────────────────────────────

/**
 * POST /ai/timetable/generate
 * Body: { termId, classIds?: string[], saveToDb?: boolean, clearExisting?: boolean }
 * Generates and optionally saves a conflict-free timetable.
 */
export const generateAITimetable = async (req: AuthRequest, res: Response) => {
  try {
    const { termId, classIds, saveToDb = false, clearExisting = false } = req.body;
    if (!termId) return res.status(400).json({ error: 'termId is required' });

    const startTime = Date.now();
    const result = await generateTimetable(termId, classIds || undefined);

    let saveResult: { created: number; errors: string[] } | null = null;
    if (saveToDb) {
      saveResult = await saveTimetablePeriods(result, clearExisting);
    }

    aiUsageTracker.track({
      userId: req.user?.userId || 'unknown',
      branchId: req.user?.branchId,
      feature: 'timetable-generator',
      action: 'generate',
      responseTimeMs: Date.now() - startTime,
      metadata: { termId, classCount: result.classesScheduled, saved: saveToDb },
    });

    res.json({ ...result, saveResult });
  } catch (error: any) {
    console.error('[TimetableGenerator] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate timetable' });
  }
};

/**
 * POST /ai/timetable/save
 * Body: { periods: GeneratedPeriod[], termId, clearExisting?: boolean }
 * Saves a previously generated timetable to the database.
 */
export const saveAITimetable = async (req: AuthRequest, res: Response) => {
  try {
    const { periods, termId, termName, clearExisting = false } = req.body;
    if (!periods || !termId) return res.status(400).json({ error: 'periods and termId are required' });

    const result = await saveTimetablePeriods({ periods, termId, termName: termName || '', generatedAt: new Date().toISOString(), classesScheduled: 0, totalPeriods: periods.length, conflicts: [], notes: '' }, clearExisting);
    res.json(result);
  } catch (error: any) {
    console.error('[TimetableSave] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to save timetable' });
  }
};

// ─────────────────────────────────────────
// Smart Exam Scheduling
// ─────────────────────────────────────────

/**
 * GET /ai/exam-schedule?termId=...&classIds=...
 * Analyses and suggests optimisations for the exam calendar.
 */
export const getExamScheduleAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const { termId, classIds } = req.query as Record<string, string>;
    if (!termId) return res.status(400).json({ error: 'termId is required' });

    const classIdArray = classIds ? classIds.split(',').filter(Boolean) : undefined;

    const startTime = Date.now();
    const result = await analyseExamSchedule(termId, classIdArray);

    aiUsageTracker.track({
      userId: req.user?.userId || 'unknown',
      branchId: req.user?.branchId,
      feature: 'exam-scheduler',
      action: 'analyse',
      responseTimeMs: Date.now() - startTime,
      metadata: { termId },
    });

    res.json(result);
  } catch (error: any) {
    console.error('[ExamScheduler] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyse exam schedule' });
  }
};

// ─────────────────────────────────────────
// Parent Report Letter
// ─────────────────────────────────────────

/**
 * POST /ai/parent-letter
 * Body: { studentId, termId }
 * Generates a personalised parent/guardian letter.
 */
export const generateParentReportLetter = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId, termId } = req.body;
    if (!studentId || !termId) {
      return res.status(400).json({ error: 'studentId and termId are required' });
    }

    const startTime = Date.now();
    const result = await generateParentLetter(studentId, termId);

    aiUsageTracker.track({
      userId: req.user?.userId || 'unknown',
      branchId: req.user?.branchId,
      feature: 'parent-letter',
      action: 'generate',
      responseTimeMs: Date.now() - startTime,
      metadata: { studentId, termId },
    });

    res.json(result);
  } catch (error: any) {
    console.error('[ParentLetter] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate parent letter' });
  }
};
