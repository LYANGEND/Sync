"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const intelligenceController_1 = require("../controllers/intelligenceController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// ==========================================
// Student Risk Engine
// ==========================================
router.get('/risk/class', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER', 'BRANCH_MANAGER']), intelligenceController_1.assessClassRisk);
router.get('/risk/student/:studentId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), intelligenceController_1.assessStudentRisk);
router.get('/risk/at-risk', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER', 'BRANCH_MANAGER']), intelligenceController_1.getAtRiskStudents);
router.get('/risk/student/:studentId/recommendations', rateLimiter_1.aiLimiter, (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), intelligenceController_1.getAIRecommendations);
// ==========================================
// Attendance Intelligence
// ==========================================
router.post('/attendance/analyze', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), intelligenceController_1.runAttendanceAnalysis);
router.get('/attendance/insights', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), intelligenceController_1.getAttendanceInsights);
router.get('/attendance/alerts', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER', 'SECRETARY']), intelligenceController_1.getAttendanceAlerts);
router.put('/attendance/alerts/:id/resolve', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), intelligenceController_1.resolveAttendanceAlert);
router.post('/attendance/alerts/:id/notify', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), intelligenceController_1.notifyParentAboutAttendance);
// ==========================================
// Smart Fee Collection
// ==========================================
router.get('/fees/analytics', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), intelligenceController_1.getFeeAnalytics);
router.get('/fees/predictions', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), intelligenceController_1.getPaymentPredictions);
router.post('/fees/payment-plan', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), intelligenceController_1.createPaymentPlan);
router.post('/fees/smart-reminders', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), intelligenceController_1.sendSmartFeeReminders);
router.get('/fees/financial-aid', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), intelligenceController_1.getFinancialAidCandidates);
// ==========================================
// Auto-Grading
// ==========================================
router.post('/grading/auto-grade/:submissionId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), intelligenceController_1.autoGradeSubmission);
router.get('/grading/item-analysis/:assessmentId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), intelligenceController_1.getItemAnalysis);
exports.default = router;
