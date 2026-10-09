import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { studentRiskService } from '../services/studentRiskService';
import { attendanceIntelligenceService } from '../services/attendanceIntelligenceService';
import { smartFeeService } from '../services/smartFeeService';
import { autoGradingService } from '../services/autoGradingService';
import { AcademicScopeError, ensureAcademicClassAccess, ensureStudentRecordAccess } from '../utils/academicScope';
import { TermLifecycleError } from '../services/termLifecycleService';
import { sendTermLifecycleError } from '../utils/termLifecycleHttp';
import { StudentPlacementError } from '../services/studentPlacementService';

// ==========================================
// Student Risk Engine
// ==========================================

export const assessClassRisk = async (req: AuthRequest, res: Response) => {
  try {
    const { classId, termId } = req.query;

    if (!classId || !termId) {
      return res.status(400).json({ error: 'classId and termId are required' });
    }

    await ensureAcademicClassAccess(req, classId as string, { academicTermId: termId as string });

    const assessments = await studentRiskService.assessClass(
      classId as string,
      termId as string
    );

    res.json({
      total: assessments.length,
      atRisk: assessments.filter(a => a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL').length,
      assessments,
    });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    console.error('Assess class risk error:', error);
    res.status(500).json({ error: error.message || 'Failed to assess risk' });
  }
};

export const assessStudentRisk = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId } = req.params;
    const { termId } = req.query;

    if (!termId) return res.status(400).json({ error: 'termId is required' });

    await ensureStudentRecordAccess(req, studentId, { academicTermId: termId as string });

    const assessment = await studentRiskService.assessStudent(
      studentId,
      termId as string
    );

    res.json(assessment);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: error.message || 'Failed to assess student risk' });
  }
};

export const getAtRiskStudents = async (req: AuthRequest, res: Response) => {
  try {
    const { termId, minLevel = 'MEDIUM' } = req.query;
    if (!termId) return res.status(400).json({ error: 'termId is required' });

    const students = await studentRiskService.getAtRiskStudents(
      termId as string,
      minLevel as string
    );

    res.json(students);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get at-risk students' });
  }
};

export const getAIRecommendations = async (req: AuthRequest, res: Response) => {
  try {
    const { studentId } = req.params;
    const { termId } = req.query;
    if (!termId) return res.status(400).json({ error: 'termId is required' });

    await ensureStudentRecordAccess(req, studentId, { academicTermId: termId as string });

    const recommendations = await studentRiskService.getAIRecommendations(
      studentId,
      termId as string
    );

    res.json({ recommendations });
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to get recommendations' });
  }
};

// ==========================================
// Attendance Intelligence
// ==========================================

export const runAttendanceAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const { termId } = req.query;
    if (!termId || typeof termId !== 'string') {
      return res.status(400).json({ error: 'termId is required' });
    }
    const result = await attendanceIntelligenceService.runDailyAnalysis(termId);
    res.json(result);
  } catch (error: any) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: error.message || 'Failed to run analysis' });
  }
};

export const getAttendanceInsights = async (req: AuthRequest, res: Response) => {
  try {
    const { classId, termId, startDate, endDate } = req.query;

    if (!classId || !termId || !startDate || !endDate) {
      return res.status(400).json({ error: 'classId, termId, startDate, and endDate are required' });
    }

    await ensureAcademicClassAccess(req, classId as string, { academicTermId: termId as string });

    const insights = await attendanceIntelligenceService.getClassInsights(
      classId as string,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json(insights);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to get insights' });
  }
};

export const getAttendanceAlerts = async (req: AuthRequest, res: Response) => {
  try {
    const { classId, studentId, academicTermId, resolved } = req.query;
    if (!academicTermId || typeof academicTermId !== 'string') {
      return res.status(400).json({ error: 'academicTermId is required' });
    }
    if (classId && typeof classId === 'string') {
      await ensureAcademicClassAccess(req, classId, { academicTermId });
    }
    if (studentId && typeof studentId === 'string') {
      await ensureStudentRecordAccess(req, studentId, { academicTermId });
    }

    const alerts = await attendanceIntelligenceService.getAlerts({
      classId: classId as string | undefined,
      studentId: studentId as string | undefined,
      academicTermId,
      isResolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
    });

    res.json(alerts);
  } catch (error: any) {
    if (error instanceof AcademicScopeError) {
      return res.status(error.status).json({ error: error.message });
    }
    if (error instanceof StudentPlacementError) {
      return res.status(error.status).json({ code: error.code, error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to get alerts' });
  }
};

export const resolveAttendanceAlert = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;
    const { notes } = req.body;

    await attendanceIntelligenceService.resolveAlert(id, userId || '', notes);
    res.json({ message: 'Alert resolved' });
  } catch (error: any) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: error.message || 'Failed to resolve alert' });
  }
};

export const notifyParentAboutAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const result = await attendanceIntelligenceService.notifyParent(id);
    res.json(result);
  } catch (error: any) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: error.message || 'Failed to notify parent' });
  }
};

// ==========================================
// Smart Fee Collection
// ==========================================

export const getFeeAnalytics = async (req: AuthRequest, res: Response) => {
  try {
    const { termId } = req.query;
    if (!termId || typeof termId !== 'string') return res.status(400).json({ error: 'termId is required' });
    const analytics = await smartFeeService.getCollectionAnalytics(termId);
    res.json(analytics);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get fee analytics' });
  }
};

export const getPaymentPredictions = async (req: AuthRequest, res: Response) => {
  try {
    const { termId, classId } = req.query;
    if (!termId || typeof termId !== 'string') return res.status(400).json({ error: 'termId is required' });
    const predictions = await smartFeeService.predictPayments(termId, classId as string | undefined);
    res.json(predictions);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get predictions' });
  }
};

export const createPaymentPlan = async (req: AuthRequest, res: Response) => {
  try {
    const plan = await smartFeeService.createPaymentPlan(req.body);
    res.status(201).json(plan);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to create payment plan' });
  }
};

export const sendSmartFeeReminders = async (req: AuthRequest, res: Response) => {
  try {
    const { termId } = req.body;
    if (!termId || typeof termId !== 'string') return res.status(400).json({ error: 'termId is required' });
    const result = await smartFeeService.sendSmartReminders(termId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to send reminders' });
  }
};

export const getFinancialAidCandidates = async (req: AuthRequest, res: Response) => {
  try {
    const { termId } = req.query;
    if (!termId || typeof termId !== 'string') return res.status(400).json({ error: 'termId is required' });
    const candidates = await smartFeeService.identifyFinancialAidCandidates(termId);
    res.json(candidates);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to identify candidates' });
  }
};

// ==========================================
// Auto-Grading
// ==========================================

export const autoGradeSubmission = async (req: AuthRequest, res: Response) => {
  try {
    const { submissionId } = req.params;
    const result = await autoGradingService.gradeSubmission(submissionId);
    res.json(result);
  } catch (error: any) {
    if (error instanceof TermLifecycleError) return sendTermLifecycleError(res, error);
    res.status(500).json({ error: error.message || 'Failed to auto-grade' });
  }
};

export const getItemAnalysis = async (req: AuthRequest, res: Response) => {
  try {
    const { assessmentId } = req.params;
    const analysis = await autoGradingService.generateItemAnalysis(assessmentId);
    res.json(analysis);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate item analysis' });
  }
};
