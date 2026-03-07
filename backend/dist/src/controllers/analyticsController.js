"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.getSchoolHealthDashboard = exports.getAttendanceAnalyticsDashboard = exports.getRevenueAnalytics = exports.getAnalyticsDashboard = void 0;
const prisma_1 = require("../utils/prisma");
const metrics = __importStar(require("../services/metricsService"));
/**
 * Enhanced Analytics Controller
 * Provides trend analysis, AI insights, and school health metrics
 */
const getAnalyticsDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { period = '30' } = req.query; // days
        const days = parseInt(period) || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        // Parallel data fetching for performance
        const [enrollmentData, revenueData, attendanceData, academicData, riskData,] = yield Promise.all([
            getEnrollmentTrends(days),
            getRevenueTrends(startDate),
            getAttendanceTrends(startDate),
            getAcademicPerformance(),
            getRiskSummary(),
        ]);
        res.json({
            enrollment: enrollmentData,
            revenue: revenueData,
            attendance: attendanceData,
            academic: academicData,
            risk: riskData,
            generatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error('Analytics dashboard error:', error);
        res.status(500).json({ error: 'Failed to load analytics' });
    }
});
exports.getAnalyticsDashboard = getAnalyticsDashboard;
const getRevenueAnalytics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, groupBy = 'day' } = req.query;
        const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();
        const payments = yield prisma_1.prisma.payment.findMany({
            where: {
                paymentDate: { gte: start, lte: end },
                status: 'COMPLETED',
            },
            include: {
                student: { include: { class: true } },
            },
            orderBy: { paymentDate: 'asc' },
        });
        // Group by time period
        const grouped = new Map();
        payments.forEach(p => {
            let key;
            const date = p.paymentDate;
            if (groupBy === 'week') {
                const weekStart = new Date(date);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
                key = weekStart.toISOString().split('T')[0];
            }
            else if (groupBy === 'month') {
                key = date.toISOString().substring(0, 7);
            }
            else {
                key = date.toISOString().split('T')[0];
            }
            const current = grouped.get(key) || { amount: 0, count: 0 };
            current.amount += Number(p.amount);
            current.count++;
            grouped.set(key, current);
        });
        const chartData = Array.from(grouped.entries()).map(([date, data]) => ({
            date,
            amount: Math.round(data.amount * 100) / 100,
            count: data.count,
        }));
        // Payment method distribution
        const methodMap = new Map();
        payments.forEach(p => {
            methodMap.set(p.method, (methodMap.get(p.method) || 0) + Number(p.amount));
        });
        const methodDistribution = Array.from(methodMap.entries()).map(([method, amount]) => ({
            method,
            amount: Math.round(amount * 100) / 100,
            percentage: Math.round((amount / payments.reduce((s, p) => s + Number(p.amount), 0)) * 100),
        }));
        // Total summary
        const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);
        res.json({
            chartData,
            methodDistribution,
            summary: {
                totalCollected: Math.round(totalCollected * 100) / 100,
                totalTransactions: payments.length,
                averagePayment: payments.length > 0 ? Math.round((totalCollected / payments.length) * 100) / 100 : 0,
            },
        });
    }
    catch (error) {
        console.error('Revenue analytics error:', error);
        res.status(500).json({ error: 'Failed to load revenue analytics' });
    }
});
exports.getRevenueAnalytics = getRevenueAnalytics;
const getAttendanceAnalyticsDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const activeTerm = yield prisma_1.prisma.academicTerm.findFirst({ where: { isActive: true } });
        if (!activeTerm)
            return res.json({ message: 'No active term' });
        const records = yield prisma_1.prisma.attendance.findMany({
            where: {
                date: { gte: activeTerm.startDate, lte: new Date() },
            },
            include: {
                student: { include: { class: true } },
            },
        });
        // Overall attendance rate
        const totalRecords = records.length;
        const presentRecords = records.filter(r => r.status !== 'ABSENT').length;
        const overallRate = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0;
        // By class
        const classStats = new Map();
        records.forEach(r => {
            var _a, _b;
            const className = ((_b = (_a = r.student) === null || _a === void 0 ? void 0 : _a.class) === null || _b === void 0 ? void 0 : _b.name) || 'Unknown';
            const classId = r.classId;
            if (!classStats.has(classId))
                classStats.set(classId, { name: className, total: 0, present: 0 });
            const stats = classStats.get(classId);
            stats.total++;
            if (r.status !== 'ABSENT')
                stats.present++;
        });
        const byClass = Array.from(classStats.entries()).map(([id, stats]) => ({
            classId: id,
            className: stats.name,
            attendanceRate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
            totalRecords: stats.total,
        })).sort((a, b) => a.attendanceRate - b.attendanceRate);
        // Daily trend for last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentRecords = records.filter(r => r.date >= thirtyDaysAgo);
        const dailyMap = new Map();
        recentRecords.forEach(r => {
            const date = r.date.toISOString().split('T')[0];
            if (!dailyMap.has(date))
                dailyMap.set(date, { total: 0, present: 0 });
            const stats = dailyMap.get(date);
            stats.total++;
            if (r.status !== 'ABSENT')
                stats.present++;
        });
        const dailyTrend = Array.from(dailyMap.entries())
            .map(([date, stats]) => ({
            date,
            rate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
        }))
            .sort((a, b) => a.date.localeCompare(b.date));
        // Get alerts count
        let alertsCount = 0;
        try {
            alertsCount = yield prisma_1.prisma.attendanceAlert.count({
                where: { isResolved: false },
            });
        }
        catch ( /* table may not exist yet */_a) { /* table may not exist yet */ }
        res.json({
            overallRate,
            byClass,
            dailyTrend,
            alertsCount,
            totalStudentsTracked: new Set(records.map(r => r.studentId)).size,
        });
    }
    catch (error) {
        console.error('Attendance analytics error:', error);
        res.status(500).json({ error: 'Failed to load attendance analytics' });
    }
});
exports.getAttendanceAnalyticsDashboard = getAttendanceAnalyticsDashboard;
const getSchoolHealthDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const health = yield metrics.getSchoolHealthSnapshot();
        const activeTerm = yield prisma_1.prisma.academicTerm.findFirst({ where: { isActive: true } });
        // Generate text insights from canonical numbers
        const insights = generateHealthInsights({
            studentCount: health.enrollment.activeStudents,
            teacherCount: health.enrollment.activeTeachers,
            studentTeacherRatio: health.enrollment.studentTeacherRatio,
            collectionRate: health.fees.collectionRatePercent,
            weeklyAttendanceRate: health.attendance.ratePercent,
            atRiskCount: health.risk.critical + health.risk.high,
        });
        res.json({
            metrics: {
                activeStudents: health.enrollment.activeStudents,
                activeTeachers: health.enrollment.activeTeachers,
                totalClasses: health.enrollment.totalClasses,
                studentTeacherRatio: health.enrollment.studentTeacherRatio,
                feeCollectionRate: health.fees.collectionRatePercent,
                weeklyAttendanceRate: health.attendance.ratePercent,
                atRiskStudents: health.risk.critical + health.risk.high,
                currentTerm: (activeTerm === null || activeTerm === void 0 ? void 0 : activeTerm.name) || 'N/A',
            },
            insights,
        });
    }
    catch (error) {
        console.error('School health error:', error);
        res.status(500).json({ error: 'Failed to load school health' });
    }
});
exports.getSchoolHealthDashboard = getSchoolHealthDashboard;
// ==========================================
// Helper Functions
// ==========================================
function getEnrollmentTrends(days) {
    return __awaiter(this, void 0, void 0, function* () {
        const statusCounts = yield prisma_1.prisma.student.groupBy({
            by: ['status'],
            _count: true,
        });
        const byGrade = yield prisma_1.prisma.class.findMany({
            include: { _count: { select: { students: true } } },
            orderBy: { gradeLevel: 'asc' },
        });
        return {
            byStatus: statusCounts.map(s => ({ status: s.status, count: s._count })),
            byGrade: byGrade.map(c => ({
                className: c.name,
                gradeLevel: c.gradeLevel,
                students: c._count.students,
            })),
            total: statusCounts.reduce((sum, s) => sum + s._count, 0),
        };
    });
}
function getRevenueTrends(startDate) {
    return __awaiter(this, void 0, void 0, function* () {
        const payments = yield prisma_1.prisma.payment.findMany({
            where: {
                paymentDate: { gte: startDate },
                status: 'COMPLETED',
            },
            orderBy: { paymentDate: 'asc' },
        });
        const weeklyData = new Map();
        payments.forEach(p => {
            const weekStart = new Date(p.paymentDate);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
            const key = weekStart.toISOString().split('T')[0];
            weeklyData.set(key, (weeklyData.get(key) || 0) + Number(p.amount));
        });
        const total = payments.reduce((sum, p) => sum + Number(p.amount), 0);
        return {
            weeklyTrend: Array.from(weeklyData.entries()).map(([week, amount]) => ({
                week,
                amount: Math.round(amount * 100) / 100,
            })),
            totalRevenue: Math.round(total * 100) / 100,
            transactionCount: payments.length,
        };
    });
}
function getAttendanceTrends(startDate) {
    return __awaiter(this, void 0, void 0, function* () {
        const records = yield prisma_1.prisma.attendance.findMany({
            where: { date: { gte: startDate } },
        });
        const total = records.length;
        const present = records.filter(r => r.status === 'PRESENT').length;
        const late = records.filter(r => r.status === 'LATE').length;
        const absent = records.filter(r => r.status === 'ABSENT').length;
        return {
            rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
            present,
            late,
            absent,
            total,
        };
    });
}
function getAcademicPerformance() {
    return __awaiter(this, void 0, void 0, function* () {
        const activeTerm = yield prisma_1.prisma.academicTerm.findFirst({ where: { isActive: true } });
        if (!activeTerm)
            return { averageScore: 0, passRate: 0, subjectPerformance: [] };
        const results = yield prisma_1.prisma.termResult.findMany({
            where: { termId: activeTerm.id },
            include: { subject: true },
        });
        const allScores = results.map(r => Number(r.totalScore));
        const averageScore = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;
        const passRate = allScores.length > 0 ? (allScores.filter(s => s >= 50).length / allScores.length) * 100 : 0;
        // By subject
        const subjectMap = new Map();
        results.forEach(r => {
            if (!subjectMap.has(r.subjectId)) {
                subjectMap.set(r.subjectId, { name: r.subject.name, scores: [] });
            }
            subjectMap.get(r.subjectId).scores.push(Number(r.totalScore));
        });
        const subjectPerformance = Array.from(subjectMap.values()).map(({ name, scores }) => ({
            subject: name,
            average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
            passRate: Math.round((scores.filter(s => s >= 50).length / scores.length) * 100),
            totalStudents: scores.length,
        })).sort((a, b) => a.average - b.average); // Worst performing first
        return {
            averageScore: Math.round(averageScore * 10) / 10,
            passRate: Math.round(passRate),
            subjectPerformance,
        };
    });
}
function getRiskSummary() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const riskCounts = yield prisma_1.prisma.studentRiskAssessment.groupBy({
                by: ['riskLevel'],
                _count: true,
            });
            return {
                byLevel: riskCounts.map((r) => ({ level: r.riskLevel, count: r._count })),
                total: riskCounts.reduce((sum, r) => sum + r._count, 0),
            };
        }
        catch (_a) {
            return { byLevel: [], total: 0 };
        }
    });
}
function generateHealthInsights(data) {
    const insights = [];
    // Student-teacher ratio insight
    if (data.studentTeacherRatio > 40) {
        insights.push(`⚠️ Student-teacher ratio is ${data.studentTeacherRatio}:1, above the recommended 40:1. Consider hiring additional teachers.`);
    }
    else if (data.studentTeacherRatio > 0) {
        insights.push(`✅ Student-teacher ratio is ${data.studentTeacherRatio}:1, within acceptable range.`);
    }
    // Fee collection insight
    if (data.collectionRate < 50) {
        insights.push(`🔴 Fee collection rate is at ${data.collectionRate}%. Urgent action needed - consider sending bulk reminders.`);
    }
    else if (data.collectionRate < 75) {
        insights.push(`🟡 Fee collection rate is at ${data.collectionRate}%. Consider targeted reminders to overdue accounts.`);
    }
    else {
        insights.push(`✅ Fee collection rate is healthy at ${data.collectionRate}%.`);
    }
    // Attendance insight
    if (data.weeklyAttendanceRate < 80) {
        insights.push(`⚠️ Weekly attendance rate is ${data.weeklyAttendanceRate}%. Review attendance alerts for chronic absentees.`);
    }
    else if (data.weeklyAttendanceRate > 0) {
        insights.push(`✅ Weekly attendance rate is good at ${data.weeklyAttendanceRate}%.`);
    }
    // Risk students
    if (data.atRiskCount > 0) {
        insights.push(`🔔 ${data.atRiskCount} student(s) flagged as high-risk. Review risk assessments for intervention plans.`);
    }
    return insights;
}
