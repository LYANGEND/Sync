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
exports.compareBranches = exports.getTransferHistory = exports.transferUser = exports.transferStudent = exports.getBranchFinancialSummary = exports.getBranchAnalytics = exports.deleteBranch = exports.updateBranch = exports.getBranchById = exports.getAllBranches = exports.createBranch = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
// Schemas
const createBranchSchema = zod_1.z.object({
    name: zod_1.z.string().min(2),
    code: zod_1.z.string().min(2).toUpperCase(),
    address: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    isMain: zod_1.z.boolean().default(false),
    status: zod_1.z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).default('ACTIVE'),
    capacity: zod_1.z.number().int().positive().optional(),
    parentBranchId: zod_1.z.string().uuid().optional(),
});
const updateBranchSchema = createBranchSchema.partial();
const transferSchema = zod_1.z.object({
    toBranchId: zod_1.z.string().uuid(),
    reason: zod_1.z.string().optional(),
});
// ==================== CRUD Operations ====================
const createBranch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const parseResult = createBranchSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const { name, code, address, phone, email, isMain, status, capacity, parentBranchId } = parseResult.data;
        // Check if code already exists
        const existingBranch = yield prisma_1.prisma.branch.findUnique({ where: { code } });
        if (existingBranch) {
            return res.status(409).json({ message: 'Branch code already exists' });
        }
        // If setting as Main, unset others
        if (isMain) {
            yield prisma_1.prisma.branch.updateMany({
                where: { isMain: true },
                data: { isMain: false }
            });
        }
        const branch = yield prisma_1.prisma.branch.create({
            data: { name, code, address, phone, email, isMain, status, capacity, parentBranchId }
        });
        res.status(201).json(branch);
    }
    catch (error) {
        console.error('Create branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.createBranch = createBranch;
const getAllBranches = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = req.user;
        // Branch managers can only see their own branch
        const whereClause = (user === null || user === void 0 ? void 0 : user.role) === 'BRANCH_MANAGER' && user.branchId
            ? { id: user.branchId }
            : {};
        const branches = yield prisma_1.prisma.branch.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            include: {
                _count: {
                    select: { students: true, users: true, classes: true, payments: true }
                },
                parentBranch: {
                    select: { id: true, name: true, code: true }
                },
                childBranches: {
                    select: { id: true, name: true, code: true }
                }
            }
        });
        res.json(branches);
    }
    catch (error) {
        console.error('Get branches error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getAllBranches = getAllBranches;
const getBranchById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const branch = yield prisma_1.prisma.branch.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { students: true, users: true, classes: true, payments: true }
                },
                parentBranch: {
                    select: { id: true, name: true, code: true }
                },
                childBranches: {
                    select: { id: true, name: true, code: true }
                }
            }
        });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }
        res.json(branch);
    }
    catch (error) {
        console.error('Get branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getBranchById = getBranchById;
const updateBranch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const parseResult = updateBranchSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const data = parseResult.data;
        // If setting as Main, unset others
        if (data.isMain) {
            yield prisma_1.prisma.branch.updateMany({
                where: { isMain: true, id: { not: id } },
                data: { isMain: false }
            });
        }
        const branch = yield prisma_1.prisma.branch.update({
            where: { id },
            data
        });
        res.json(branch);
    }
    catch (error) {
        console.error('Update branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.updateBranch = updateBranch;
const deleteBranch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const branch = yield prisma_1.prisma.branch.findUnique({
            where: { id },
            include: {
                _count: {
                    select: { students: true, users: true, classes: true }
                }
            }
        });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }
        if (branch._count.students > 0 || branch._count.users > 0 || branch._count.classes > 0) {
            return res.status(400).json({
                message: 'Cannot delete branch with associated students, users, or classes.',
                counts: branch._count
            });
        }
        yield prisma_1.prisma.branch.delete({ where: { id } });
        res.json({ message: 'Branch deleted successfully' });
    }
    catch (error) {
        console.error('Delete branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.deleteBranch = deleteBranch;
// ==================== Analytics Endpoints ====================
const getBranchAnalytics = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const branch = yield prisma_1.prisma.branch.findUnique({ where: { id } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }
        // Get counts
        const [studentCount, userCount, classCount, paymentStats, attendanceStats, recentEnrollments] = yield Promise.all([
            prisma_1.prisma.student.count({ where: { branchId: id } }),
            prisma_1.prisma.user.count({ where: { branchId: id } }),
            prisma_1.prisma.class.count({ where: { branchId: id } }),
            // Payment stats
            prisma_1.prisma.payment.aggregate({
                where: { branchId: id, status: 'COMPLETED' },
                _sum: { amount: true },
                _count: true
            }),
            // Attendance rate (last 30 days)
            prisma_1.prisma.attendance.groupBy({
                by: ['status'],
                where: {
                    student: { branchId: id },
                    date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                },
                _count: true
            }),
            // Recent enrollments (last 6 months by month)
            prisma_1.prisma.student.groupBy({
                by: ['createdAt'],
                where: {
                    branchId: id,
                    createdAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) }
                },
                _count: true
            })
        ]);
        // Calculate attendance rate
        const totalAttendance = attendanceStats.reduce((acc, curr) => acc + curr._count, 0);
        const presentCount = ((_a = attendanceStats.find(a => a.status === 'PRESENT')) === null || _a === void 0 ? void 0 : _a._count) || 0;
        const attendanceRate = totalAttendance > 0 ? (presentCount / totalAttendance * 100).toFixed(1) : 0;
        // Capacity utilization
        const capacityUtilization = branch.capacity
            ? ((studentCount / branch.capacity) * 100).toFixed(1)
            : null;
        res.json({
            branch,
            stats: {
                students: studentCount,
                users: userCount,
                classes: classCount,
                totalPayments: paymentStats._sum.amount || 0,
                paymentCount: paymentStats._count,
                attendanceRate: parseFloat(attendanceRate),
                capacityUtilization: capacityUtilization ? parseFloat(capacityUtilization) : null,
            },
            enrollmentTrend: recentEnrollments
        });
    }
    catch (error) {
        console.error('Get branch analytics error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getBranchAnalytics = getBranchAnalytics;
const getBranchFinancialSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { startDate, endDate } = req.query;
        const branch = yield prisma_1.prisma.branch.findUnique({ where: { id } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }
        const dateFilter = {};
        if (startDate)
            dateFilter.gte = new Date(startDate);
        if (endDate)
            dateFilter.lte = new Date(endDate);
        const [totalCollected, paymentsByMethod, outstandingFees, monthlyTrend] = yield Promise.all([
            // Total collected
            prisma_1.prisma.payment.aggregate({
                where: Object.assign({ branchId: id, status: 'COMPLETED' }, (Object.keys(dateFilter).length && { paymentDate: dateFilter })),
                _sum: { amount: true },
                _count: true
            }),
            // Payments by method
            prisma_1.prisma.payment.groupBy({
                by: ['method'],
                where: Object.assign({ branchId: id, status: 'COMPLETED' }, (Object.keys(dateFilter).length && { paymentDate: dateFilter })),
                _sum: { amount: true },
                _count: true
            }),
            // Outstanding fees (students in this branch)
            prisma_1.prisma.studentFeeStructure.aggregate({
                where: {
                    student: { branchId: id }
                },
                _sum: { amountDue: true, amountPaid: true }
            }),
            // Monthly trend (last 12 months)
            prisma_1.prisma.$queryRaw `
                SELECT 
                    DATE_TRUNC('month', "paymentDate") as month,
                    SUM(amount) as total,
                    COUNT(*) as count
                FROM payments
                WHERE "branchId" = ${id}
                AND status = 'COMPLETED'
                AND "paymentDate" >= NOW() - INTERVAL '12 months'
                GROUP BY DATE_TRUNC('month', "paymentDate")
                ORDER BY month DESC
            `
        ]);
        const outstanding = outstandingFees._sum.amountDue && outstandingFees._sum.amountPaid
            ? Number(outstandingFees._sum.amountDue) - Number(outstandingFees._sum.amountPaid)
            : 0;
        // Convert BigInt values from raw query to Numbers for JSON serialization
        const formattedMonthlyTrend = monthlyTrend.map((item) => ({
            month: item.month,
            total: Number(item.total || 0),
            count: Number(item.count || 0)
        }));
        res.json({
            branchId: id,
            branchName: branch.name,
            summary: {
                totalCollected: Number(totalCollected._sum.amount || 0),
                totalPayments: totalCollected._count,
                outstanding: outstanding,
            },
            byMethod: paymentsByMethod.map(p => ({
                method: p.method,
                total: Number(p._sum.amount || 0),
                count: p._count
            })),
            monthlyTrend: formattedMonthlyTrend
        });
    }
    catch (error) {
        console.error('Get branch financial summary error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getBranchFinancialSummary = getBranchFinancialSummary;
// ==================== Transfer Endpoints ====================
const transferStudent = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params; // Branch ID (from branch)
        const { studentId } = req.params;
        const parseResult = transferSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const { toBranchId, reason } = parseResult.data;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        // Verify student exists and belongs to source branch
        const student = yield prisma_1.prisma.student.findFirst({
            where: { id: studentId, branchId: id }
        });
        if (!student) {
            return res.status(404).json({ message: 'Student not found in this branch' });
        }
        // Verify target branch exists
        const targetBranch = yield prisma_1.prisma.branch.findUnique({ where: { id: toBranchId } });
        if (!targetBranch) {
            return res.status(404).json({ message: 'Target branch not found' });
        }
        // Perform transfer
        yield prisma_1.prisma.$transaction([
            // Update student's branch
            prisma_1.prisma.student.update({
                where: { id: studentId },
                data: { branchId: toBranchId }
            }),
            // Create transfer record
            prisma_1.prisma.branchTransfer.create({
                data: {
                    entityType: 'STUDENT',
                    entityId: studentId,
                    fromBranchId: id,
                    toBranchId,
                    reason,
                    transferredByUserId: userId
                }
            })
        ]);
        res.json({ message: 'Student transferred successfully' });
    }
    catch (error) {
        console.error('Transfer student error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.transferStudent = transferStudent;
const transferUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params; // Branch ID (from branch)
        const { userId: targetUserId } = req.params;
        const parseResult = transferSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const { toBranchId, reason } = parseResult.data;
        const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!currentUserId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        // Verify user exists and belongs to source branch
        const user = yield prisma_1.prisma.user.findFirst({
            where: { id: targetUserId, branchId: id }
        });
        if (!user) {
            return res.status(404).json({ message: 'User not found in this branch' });
        }
        // Verify target branch exists
        const targetBranch = yield prisma_1.prisma.branch.findUnique({ where: { id: toBranchId } });
        if (!targetBranch) {
            return res.status(404).json({ message: 'Target branch not found' });
        }
        // Perform transfer
        yield prisma_1.prisma.$transaction([
            // Update user's branch
            prisma_1.prisma.user.update({
                where: { id: targetUserId },
                data: { branchId: toBranchId }
            }),
            // Create transfer record
            prisma_1.prisma.branchTransfer.create({
                data: {
                    entityType: 'USER',
                    entityId: targetUserId,
                    fromBranchId: id,
                    toBranchId,
                    reason,
                    transferredByUserId: currentUserId
                }
            })
        ]);
        res.json({ message: 'User transferred successfully' });
    }
    catch (error) {
        console.error('Transfer user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.transferUser = transferUser;
const getTransferHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { entityType, entityId } = req.query;
        const where = {
            OR: [
                { fromBranchId: id },
                { toBranchId: id }
            ]
        };
        if (entityType)
            where.entityType = entityType;
        if (entityId)
            where.entityId = entityId;
        const transfers = yield prisma_1.prisma.branchTransfer.findMany({
            where,
            include: {
                fromBranch: { select: { id: true, name: true, code: true } },
                toBranch: { select: { id: true, name: true, code: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(transfers);
    }
    catch (error) {
        console.error('Get transfer history error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getTransferHistory = getTransferHistory;
// ==================== Comparison Endpoints ====================
const compareBranches = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { branchIds } = req.query;
        const ids = branchIds
            ? branchIds.split(',')
            : undefined;
        const branches = yield prisma_1.prisma.branch.findMany({
            where: ids ? { id: { in: ids } } : {},
            include: {
                _count: {
                    select: { students: true, users: true, classes: true, payments: true }
                }
            }
        });
        // Get financial summary for each branch
        const branchData = yield Promise.all(branches.map((branch) => __awaiter(void 0, void 0, void 0, function* () {
            const payments = yield prisma_1.prisma.payment.aggregate({
                where: { branchId: branch.id, status: 'COMPLETED' },
                _sum: { amount: true }
            });
            return {
                id: branch.id,
                name: branch.name,
                code: branch.code,
                status: branch.status,
                students: branch._count.students,
                users: branch._count.users,
                classes: branch._count.classes,
                payments: branch._count.payments,
                totalRevenue: payments._sum.amount || 0,
                capacity: branch.capacity,
                capacityUtilization: branch.capacity
                    ? ((branch._count.students / branch.capacity) * 100).toFixed(1)
                    : null
            };
        })));
        res.json(branchData);
    }
    catch (error) {
        console.error('Compare branches error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.compareBranches = compareBranches;
