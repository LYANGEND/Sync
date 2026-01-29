
import { Request, Response } from 'express';
import { PrismaClient, BranchStatus, TransferEntityType } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

// Schemas
const createBranchSchema = z.object({
    name: z.string().min(2),
    code: z.string().min(2).toUpperCase(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
    isMain: z.boolean().default(false),
    status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).default('ACTIVE'),
    capacity: z.number().int().positive().optional(),
    parentBranchId: z.string().uuid().optional(),
});

const updateBranchSchema = createBranchSchema.partial();

const transferSchema = z.object({
    toBranchId: z.string().uuid(),
    reason: z.string().optional(),
});

// ==================== CRUD Operations ====================

export const createBranch = async (req: Request, res: Response) => {
    try {
        const parseResult = createBranchSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const { name, code, address, phone, email, isMain, status, capacity, parentBranchId } = parseResult.data;

        // Check if code already exists
        const existingBranch = await prisma.branch.findUnique({ where: { code } });
        if (existingBranch) {
            return res.status(409).json({ message: 'Branch code already exists' });
        }

        // If setting as Main, unset others
        if (isMain) {
            await prisma.branch.updateMany({
                where: { isMain: true },
                data: { isMain: false }
            });
        }

        const branch = await prisma.branch.create({
            data: { name, code, address, phone, email, isMain, status, capacity, parentBranchId }
        });

        res.status(201).json(branch);
    } catch (error) {
        console.error('Create branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllBranches = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user;

        // Branch managers can only see their own branch
        const whereClause = user?.role === 'BRANCH_MANAGER' && user.branchId
            ? { id: user.branchId }
            : {};

        const branches = await prisma.branch.findMany({
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
    } catch (error) {
        console.error('Get branches error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBranchById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const branch = await prisma.branch.findUnique({
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
    } catch (error) {
        console.error('Get branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateBranch = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const parseResult = updateBranchSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const data = parseResult.data;

        // If setting as Main, unset others
        if (data.isMain) {
            await prisma.branch.updateMany({
                where: { isMain: true, id: { not: id } },
                data: { isMain: false }
            });
        }

        const branch = await prisma.branch.update({
            where: { id },
            data
        });

        res.json(branch);
    } catch (error) {
        console.error('Update branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteBranch = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const branch = await prisma.branch.findUnique({
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

        await prisma.branch.delete({ where: { id } });
        res.json({ message: 'Branch deleted successfully' });
    } catch (error) {
        console.error('Delete branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==================== Analytics Endpoints ====================

export const getBranchAnalytics = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const branch = await prisma.branch.findUnique({ where: { id } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Get counts
        const [studentCount, userCount, classCount, paymentStats, attendanceStats, recentEnrollments] = await Promise.all([
            prisma.student.count({ where: { branchId: id } }),
            prisma.user.count({ where: { branchId: id } }),
            prisma.class.count({ where: { branchId: id } }),

            // Payment stats
            prisma.payment.aggregate({
                where: { branchId: id, status: 'COMPLETED' },
                _sum: { amount: true },
                _count: true
            }),

            // Attendance rate (last 30 days)
            prisma.attendance.groupBy({
                by: ['status'],
                where: {
                    student: { branchId: id },
                    date: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
                },
                _count: true
            }),

            // Recent enrollments (last 6 months by month)
            prisma.student.groupBy({
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
        const presentCount = attendanceStats.find(a => a.status === 'PRESENT')?._count || 0;
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
                attendanceRate: parseFloat(attendanceRate as string),
                capacityUtilization: capacityUtilization ? parseFloat(capacityUtilization) : null,
            },
            enrollmentTrend: recentEnrollments
        });
    } catch (error) {
        console.error('Get branch analytics error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBranchFinancialSummary = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { startDate, endDate } = req.query;

        const branch = await prisma.branch.findUnique({ where: { id } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate as string);
        if (endDate) dateFilter.lte = new Date(endDate as string);

        const [totalCollected, paymentsByMethod, outstandingFees, monthlyTrend] = await Promise.all([
            // Total collected
            prisma.payment.aggregate({
                where: {
                    branchId: id,
                    status: 'COMPLETED',
                    ...(Object.keys(dateFilter).length && { paymentDate: dateFilter })
                },
                _sum: { amount: true },
                _count: true
            }),

            // Payments by method
            prisma.payment.groupBy({
                by: ['method'],
                where: {
                    branchId: id,
                    status: 'COMPLETED',
                    ...(Object.keys(dateFilter).length && { paymentDate: dateFilter })
                },
                _sum: { amount: true },
                _count: true
            }),

            // Outstanding fees (students in this branch)
            prisma.studentFeeStructure.aggregate({
                where: {
                    student: { branchId: id }
                },
                _sum: { amountDue: true, amountPaid: true }
            }),

            // Monthly trend (last 12 months)
            prisma.$queryRaw`
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
        const formattedMonthlyTrend = (monthlyTrend as any[]).map((item: any) => ({
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
    } catch (error) {
        console.error('Get branch financial summary error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==================== Transfer Endpoints ====================

export const transferStudent = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params; // Branch ID (from branch)
        const { studentId } = req.params;
        const parseResult = transferSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const { toBranchId, reason } = parseResult.data;
        const userId = req.user?.userId;

        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Verify student exists and belongs to source branch
        const student = await prisma.student.findFirst({
            where: { id: studentId, branchId: id }
        });

        if (!student) {
            return res.status(404).json({ message: 'Student not found in this branch' });
        }

        // Verify target branch exists
        const targetBranch = await prisma.branch.findUnique({ where: { id: toBranchId } });
        if (!targetBranch) {
            return res.status(404).json({ message: 'Target branch not found' });
        }

        // Perform transfer
        await prisma.$transaction([
            // Update student's branch
            prisma.student.update({
                where: { id: studentId },
                data: { branchId: toBranchId }
            }),
            // Create transfer record
            prisma.branchTransfer.create({
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
    } catch (error) {
        console.error('Transfer student error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const transferUser = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params; // Branch ID (from branch)
        const { userId: targetUserId } = req.params;
        const parseResult = transferSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const { toBranchId, reason } = parseResult.data;
        const currentUserId = req.user?.userId;

        if (!currentUserId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Verify user exists and belongs to source branch
        const user = await prisma.user.findFirst({
            where: { id: targetUserId, branchId: id }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found in this branch' });
        }

        // Verify target branch exists
        const targetBranch = await prisma.branch.findUnique({ where: { id: toBranchId } });
        if (!targetBranch) {
            return res.status(404).json({ message: 'Target branch not found' });
        }

        // Perform transfer
        await prisma.$transaction([
            // Update user's branch
            prisma.user.update({
                where: { id: targetUserId },
                data: { branchId: toBranchId }
            }),
            // Create transfer record
            prisma.branchTransfer.create({
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
    } catch (error) {
        console.error('Transfer user error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getTransferHistory = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { entityType, entityId } = req.query;

        const where: any = {
            OR: [
                { fromBranchId: id },
                { toBranchId: id }
            ]
        };

        if (entityType) where.entityType = entityType;
        if (entityId) where.entityId = entityId;

        const transfers = await prisma.branchTransfer.findMany({
            where,
            include: {
                fromBranch: { select: { id: true, name: true, code: true } },
                toBranch: { select: { id: true, name: true, code: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 100
        });

        res.json(transfers);
    } catch (error) {
        console.error('Get transfer history error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==================== Comparison Endpoints ====================

export const compareBranches = async (req: Request, res: Response) => {
    try {
        const { branchIds } = req.query;

        const ids = branchIds
            ? (branchIds as string).split(',')
            : undefined;

        const branches = await prisma.branch.findMany({
            where: ids ? { id: { in: ids } } : {},
            include: {
                _count: {
                    select: { students: true, users: true, classes: true, payments: true }
                }
            }
        });

        // Get financial summary for each branch
        const branchData = await Promise.all(branches.map(async (branch) => {
            const payments = await prisma.payment.aggregate({
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
        }));

        res.json(branchData);
    } catch (error) {
        console.error('Compare branches error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
