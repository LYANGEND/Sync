"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getItemAnalysis = exports.autoGradeSubmission = exports.getFinancialAidCandidates = exports.sendSmartFeeReminders = exports.createPaymentPlan = exports.getPaymentPredictions = exports.getFeeAnalytics = exports.notifyParentAboutAttendance = exports.resolveAttendanceAlert = exports.getAttendanceAlerts = exports.getAttendanceInsights = exports.runAttendanceAnalysis = exports.getAIRecommendations = exports.getAtRiskStudents = exports.assessStudentRisk = exports.assessClassRisk = void 0;
const studentRiskService_1 = require("../services/studentRiskService");
const attendanceIntelligenceService_1 = require("../services/attendanceIntelligenceService");
const smartFeeService_1 = require("../services/smartFeeService");
const autoGradingService_1 = require("../services/autoGradingService");
// ==========================================
// Student Risk Engine
// ==========================================
const assessClassRisk = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, termId } = req.query;
        if (!classId || !termId) {
            return res.status(400).json({ error: 'classId and termId are required' });
        }
        const assessments = yield studentRiskService_1.studentRiskService.assessClass(classId, termId);
        res.json({
            total: assessments.length,
            atRisk: assessments.filter(a => a.riskLevel === 'HIGH' || a.riskLevel === 'CRITICAL').length,
            assessments,
        });
    }
    catch (error) {
        console.error('Assess class risk error:', error);
        res.status(500).json({ error: error.message || 'Failed to assess risk' });
    }
});
exports.assessClassRisk = assessClassRisk;
const assessStudentRisk = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        const { termId } = req.query;
        if (!termId)
            return res.status(400).json({ error: 'termId is required' });
        const assessment = yield studentRiskService_1.studentRiskService.assessStudent(studentId, termId);
        res.json(assessment);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to assess student risk' });
    }
});
exports.assessStudentRisk = assessStudentRisk;
const getAtRiskStudents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { termId, minLevel = 'MEDIUM' } = req.query;
        if (!termId)
            return res.status(400).json({ error: 'termId is required' });
        const students = yield studentRiskService_1.studentRiskService.getAtRiskStudents(termId, minLevel);
        res.json(students);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to get at-risk students' });
    }
});
exports.getAtRiskStudents = getAtRiskStudents;
const getAIRecommendations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        const { termId } = req.query;
        if (!termId)
            return res.status(400).json({ error: 'termId is required' });
        const recommendations = yield studentRiskService_1.studentRiskService.getAIRecommendations(studentId, termId);
        res.json({ recommendations });
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to get recommendations' });
    }
});
exports.getAIRecommendations = getAIRecommendations;
// ==========================================
// Attendance Intelligence
// ==========================================
const runAttendanceAnalysis = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { termId } = req.query;
        const result = yield attendanceIntelligenceService_1.attendanceIntelligenceService.runDailyAnalysis(termId);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to run analysis' });
    }
});
exports.runAttendanceAnalysis = runAttendanceAnalysis;
const getAttendanceInsights = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, startDate, endDate } = req.query;
        if (!classId || !startDate || !endDate) {
            return res.status(400).json({ error: 'classId, startDate, and endDate are required' });
        }
        const insights = yield attendanceIntelligenceService_1.attendanceIntelligenceService.getClassInsights(classId, new Date(startDate), new Date(endDate));
        res.json(insights);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to get insights' });
    }
});
exports.getAttendanceInsights = getAttendanceInsights;
const getAttendanceAlerts = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId, studentId, resolved } = req.query;
        const alerts = yield attendanceIntelligenceService_1.attendanceIntelligenceService.getAlerts({
            classId: classId,
            studentId: studentId,
            isResolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
        });
        res.json(alerts);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to get alerts' });
    }
});
exports.getAttendanceAlerts = getAttendanceAlerts;
const resolveAttendanceAlert = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { notes } = req.body;
        yield attendanceIntelligenceService_1.attendanceIntelligenceService.resolveAlert(id, userId || '', notes);
        res.json({ message: 'Alert resolved' });
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to resolve alert' });
    }
});
exports.resolveAttendanceAlert = resolveAttendanceAlert;
const notifyParentAboutAttendance = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield attendanceIntelligenceService_1.attendanceIntelligenceService.notifyParent(id);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to notify parent' });
    }
});
exports.notifyParentAboutAttendance = notifyParentAboutAttendance;
// ==========================================
// Smart Fee Collection
// ==========================================
const getFeeAnalytics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { termId } = req.query;
        const analytics = yield smartFeeService_1.smartFeeService.getCollectionAnalytics(termId);
        res.json(analytics);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to get fee analytics' });
    }
});
exports.getFeeAnalytics = getFeeAnalytics;
const getPaymentPredictions = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { classId } = req.query;
        const predictions = yield smartFeeService_1.smartFeeService.predictPayments(classId);
        res.json(predictions);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to get predictions' });
    }
});
exports.getPaymentPredictions = getPaymentPredictions;
const createPaymentPlan = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const plan = yield smartFeeService_1.smartFeeService.createPaymentPlan(req.body);
        res.status(201).json(plan);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to create payment plan' });
    }
});
exports.createPaymentPlan = createPaymentPlan;
const sendSmartFeeReminders = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield smartFeeService_1.smartFeeService.sendSmartReminders();
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to send reminders' });
    }
});
exports.sendSmartFeeReminders = sendSmartFeeReminders;
const getFinancialAidCandidates = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const candidates = yield smartFeeService_1.smartFeeService.identifyFinancialAidCandidates();
        res.json(candidates);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to identify candidates' });
    }
});
exports.getFinancialAidCandidates = getFinancialAidCandidates;
// ==========================================
// Auto-Grading
// ==========================================
const autoGradeSubmission = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { submissionId } = req.params;
        const result = yield autoGradingService_1.autoGradingService.gradeSubmission(submissionId);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to auto-grade' });
    }
});
exports.autoGradeSubmission = autoGradeSubmission;
const getItemAnalysis = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { assessmentId } = req.params;
        const analysis = yield autoGradingService_1.autoGradingService.generateItemAnalysis(assessmentId);
        res.json(analysis);
    }
    catch (error) {
        res.status(500).json({ error: error.message || 'Failed to generate item analysis' });
    }
});
exports.getItemAnalysis = getItemAnalysis;
