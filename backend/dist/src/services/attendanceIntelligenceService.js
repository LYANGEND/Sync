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
exports.attendanceIntelligenceService = void 0;
const prisma_1 = require("../utils/prisma");
const smsService_1 = require("./smsService");
const whatsappService_1 = require("./whatsappService");
const notificationService_1 = require("./notificationService");
/**
 * Attendance Intelligence Service
 * Detects patterns, triggers alerts, and provides insights
 */
class AttendanceIntelligenceService {
    /**
     * Run daily attendance analysis - call this via a cron job or manual trigger
     */
    runDailyAnalysis(termId) {
        return __awaiter(this, void 0, void 0, function* () {
            let term;
            if (termId) {
                term = yield prisma_1.prisma.academicTerm.findUnique({ where: { id: termId } });
            }
            else {
                term = yield prisma_1.prisma.academicTerm.findFirst({ where: { isActive: true } });
            }
            if (!term)
                return { alertsGenerated: 0, patternsDetected: 0, studentsAnalyzed: 0 };
            const students = yield prisma_1.prisma.student.findMany({
                where: { status: 'ACTIVE' },
                include: {
                    class: true,
                    parent: { select: { fullName: true, email: true } },
                    attendance: {
                        where: { date: { gte: term.startDate, lte: new Date() } },
                        orderBy: { date: 'desc' },
                    },
                },
            });
            let alertsGenerated = 0;
            let patternsDetected = 0;
            for (const student of students) {
                const analysis = this.analyzeStudentAttendance(student);
                // Generate alerts for concerning patterns
                for (const pattern of analysis.patterns) {
                    if (pattern.severity === 'HIGH' || pattern.severity === 'MEDIUM') {
                        yield this.createAlert(student.id, pattern);
                        alertsGenerated++;
                        patternsDetected++;
                    }
                }
                // Check for consecutive absences (3+ days)
                if (analysis.consecutiveAbsences >= 3) {
                    yield this.createConsecutiveAbsenceAlert(student, analysis.consecutiveAbsences);
                    alertsGenerated++;
                }
                // Check for chronic absenteeism (attendance rate < 80%)
                if (analysis.attendanceRate < 80 && student.attendance.length >= 10) {
                    yield this.createChronicAbsenteeismAlert(student, analysis.attendanceRate);
                    alertsGenerated++;
                }
            }
            return {
                alertsGenerated,
                patternsDetected,
                studentsAnalyzed: students.length,
            };
        });
    }
    /**
     * Get attendance insights for a class
     */
    getClassInsights(classId, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            const students = yield prisma_1.prisma.student.findMany({
                where: { classId, status: 'ACTIVE' },
            });
            const studentIds = students.map(s => s.id);
            const records = yield prisma_1.prisma.attendance.findMany({
                where: {
                    classId,
                    date: { gte: startDate, lte: endDate },
                },
                orderBy: { date: 'asc' },
            });
            // Day of week analysis
            const dayStats = {};
            const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
            records.forEach(r => {
                const day = DAYS[r.date.getDay()];
                if (!dayStats[day])
                    dayStats[day] = { total: 0, present: 0 };
                dayStats[day].total++;
                if (r.status !== 'ABSENT')
                    dayStats[day].present++;
            });
            const dayOfWeekAnalysis = Object.entries(dayStats).map(([day, stats]) => ({
                day,
                avgAttendance: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
            }));
            // Weekly trends
            const weeklyStats = new Map();
            records.forEach(r => {
                const weekStart = this.getWeekStart(r.date);
                const key = weekStart.toISOString().split('T')[0];
                if (!weeklyStats.has(key))
                    weeklyStats.set(key, { total: 0, present: 0 });
                const stats = weeklyStats.get(key);
                stats.total++;
                if (r.status !== 'ABSENT')
                    stats.present++;
            });
            const trends = Array.from(weeklyStats.entries()).map(([week, stats]) => ({
                week,
                attendanceRate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
            }));
            // Per-student summary for chronic absentees
            const studentAbsences = new Map();
            const studentRecordCount = new Map();
            records.forEach(r => {
                studentRecordCount.set(r.studentId, (studentRecordCount.get(r.studentId) || 0) + 1);
                if (r.status === 'ABSENT') {
                    studentAbsences.set(r.studentId, (studentAbsences.get(r.studentId) || 0) + 1);
                }
            });
            let chronicAbsentees = 0;
            let perfectAttendance = 0;
            let totalAttendanceRate = 0;
            studentIds.forEach(id => {
                const total = studentRecordCount.get(id) || 0;
                const absent = studentAbsences.get(id) || 0;
                const rate = total > 0 ? ((total - absent) / total) * 100 : 100;
                totalAttendanceRate += rate;
                if (rate < 80 && total >= 5)
                    chronicAbsentees++;
                if (absent === 0 && total > 0)
                    perfectAttendance++;
            });
            // Get active alerts
            const alerts = yield prisma_1.prisma.attendanceAlert.findMany({
                where: {
                    studentId: { in: studentIds },
                    isResolved: false,
                },
                orderBy: { createdAt: 'desc' },
                take: 20,
            });
            return {
                summary: {
                    averageAttendance: studentIds.length > 0 ? Math.round(totalAttendanceRate / studentIds.length) : 0,
                    chronicAbsentees,
                    perfectAttendance,
                    totalStudents: studentIds.length,
                },
                dayOfWeekAnalysis,
                trends,
                alerts,
            };
        });
    }
    /**
     * Get unresolved alerts
     */
    getAlerts(filters) {
        return __awaiter(this, void 0, void 0, function* () {
            const where = {};
            if ((filters === null || filters === void 0 ? void 0 : filters.isResolved) !== undefined)
                where.isResolved = filters.isResolved;
            if (filters === null || filters === void 0 ? void 0 : filters.studentId)
                where.studentId = filters.studentId;
            if (filters === null || filters === void 0 ? void 0 : filters.classId) {
                const students = yield prisma_1.prisma.student.findMany({
                    where: { classId: filters.classId, status: 'ACTIVE' },
                    select: { id: true },
                });
                where.studentId = { in: students.map(s => s.id) };
            }
            const alerts = yield prisma_1.prisma.attendanceAlert.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: 100,
            });
            // Enrich with student data
            const studentIds = alerts.map((a) => a.studentId).filter((v, i, arr) => arr.indexOf(v) === i);
            const students = yield prisma_1.prisma.student.findMany({
                where: { id: { in: studentIds } },
                include: { class: true, parent: { select: { fullName: true } } },
            });
            const studentMap = new Map(students.map(s => [s.id, s]));
            return alerts.map((a) => (Object.assign(Object.assign({}, a), { student: studentMap.get(a.studentId) })));
        });
    }
    /**
     * Resolve an alert
     */
    resolveAlert(alertId, userId, notes) {
        return __awaiter(this, void 0, void 0, function* () {
            yield prisma_1.prisma.attendanceAlert.update({
                where: { id: alertId },
                data: {
                    isResolved: true,
                    resolvedBy: userId,
                    resolvedAt: new Date(),
                    resolvedNotes: notes || null,
                },
            });
        });
    }
    /**
     * Send parent notification for attendance alert
     */
    notifyParent(alertId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const alert = yield prisma_1.prisma.attendanceAlert.findUnique({ where: { id: alertId } });
            if (!alert)
                throw new Error('Alert not found');
            const student = yield prisma_1.prisma.student.findUnique({
                where: { id: alert.studentId },
                include: { parent: true },
            });
            if (!student)
                throw new Error('Student not found');
            const settings = yield prisma_1.prisma.schoolSettings.findFirst();
            const schoolName = (settings === null || settings === void 0 ? void 0 : settings.schoolName) || 'School';
            const studentName = `${student.firstName} ${student.lastName}`;
            let emailSent = false;
            let smsSent = false;
            let whatsappSent = false;
            // Email
            const parentEmail = ((_a = student.parent) === null || _a === void 0 ? void 0 : _a.email) || student.guardianEmail;
            if (parentEmail) {
                emailSent = yield (0, notificationService_1.sendEmail)({
                    to: parentEmail,
                    subject: `Attendance Alert - ${studentName} - ${schoolName}`,
                    text: alert.message,
                    html: `<h2>Attendance Alert</h2><p>${alert.message}</p><p>Please contact the school for more information.</p>`,
                });
            }
            // SMS
            const parentPhone = student.guardianPhone;
            if (parentPhone) {
                const smsResult = yield smsService_1.smsService.sendAttendanceAlert(parentPhone, studentName, 3, schoolName);
                smsSent = smsResult.success;
            }
            // WhatsApp
            if (parentPhone) {
                const waResult = yield whatsappService_1.whatsappService.sendAttendanceAlert(parentPhone, studentName, 3, schoolName);
                whatsappSent = waResult.success;
            }
            // Update alert
            yield prisma_1.prisma.attendanceAlert.update({
                where: { id: alertId },
                data: { parentNotified: true, notifiedAt: new Date() },
            });
            return { emailSent, smsSent, whatsappSent };
        });
    }
    // ==========================================
    // Private analysis methods
    // ==========================================
    analyzeStudentAttendance(student) {
        const records = student.attendance || [];
        if (records.length === 0) {
            return { attendanceRate: 100, consecutiveAbsences: 0, patterns: [] };
        }
        const totalRecords = records.length;
        const absentRecords = records.filter((r) => r.status === 'ABSENT');
        const attendanceRate = ((totalRecords - absentRecords.length) / totalRecords) * 100;
        // Find consecutive absences
        let maxConsecutive = 0;
        let currentConsecutive = 0;
        const sortedRecords = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        for (const record of sortedRecords) {
            if (record.status === 'ABSENT') {
                currentConsecutive++;
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
            }
            else {
                currentConsecutive = 0;
            }
        }
        // Detect patterns
        const patterns = [];
        // Day-of-week pattern
        const dayAbsences = {};
        const dayTotals = {};
        records.forEach((r) => {
            const day = new Date(r.date).getDay();
            dayTotals[day] = (dayTotals[day] || 0) + 1;
            if (r.status === 'ABSENT')
                dayAbsences[day] = (dayAbsences[day] || 0) + 1;
        });
        const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        for (const [day, absences] of Object.entries(dayAbsences)) {
            const total = dayTotals[parseInt(day)] || 1;
            const rate = absences / total;
            if (rate > 0.5 && absences >= 3) {
                patterns.push({
                    type: 'DAY_PATTERN',
                    description: `Frequently absent on ${DAYS[parseInt(day)]}s (${absences}/${total} times)`,
                    dates: absentRecords
                        .filter((r) => new Date(r.date).getDay() === parseInt(day))
                        .map((r) => new Date(r.date).toISOString().split('T')[0]),
                    severity: rate > 0.7 ? 'HIGH' : 'MEDIUM',
                });
            }
        }
        return {
            attendanceRate: Math.round(attendanceRate * 10) / 10,
            consecutiveAbsences: maxConsecutive,
            patterns,
        };
    }
    createAlert(studentId, pattern) {
        return __awaiter(this, void 0, void 0, function* () {
            // Check if similar alert already exists (not resolved) in last 7 days
            const existingAlert = yield prisma_1.prisma.attendanceAlert.findFirst({
                where: {
                    studentId,
                    type: pattern.type,
                    isResolved: false,
                    createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
                },
            });
            if (existingAlert)
                return; // Don't duplicate
            yield prisma_1.prisma.attendanceAlert.create({
                data: {
                    studentId,
                    type: pattern.type,
                    message: pattern.description,
                    details: { dates: pattern.dates, severity: pattern.severity },
                },
            });
        });
    }
    createConsecutiveAbsenceAlert(student, days) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const existing = yield prisma_1.prisma.attendanceAlert.findFirst({
                where: {
                    studentId: student.id,
                    type: 'CONSECUTIVE_ABSENCE',
                    isResolved: false,
                    createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
                },
            });
            if (existing)
                return;
            yield prisma_1.prisma.attendanceAlert.create({
                data: {
                    studentId: student.id,
                    type: 'CONSECUTIVE_ABSENCE',
                    message: `${student.firstName} ${student.lastName} has been absent for ${days} consecutive days`,
                    details: { consecutiveDays: days, className: (_a = student.class) === null || _a === void 0 ? void 0 : _a.name },
                },
            });
        });
    }
    createChronicAbsenteeismAlert(student, rate) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const existing = yield prisma_1.prisma.attendanceAlert.findFirst({
                where: {
                    studentId: student.id,
                    type: 'CHRONIC_ABSENTEEISM',
                    isResolved: false,
                    createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
                },
            });
            if (existing)
                return;
            yield prisma_1.prisma.attendanceAlert.create({
                data: {
                    studentId: student.id,
                    type: 'CHRONIC_ABSENTEEISM',
                    message: `${student.firstName} ${student.lastName} has a ${rate.toFixed(1)}% attendance rate (below 80% threshold)`,
                    details: { attendanceRate: rate, className: (_a = student.class) === null || _a === void 0 ? void 0 : _a.name },
                },
            });
        });
    }
    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
        d.setHours(0, 0, 0, 0);
        return d;
    }
}
exports.attendanceIntelligenceService = new AttendanceIntelligenceService();
exports.default = exports.attendanceIntelligenceService;
