/**
 * AI Intelligence Routes
 * ───────────────────────
 * Mounts all new AI-powered academic & financial intelligence endpoints.
 * Prefix: /api/v1/ai
 */

import { Router } from 'express';
import {
  getGradeForecast,
  getFeeDefaulterPrediction,
  generateAITimetable,
  saveAITimetable,
  getExamScheduleAnalysis,
  generateParentReportLetter,
} from '../controllers/aiIntelligenceController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateToken);

// ── Grade Forecasting ──────────────────────────────────────────────────
router.get(
  '/grade-forecast',
  authorizeRole(['SUPER_ADMIN', 'TEACHER', 'BRANCH_MANAGER']),
  aiLimiter,
  getGradeForecast,
);

// ── Fee Defaulter Prediction ───────────────────────────────────────────
router.get(
  '/fee-defaulters',
  authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']),
  aiLimiter,
  getFeeDefaulterPrediction,
);

// ── AI Timetable Generator ─────────────────────────────────────────────
router.post(
  '/timetable/generate',
  authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
  aiLimiter,
  generateAITimetable,
);

router.post(
  '/timetable/save',
  authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
  saveAITimetable,
);

// ── Smart Exam Scheduling ──────────────────────────────────────────────
router.get(
  '/exam-schedule',
  authorizeRole(['SUPER_ADMIN', 'TEACHER', 'BRANCH_MANAGER']),
  aiLimiter,
  getExamScheduleAnalysis,
);

// ── Parent Report Letter ───────────────────────────────────────────────
router.post(
  '/parent-letter',
  authorizeRole(['SUPER_ADMIN', 'TEACHER', 'BRANCH_MANAGER']),
  aiLimiter,
  generateParentReportLetter,
);

export default router;
