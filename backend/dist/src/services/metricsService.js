"use strict";
/**
 * Unified School Metrics Service
 * ==============================
 * Single source of truth for commonly-queried school KPIs.
 *
 * BEFORE: Outstanding fees computed in 5 controllers, attendance rate in 7,
 *         student risk count in 4, revenue trends in 3 — each with slightly
 *         different queries and thresholds.
 *
 * AFTER:  One canonical query per metric, optionally cached, consumed by all
 *         controllers and services.
 */
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
exports.invalidate = invalidate;
exports.getFeeCollectionSummary = getFeeCollectionSummary;
exports.getAttendanceSummary = getAttendanceSummary;
exports.getTermAttendanceSummary = getTermAttendanceSummary;
exports.getRiskSummary = getRiskSummary;
exports.getAtRiskCount = getAtRiskCount;
exports.getEnrollmentSummary = getEnrollmentSummary;
exports.getRevenueSummary = getRevenueSummary;
exports.getUnresolvedAlertCount = getUnresolvedAlertCount;
exports.getSchoolHealthSnapshot = getSchoolHealthSnapshot;
const prisma_1 = require("../utils/prisma");
// ------------------------------------------------------------------
// Simple in-memory TTL cache (avoids hammering DB for hot dashboards)
// ------------------------------------------------------------------
const cache = new Map();
function cached(key, ttlMs, fn) {
    const entry = cache.get(key);
    if (entry && entry.expiresAt > Date.now())
        return Promise.resolve(entry.data);
    return fn().then(data => {
        cache.set(key, { data, expiresAt: Date.now() + ttlMs });
        return data;
    });
}
/** Bust a specific key (after writes) */
function invalidate(key) {
    cache.delete(key);
}
function getFeeCollectionSummary() {
    return cached('fee-collection', 60000, () => __awaiter(this, void 0, void 0, function* () {
        const [feesAgg, paidAgg] = yield Promise.all([
            prisma_1.prisma.studentFeeStructure.aggregate({ _sum: { amountDue: true } }),
            prisma_1.prisma.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
        ]);
        const totalDue = Number(feesAgg._sum.amountDue || 0);
        const totalPaid = Number(paidAgg._sum.amount || 0);
        const outstanding = Math.max(0, totalDue - totalPaid);
        const collectionRatePercent = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0;
        return { totalDue, totalPaid, outstanding, collectionRatePercent };
    }));
}
/**
 * Attendance for a time window. Defaults to the last 7 days.
 */
function getAttendanceSummary(sinceDays = 7) {
    return cached(`attendance-${sinceDays}`, 60000, () => __awaiter(this, void 0, void 0, function* () {
        const since = new Date();
        since.setDate(since.getDate() - sinceDays);
        const records = yield prisma_1.prisma.attendance.findMany({
            where: { date: { gte: since } },
            select: { status: true },
        });
        const total = records.length;
        const present = records.filter(r => r.status === 'PRESENT').length;
        const late = records.filter(r => r.status === 'LATE').length;
        const absent = records.filter(r => r.status === 'ABSENT').length;
        const ratePercent = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
        return { totalRecords: total, present, late, absent, ratePercent };
    }));
}
/**
 * Attendance for the current active term (used by analytics dashboards).
 */
function getTermAttendanceSummary() {
    return __awaiter(this, void 0, void 0, function* () {
        const activeTerm = yield prisma_1.prisma.academicTerm.findFirst({ where: { isActive: true } });
        if (!activeTerm)
            return { totalRecords: 0, present: 0, late: 0, absent: 0, ratePercent: 0 };
        return cached(`attendance-term-${activeTerm.id}`, 120000, () => __awaiter(this, void 0, void 0, function* () {
            const records = yield prisma_1.prisma.attendance.findMany({
                where: { date: { gte: activeTerm.startDate, lte: new Date() } },
                select: { status: true },
            });
            const total = records.length;
            const present = records.filter(r => r.status === 'PRESENT').length;
            const late = records.filter(r => r.status === 'LATE').length;
            const absent = records.filter(r => r.status === 'ABSENT').length;
            const ratePercent = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
            return { totalRecords: total, present, late, absent, ratePercent, termId: activeTerm.id };
        }));
    });
}
function getRiskSummary() {
    return cached('risk-summary', 120000, () => __awaiter(this, void 0, void 0, function* () {
        try {
            const groups = yield prisma_1.prisma.studentRiskAssessment.groupBy({
                by: ['riskLevel'],
                _count: true,
            });
            const byLevel = {};
            let total = 0;
            for (const g of groups) {
                byLevel[g.riskLevel] = g._count;
                total += g._count;
            }
            return {
                critical: byLevel['CRITICAL'] || 0,
                high: byLevel['HIGH'] || 0,
                medium: byLevel['MEDIUM'] || 0,
                low: byLevel['LOW'] || 0,
                total,
            };
        }
        catch (_a) {
            return { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
        }
    }));
}
/** Convenience: count of HIGH + CRITICAL students */
function getAtRiskCount() {
    return __awaiter(this, void 0, void 0, function* () {
        const s = yield getRiskSummary();
        return s.critical + s.high;
    });
}
function getEnrollmentSummary() {
    return cached('enrollment-summary', 120000, () => __awaiter(this, void 0, void 0, function* () {
        const [activeStudents, activeTeachers, totalClasses] = yield Promise.all([
            prisma_1.prisma.student.count({ where: { status: 'ACTIVE' } }),
            prisma_1.prisma.user.count({ where: { role: 'TEACHER', isActive: true } }),
            prisma_1.prisma.class.count(),
        ]);
        const studentTeacherRatio = activeTeachers > 0 ? Math.round(activeStudents / activeTeachers) : 0;
        return { activeStudents, activeTeachers, totalClasses, studentTeacherRatio };
    }));
}
function getRevenueSummary() {
    return cached('revenue-summary', 60000, () => __awaiter(this, void 0, void 0, function* () {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const [totalAgg, todayAgg] = yield Promise.all([
            prisma_1.prisma.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true }, _count: true }),
            prisma_1.prisma.payment.aggregate({ where: { status: 'COMPLETED', paymentDate: { gte: today } }, _sum: { amount: true } }),
        ]);
        return {
            totalCollected: Number(totalAgg._sum.amount || 0),
            transactionCount: totalAgg._count || 0,
            todayRevenue: Number(todayAgg._sum.amount || 0),
        };
    }));
}
// ------------------------------------------------------------------
// ALERTS
// ------------------------------------------------------------------
function getUnresolvedAlertCount() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            return yield prisma_1.prisma.attendanceAlert.count({ where: { isResolved: false } });
        }
        catch (_a) {
            return 0;
        }
    });
}
function getSchoolHealthSnapshot() {
    return __awaiter(this, void 0, void 0, function* () {
        const [enrollment, fees, attendance, risk, revenue, unresolvedAlerts] = yield Promise.all([
            getEnrollmentSummary(),
            getFeeCollectionSummary(),
            getAttendanceSummary(7),
            getRiskSummary(),
            getRevenueSummary(),
            getUnresolvedAlertCount(),
        ]);
        return { enrollment, fees, attendance, risk, revenue, unresolvedAlerts };
    });
}
