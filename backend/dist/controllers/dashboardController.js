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
exports.getDashboardStats = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const getDashboardStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userRole = (_a = req.user) === null || _a === void 0 ? void 0 : _a.role;
        const userId = (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId;
        if (userRole === 'TEACHER') {
            // 1. My Classes
            const myClasses = yield prisma.class.findMany({
                where: { teacherId: userId },
                include: { _count: { select: { students: true } } }
            });
            const totalStudents = myClasses.reduce((acc, curr) => acc + curr._count.students, 0);
            // 2. Today's Schedule
            const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
            const todayDay = days[new Date().getDay()];
            const todaySchedule = yield prisma.timetablePeriod.findMany({
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
            const recentAssessments = yield prisma.assessment.findMany({
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
        // --- ADMIN / BURSAR View (Existing) ---
        // 1. Total Revenue (Today) - COMPLETED ONLY
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayPayments = yield prisma.payment.aggregate({
            where: {
                paymentDate: {
                    gte: today,
                },
                status: 'COMPLETED'
            },
            _sum: {
                amount: true,
            },
        });
        // 2. Active Students
        const activeStudentsCount = yield prisma.student.count({
            where: {
                status: 'ACTIVE',
            },
        });
        // 3. Outstanding Fees
        // Calculate total amount due - total revenue (COMPLETED)
        // This ensures consistency with paymentController
        const totalFeesAgg = yield prisma.studentFeeStructure.aggregate({
            _sum: { amountDue: true },
        });
        const totalRevenueAgg = yield prisma.payment.aggregate({
            where: { status: 'COMPLETED' },
            _sum: { amount: true },
        });
        const totalFeesAssigned = Number(totalFeesAgg._sum.amountDue || 0);
        const totalRevenue = Number(totalRevenueAgg._sum.amount || 0);
        const totalOutstanding = Math.max(0, totalFeesAssigned - totalRevenue);
        // 4. Recent Payments (Last 5) - Include Status
        const recentPayments = yield prisma.payment.findMany({
            take: 5,
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                student: {
                    select: {
                        firstName: true,
                        lastName: true,
                        class: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });
        res.json({
            role: 'ADMIN',
            dailyRevenue: Number(todayPayments._sum.amount) || 0,
            activeStudents: activeStudentsCount,
            outstandingFees: totalOutstanding,
            recentPayments: recentPayments.map(p => (Object.assign(Object.assign({}, p), { amount: Number(p.amount) }))),
        });
    }
    catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});
exports.getDashboardStats = getDashboardStats;
