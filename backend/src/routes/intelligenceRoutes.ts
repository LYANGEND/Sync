import { Router } from 'express';
import {
  assessClassRisk,
  assessStudentRisk,
  getAtRiskStudents,
  getAIRecommendations,
  runAttendanceAnalysis,
  getAttendanceInsights,
  getAttendanceAlerts,
  resolveAttendanceAlert,
  notifyParentAboutAttendance,
  getFeeAnalytics,
  getPaymentPredictions,
  createPaymentPlan,
  sendSmartFeeReminders,
  getFinancialAidCandidates,
  autoGradeSubmission,
  getItemAnalysis,
} from '../controllers/intelligenceController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateToken);

// ==========================================
// Student Risk Engine
// ==========================================
router.get('/risk/class', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'BRANCH_MANAGER']), assessClassRisk);
router.get('/risk/student/:studentId', authorizeRole(['SUPER_ADMIN', 'TEACHER']), assessStudentRisk);
router.get('/risk/at-risk', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'BRANCH_MANAGER']), getAtRiskStudents);
router.get('/risk/student/:studentId/recommendations', aiLimiter, authorizeRole(['SUPER_ADMIN', 'TEACHER']), getAIRecommendations);

// ==========================================
// Attendance Intelligence
// ==========================================
router.post('/attendance/analyze', authorizeRole(['SUPER_ADMIN', 'TEACHER']), runAttendanceAnalysis);
router.get('/attendance/insights', authorizeRole(['SUPER_ADMIN', 'TEACHER']), getAttendanceInsights);
router.get('/attendance/alerts', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SECRETARY']), getAttendanceAlerts);
router.put('/attendance/alerts/:id/resolve', authorizeRole(['SUPER_ADMIN', 'TEACHER']), resolveAttendanceAlert);
router.post('/attendance/alerts/:id/notify', authorizeRole(['SUPER_ADMIN', 'TEACHER']), notifyParentAboutAttendance);

// ==========================================
// Smart Fee Collection
// ==========================================
router.get('/fees/analytics', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getFeeAnalytics);
router.get('/fees/predictions', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPaymentPredictions);
router.post('/fees/payment-plan', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createPaymentPlan);
router.post('/fees/smart-reminders', authorizeRole(['SUPER_ADMIN', 'BURSAR']), sendSmartFeeReminders);
router.get('/fees/financial-aid', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getFinancialAidCandidates);

// ==========================================
// Auto-Grading
// ==========================================
router.post('/grading/auto-grade/:submissionId', authorizeRole(['SUPER_ADMIN', 'TEACHER']), autoGradeSubmission);
router.get('/grading/item-analysis/:assessmentId', authorizeRole(['SUPER_ADMIN', 'TEACHER']), getItemAnalysis);

export default router;
