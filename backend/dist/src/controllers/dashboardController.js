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
exports.getDashboardStats = void 0;
const prisma_1 = require("../utils/prisma");
const metrics = __importStar(require("../services/metricsService"));
const getDashboardStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userRole = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        if (userRole === 'TEACHER') {
            // 1. My Classes
            const myClasses = yield prisma_1.prisma.class.findMany({
                where: { teacherId: userId },
                include: { _count: { select: { students: true } } }
            });
            const totalStudents = myClasses.reduce((acc, curr) => acc + curr._count.students, 0);
            // 2. Today's Schedule
            const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
            const todayDay = days[new Date().getDay()];
            const todaySchedule = yield prisma_1.prisma.timetablePeriod.findMany({
                where: {
                    teacherId: userId,
                    dayOfWeek: todayDay
                },
                include: {
                    classes: {
                        include: {
                            class: true
                        }
                    },
                    subject: true
                },
                orderBy: { startTime: 'asc' }
            });
            // 3. Recent Assessments (Created for my classes)
            const classIds = myClasses.map(c => c.id);
            const recentAssessments = yield prisma_1.prisma.assessment.findMany({
                where: {
                    classId: { in: classIds }
                },
                take: 5,
                orderBy: { date: 'desc' },
                include: {
                    class: true,
                    subject: true,
                    _count: { select: { results: true } }
                }
            });
            return res.json({
                role: 'TEACHER',
                stats: {
                    totalStudents,
                    totalClasses: myClasses.length,
                    todayScheduleCount: todaySchedule.length
                },
                myClasses,
                todaySchedule,
                recentAssessments
            });
        }
        // --- ADMIN / BURSAR View — uses shared metricsService for canonical numbers ---
        const [health, recentPayments] = yield Promise.all([
            metrics.getSchoolHealthSnapshot(),
            prisma_1.prisma.payment.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                include: {
                    student: {
                        select: {
                            firstName: true,
                            lastName: true,
                            class: { select: { name: true } },
                        },
                    },
                },
            }),
        ]);
        res.json({
            role: 'ADMIN',
            dailyRevenue: health.revenue.todayRevenue,
            activeStudents: health.enrollment.activeStudents,
            outstandingFees: health.fees.outstanding,
            recentPayments: recentPayments.map(p => (Object.assign(Object.assign({}, p), { amount: Number(p.amount) }))),
            intelligence: {
                atRiskCount: health.risk.critical + health.risk.high,
                unresolvedAlerts: health.unresolvedAlerts,
                attendanceRate: health.attendance.ratePercent,
            },
        });
    }
    catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});
exports.getDashboardStats = getDashboardStats;
