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
    try {
        // 1. Total Revenue (Today)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayPayments = yield prisma.payment.aggregate({
            where: {
                paymentDate: {
                    gte: today,
                },
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
        // Calculate total amount due - total amount paid across all fee structures
        const feeStats = yield prisma.studentFeeStructure.aggregate({
            _sum: {
                amountDue: true,
                amountPaid: true,
            },
        });
        const totalOutstanding = (Number(feeStats._sum.amountDue) || 0) - (Number(feeStats._sum.amountPaid) || 0);
        // 4. Recent Payments (Last 5)
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
            dailyRevenue: Number(todayPayments._sum.amount) || 0,
            activeStudents: activeStudentsCount,
            outstandingFees: totalOutstanding,
            recentPayments,
        });
    }
    catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});
exports.getDashboardStats = getDashboardStats;
