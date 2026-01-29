import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { TenantRequest, getTenantId } from '../utils/tenantContext';

const prisma = new PrismaClient();

// ==================== Schemas ====================

const createBranchSchema = z.object({
    name: z.string().min(1),
    code: z.string().min(1).max(10),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    isMain: z.boolean().default(false),
    status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE']).default('ACTIVE'),
    capacity: z.number().int().positive().optional(),
    logoUrl: z.string().url().optional(),
    parentBranchId: z.string().uuid().optional(),
});

const updateBranchSchema = createBranchSchema.partial();

// ==================== Branch CRUD ====================

export const getAllBranches = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { status, includeStats } = req.query;

        const branches = await prisma.branch.findMany({
            where: {
                tenantId,
                ...(status && { status: status as any })
            },
            include: {
                parentBranch: { select: { id: true, name: true, code: true } },
                childBranches: { select: { id: true, name: true, code: true } },
                ...(includeStats === 'true' && {
                    _count: {
                        select: {
                            users: true,
                            students: true,
                            classes: true,
                            payments: true
                        }
                    }
                })
            },
            orderBy: [{ isMain: 'desc' }, { name: 'asc' }]
        });

        res.json(branches);
    } catch (error) {
        console.error('Get all branches error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBranchById = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;

        const branch = await prisma.branch.findFirst({
            where: { id, tenantId },
            include: {
                parentBranch: { select: { id: true, name: true, code: true } },
                childBranches: { select: { id: true, name: true, code: true } },
                _count: {
                    select: {
                        users: true,
                        students: true,
                        classes: true,
                        payments: true
                    }
                }
            }
        });

        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        res.json(branch);
    } catch (error) {
        console.error('Get branch by id error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const createBranch = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const parseResult = createBranchSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const data = parseResult.data;

        // If setting as main, unset other mains
        if (data.isMain) {
            await prisma.branch.updateMany({
                where: { tenantId, isMain: true },
                data: { isMain: false }
            });
        }

        const branch = await prisma.branch.create({
            data: {
                ...data,
                tenantId,
                code: data.code.toUpperCase()
            }
        });

        res.status(201).json(branch);
    } catch (error: any) {
        console.error('Create branch error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Branch with this code already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateBranch = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;
        const parseResult = updateBranchSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const data = parseResult.data;

        // Check if branch exists
        const existing = await prisma.branch.findFirst({ where: { id, tenantId } });
        if (!existing) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // If setting as main, unset other mains
        if (data.isMain) {
            await prisma.branch.updateMany({
                where: { tenantId, isMain: true, NOT: { id } },
                data: { isMain: false }
            });
        }

        const branch = await prisma.branch.update({
            where: { id },
            data: {
                ...data,
                ...(data.code && { code: data.code.toUpperCase() })
            }
        });

        res.json(branch);
    } catch (error: any) {
        console.error('Update branch error:', error);
        if (error.code === 'P2002') {
            return res.status(400).json({ message: 'Branch with this code already exists' });
        }
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteBranch = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;

        const branch = await prisma.branch.findFirst({ where: { id, tenantId } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        if (branch.isMain) {
            return res.status(400).json({ message: 'Cannot delete the main branch' });
        }

        // Check for dependencies
        const counts = await prisma.branch.findFirst({
            where: { id },
            select: {
                _count: {
                    select: { users: true, students: true, classes: true }
                }
            }
        });

        if (counts?._count.users || counts?._count.students || counts?._count.classes) {
            return res.status(400).json({
                message: 'Cannot delete branch with assigned users, students, or classes. Transfer them first.'
            });
        }

        await prisma.branch.delete({ where: { id } });
        res.json({ message: 'Branch deleted successfully' });
    } catch (error) {
        console.error('Delete branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==================== Branch Analytics ====================

export const getBranchAnalytics = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;

        const branch = await prisma.branch.findFirst({
            where: { id, tenantId },
            include: {
                _count: {
                    select: { users: true, students: true, classes: true, payments: true }
                }
            }
        });

        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Get attendance rate (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const attendanceStats = await prisma.attendance.groupBy({
            by: ['status'],
            where: {
                tenantId,
                student: { branchId: id },
                date: { gte: thirtyDaysAgo }
            },
            _count: true
        });

        const totalAttendance = attendanceStats.reduce((sum, s) => sum + s._count, 0);
        const presentCount = attendanceStats.find(s => s.status === 'PRESENT')?._count || 0;
        const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

        // Capacity utilization
        const capacityUtilization = branch.capacity
            ? Math.round((branch._count.students / branch.capacity) * 100)
            : null;

        res.json({
            branch,
            stats: {
                students: branch._count.students,
                users: branch._count.users,
                classes: branch._count.classes,
                payments: branch._count.payments,
                attendanceRate,
                capacityUtilization
            }
        });
    } catch (error) {
        console.error('Get branch analytics error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBranchFinancialSummary = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;
        const { startDate, endDate } = req.query;

        const branch = await prisma.branch.findFirst({ where: { id, tenantId } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Build date filter
        const dateFilter: any = {};
        if (startDate) dateFilter.gte = new Date(startDate as string);
        if (endDate) dateFilter.lte = new Date(endDate as string);

        // Total collected
        const payments = await prisma.payment.aggregate({
            where: {
                tenantId,
                branchId: id,
                status: 'COMPLETED',
                ...(Object.keys(dateFilter).length > 0 && { paymentDate: dateFilter })
            },
            _sum: { amount: true },
            _count: true
        });

        // By payment method
        const byMethod = await prisma.payment.groupBy({
            by: ['method'],
            where: {
                tenantId,
                branchId: id,
                status: 'COMPLETED',
                ...(Object.keys(dateFilter).length > 0 && { paymentDate: dateFilter })
            },
            _sum: { amount: true },
            _count: true
        });

        // Daily breakdown (last 30 days or date range)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const dailyStart = startDate ? new Date(startDate as string) : thirtyDaysAgo;
        const dailyEnd = endDate ? new Date(endDate as string) : new Date();

        const dailyPayments = await prisma.$queryRaw<Array<{ date: string; total: number; count: number }>>`
            SELECT 
                TO_CHAR("paymentDate", 'YYYY-MM-DD') as date,
                SUM(amount)::float as total,
                COUNT(*)::int as count
            FROM payments
            WHERE "tenantId" = ${tenantId}
                AND "branchId" = ${id}
                AND status = 'COMPLETED'
                AND "paymentDate" >= ${dailyStart}
                AND "paymentDate" <= ${dailyEnd}
            GROUP BY TO_CHAR("paymentDate", 'YYYY-MM-DD')
            ORDER BY date DESC
        `;

        // Monthly trend (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyPayments = await prisma.$queryRaw<Array<{ month: string; total: number; count: number }>>`
            SELECT 
                TO_CHAR(DATE_TRUNC('month', "paymentDate"), 'YYYY-MM') as month,
                SUM(amount)::float as total,
                COUNT(*)::int as count
            FROM payments
            WHERE "tenantId" = ${tenantId}
                AND "branchId" = ${id}
                AND status = 'COMPLETED'
                AND "paymentDate" >= ${sixMonthsAgo}
            GROUP BY DATE_TRUNC('month', "paymentDate")
            ORDER BY month ASC
        `;

        // Outstanding (sum of fees - sum of payments for branch students)
        const feeData = await prisma.studentFeeStructure.aggregate({
            where: {
                student: { tenantId, branchId: id }
            },
            _sum: { amountDue: true, amountPaid: true }
        });

        const outstanding = feeData._sum.amountDue && feeData._sum.amountPaid
            ? Number(feeData._sum.amountDue) - Number(feeData._sum.amountPaid)
            : 0;

        // Student payment status
        const totalStudents = await prisma.student.count({
            where: { tenantId, branchId: id, status: 'ACTIVE' }
        });

        // Students with fees assigned
        const studentsWithFees = await prisma.studentFeeStructure.groupBy({
            by: ['studentId'],
            where: {
                student: { tenantId, branchId: id, status: 'ACTIVE' }
            },
            _sum: { amountDue: true }
        });

        // Students with payments
        const studentsWithPayments = await prisma.payment.groupBy({
            by: ['studentId'],
            where: {
                tenantId,
                branchId: id,
                status: 'COMPLETED'
            },
            _sum: { amount: true }
        });

        const paymentMap = new Map(
            studentsWithPayments.map(p => [p.studentId, Number(p._sum.amount || 0)])
        );

        let fullyPaid = 0;
        let partiallyPaid = 0;
        let notPaid = 0;

        studentsWithFees.forEach(f => {
            const due = Number(f._sum.amountDue || 0);
            const paid = paymentMap.get(f.studentId) || 0;

            if (paid >= due) fullyPaid++;
            else if (paid > 0) partiallyPaid++;
            else notPaid++;
        });

        res.json({
            branchId: id,
            branchName: branch.name,
            branchCode: branch.code,
            summary: {
                totalCollected: Number(payments._sum.amount || 0),
                totalPayments: payments._count,
                outstanding,
                totalStudents,
                fullyPaid,
                partiallyPaid,
                notPaid
            },
            byMethod: byMethod.map(p => ({
                method: p.method,
                total: Number(p._sum.amount || 0),
                count: p._count
            })),
            dailyBreakdown: dailyPayments,
            monthlyTrend: monthlyPayments
        });
    } catch (error) {
        console.error('Get branch financial summary error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==================== Multi-Branch Assignments ====================

export const getUserBranchAssignments = async (req: TenantRequest, res: Response) => {
    try {
        const { userId } = req.params;

        const assignments = await prisma.userBranch.findMany({
            where: { userId },
            include: {
                branch: { select: { id: true, name: true, code: true, status: true, isMain: true } }
            },
            orderBy: [{ isPrimary: 'desc' }, { startDate: 'desc' }]
        });

        res.json(assignments);
    } catch (error) {
        console.error('Get user branch assignments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const assignUserToBranch = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { userId } = req.params;
        const { branchId, isPrimary, role } = req.body;

        // Verify user and branch exist and belong to tenant
        const [user, branch] = await Promise.all([
            prisma.user.findFirst({ where: { id: userId, tenantId } }),
            prisma.branch.findFirst({ where: { id: branchId, tenantId } })
        ]);

        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!branch) return res.status(404).json({ message: 'Branch not found' });

        // If setting as primary, unset other primaries
        if (isPrimary) {
            await prisma.userBranch.updateMany({
                where: { userId, isPrimary: true },
                data: { isPrimary: false }
            });
            // Update user's main branchId
            await prisma.user.update({
                where: { id: userId },
                data: { branchId }
            });
        }

        const assignment = await prisma.userBranch.upsert({
            where: { userId_branchId: { userId, branchId } },
            create: { userId, branchId, isPrimary: isPrimary || false, role },
            update: { isPrimary: isPrimary || false, role },
            include: { branch: { select: { id: true, name: true, code: true } } }
        });

        res.status(201).json(assignment);
    } catch (error) {
        console.error('Assign user to branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const removeUserFromBranch = async (req: Request, res: Response) => {
    try {
        const { userId, branchId } = req.params;

        const assignment = await prisma.userBranch.findUnique({
            where: { userId_branchId: { userId, branchId } }
        });

        if (!assignment) {
            return res.status(404).json({ message: 'Assignment not found' });
        }

        if (assignment.isPrimary) {
            return res.status(400).json({
                message: 'Cannot remove user from their primary branch. Set another branch as primary first.'
            });
        }

        await prisma.userBranch.delete({
            where: { userId_branchId: { userId, branchId } }
        });

        res.json({ message: 'User removed from branch successfully' });
    } catch (error) {
        console.error('Remove user from branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getStudentBranchEnrollments = async (req: TenantRequest, res: Response) => {
    try {
        const { studentId } = req.params;

        const enrollments = await prisma.studentBranch.findMany({
            where: { studentId },
            include: {
                branch: { select: { id: true, name: true, code: true, status: true, isMain: true } }
            },
            orderBy: [{ isPrimary: 'desc' }, { startDate: 'desc' }]
        });

        res.json(enrollments);
    } catch (error) {
        console.error('Get student branch enrollments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const enrollStudentInBranch = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { studentId } = req.params;
        const { branchId, isPrimary, enrollType } = req.body;

        // Verify student and branch exist and belong to tenant
        const [student, branch] = await Promise.all([
            prisma.student.findFirst({ where: { id: studentId, tenantId } }),
            prisma.branch.findFirst({ where: { id: branchId, tenantId } })
        ]);

        if (!student) return res.status(404).json({ message: 'Student not found' });
        if (!branch) return res.status(404).json({ message: 'Branch not found' });

        // If setting as primary, unset other primaries
        if (isPrimary) {
            await prisma.studentBranch.updateMany({
                where: { studentId, isPrimary: true },
                data: { isPrimary: false }
            });
            // Update student's main branchId
            await prisma.student.update({
                where: { id: studentId },
                data: { branchId }
            });
        }

        const enrollment = await prisma.studentBranch.upsert({
            where: { studentId_branchId: { studentId, branchId } },
            create: { studentId, branchId, isPrimary: isPrimary || false, enrollType },
            update: { isPrimary: isPrimary || false, enrollType },
            include: { branch: { select: { id: true, name: true, code: true } } }
        });

        res.status(201).json(enrollment);
    } catch (error) {
        console.error('Enroll student in branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const removeStudentFromBranch = async (req: Request, res: Response) => {
    try {
        const { studentId, branchId } = req.params;

        const enrollment = await prisma.studentBranch.findUnique({
            where: { studentId_branchId: { studentId, branchId } }
        });

        if (!enrollment) {
            return res.status(404).json({ message: 'Enrollment not found' });
        }

        if (enrollment.isPrimary) {
            return res.status(400).json({
                message: 'Cannot remove student from their primary branch. Set another branch as primary first.'
            });
        }

        await prisma.studentBranch.delete({
            where: { studentId_branchId: { studentId, branchId } }
        });

        res.json({ message: 'Student removed from branch successfully' });
    } catch (error) {
        console.error('Remove student from branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};


// ==================== Branch Data Lists ====================

export const getBranchStudents = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;

        // Get students who have this branch as their current branchId 
        // OR have an active StudentBranch enrollment for this branch
        const students = await prisma.student.findMany({
            where: {
                tenantId,
                OR: [
                    { branchId: id },
                    { branchEnrollments: { some: { branchId: id } } }
                ]
            },
            include: {
                branchEnrollments: {
                    where: { branchId: id },
                    select: { isPrimary: true, enrollType: true }
                },
                class: { select: { id: true, name: true } }
            },
            orderBy: { lastName: 'asc' }
        });

        res.json(students);
    } catch (error) {
        console.error('Get branch students error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBranchUsers = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;

        // Get users who have this branch as their current branchId
        // OR have an UserBranch assignment for this branch
        const users = await prisma.user.findMany({
            where: {
                tenantId,
                OR: [
                    { branchId: id },
                    { branchAssignments: { some: { branchId: id } } }
                ]
            },
            include: {
                branchAssignments: {
                    where: { branchId: id },
                    select: { isPrimary: true, role: true }
                }
            },
            orderBy: { fullName: 'asc' }
        });

        res.json(users);
    } catch (error) {
        console.error('Get branch users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBranchClasses = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;

        const classes = await prisma.class.findMany({
            where: {
                tenantId,
                branchId: id
            },
            include: {
                teacher: { select: { id: true, fullName: true } },
                _count: { select: { students: true } }
            },
            orderBy: { gradeLevel: 'asc' }
        });

        res.json(classes);
    } catch (error) {
        console.error('Get branch classes error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==================== Branch Transfers ====================


export const transferStudent = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const userId = req.user?.userId;
        const { studentId, toBranchId, reason } = req.body;

        const student = await prisma.student.findFirst({
            where: { id: studentId, tenantId }
        });

        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        if (!student.branchId) {
            return res.status(400).json({ message: 'Student has no current branch' });
        }

        const toBranch = await prisma.branch.findFirst({
            where: { id: toBranchId, tenantId }
        });

        if (!toBranch) {
            return res.status(404).json({ message: 'Destination branch not found' });
        }

        // Create transfer record and update student
        const [transfer] = await prisma.$transaction([
            prisma.branchTransfer.create({
                data: {
                    entityType: 'STUDENT',
                    entityId: studentId,
                    fromBranchId: student.branchId,
                    toBranchId,
                    reason,
                    transferredByUserId: userId!
                }
            }),
            prisma.student.update({
                where: { id: studentId },
                data: { branchId: toBranchId }
            }),
            prisma.studentBranch.updateMany({
                where: { studentId, isPrimary: true },
                data: { isPrimary: false }
            }),
            prisma.studentBranch.upsert({
                where: { studentId_branchId: { studentId, branchId: toBranchId } },
                create: { studentId, branchId: toBranchId, isPrimary: true },
                update: { isPrimary: true, endDate: null }
            })
        ]);

        res.json({ message: 'Student transferred successfully', transfer });
    } catch (error) {
        console.error('Transfer student error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBranchTransfers = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;

        const transfers = await prisma.branchTransfer.findMany({
            where: {
                OR: [{ fromBranchId: id }, { toBranchId: id }],
                fromBranch: { tenantId }
            },
            include: {
                fromBranch: { select: { id: true, name: true, code: true } },
                toBranch: { select: { id: true, name: true, code: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        res.json(transfers);
    } catch (error) {
        console.error('Get branch transfers error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==================== Bulk Operations ====================

export const bulkTransferStudents = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const userId = req.user?.userId;
        const { studentIds, toBranchId, reason } = req.body;

        if (!Array.isArray(studentIds) || studentIds.length === 0) {
            return res.status(400).json({ message: 'Student IDs array is required' });
        }

        const toBranch = await prisma.branch.findFirst({
            where: { id: toBranchId, tenantId }
        });

        if (!toBranch) {
            return res.status(404).json({ message: 'Destination branch not found' });
        }

        const results = [];
        const errors = [];

        for (const studentId of studentIds) {
            try {
                const student = await prisma.student.findFirst({
                    where: { id: studentId, tenantId }
                });

                if (!student || !student.branchId) {
                    errors.push({ studentId, error: 'Student not found or has no branch' });
                    continue;
                }

                await prisma.$transaction([
                    prisma.branchTransfer.create({
                        data: {
                            entityType: 'STUDENT',
                            entityId: studentId,
                            fromBranchId: student.branchId,
                            toBranchId,
                            reason,
                            transferredByUserId: userId!
                        }
                    }),
                    prisma.student.update({
                        where: { id: studentId },
                        data: { branchId: toBranchId }
                    }),
                    prisma.studentBranch.updateMany({
                        where: { studentId, isPrimary: true },
                        data: { isPrimary: false }
                    }),
                    prisma.studentBranch.upsert({
                        where: { studentId_branchId: { studentId, branchId: toBranchId } },
                        create: { studentId, branchId: toBranchId, isPrimary: true },
                        update: { isPrimary: true, endDate: null }
                    })
                ]);

                results.push({ studentId, success: true });
            } catch (error) {
                errors.push({ studentId, error: 'Transfer failed' });
            }
        }

        res.json({
            message: 'Bulk transfer completed',
            successful: results.length,
            failed: errors.length,
            results,
            errors
        });
    } catch (error) {
        console.error('Bulk transfer students error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const bulkAssignUsers = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { userIds, branchId, role } = req.body;

        if (!Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: 'User IDs array is required' });
        }

        const branch = await prisma.branch.findFirst({
            where: { id: branchId, tenantId }
        });

        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        const results = [];
        const errors = [];

        for (const userId of userIds) {
            try {
                const user = await prisma.user.findFirst({
                    where: { id: userId, tenantId }
                });

                if (!user) {
                    errors.push({ userId, error: 'User not found' });
                    continue;
                }

                await prisma.userBranch.upsert({
                    where: { userId_branchId: { userId, branchId } },
                    create: { userId, branchId, isPrimary: false, role },
                    update: { role }
                });

                results.push({ userId, success: true });
            } catch (error) {
                errors.push({ userId, error: 'Assignment failed' });
            }
        }

        res.json({
            message: 'Bulk assignment completed',
            successful: results.length,
            failed: errors.length,
            results,
            errors
        });
    } catch (error) {
        console.error('Bulk assign users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const bulkUpdateBranchStatus = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { branchIds, status } = req.body;

        if (!Array.isArray(branchIds) || branchIds.length === 0) {
            return res.status(400).json({ message: 'Branch IDs array is required' });
        }

        if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const result = await prisma.branch.updateMany({
            where: {
                id: { in: branchIds },
                tenantId
            },
            data: { status }
        });

        res.json({
            message: 'Bulk status update completed',
            updated: result.count
        });
    } catch (error) {
        console.error('Bulk update branch status error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// ==================== Advanced Analytics ====================

export const getBranchPerformanceMetrics = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);
        const { id } = req.params;

        const branch = await prisma.branch.findFirst({
            where: { id, tenantId },
            include: {
                _count: {
                    select: { students: true, users: true, classes: true }
                }
            }
        });

        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // Student retention (students who stayed for more than 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const retainedStudents = await prisma.student.count({
            where: {
                tenantId,
                branchId: id,
                createdAt: { lte: sixMonthsAgo }
            }
        });

        const retentionRate = branch._count.students > 0
            ? Math.round((retainedStudents / branch._count.students) * 100)
            : 0;

        // Teacher-student ratio
        const teachers = await prisma.user.count({
            where: {
                tenantId,
                branchId: id,
                role: 'TEACHER'
            }
        });

        const teacherStudentRatio = teachers > 0
            ? Math.round(branch._count.students / teachers)
            : 0;

        // Average class size
        const classesWithCount = await prisma.class.findMany({
            where: { tenantId, branchId: id },
            include: { _count: { select: { students: true } } }
        });

        const avgClassSize = classesWithCount.length > 0
            ? Math.round(
                classesWithCount.reduce((sum, c) => sum + c._count.students, 0) / classesWithCount.length
            )
            : 0;

        // Attendance trend (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const attendanceByDay = await prisma.attendance.groupBy({
            by: ['date'],
            where: {
                tenantId,
                student: { branchId: id },
                date: { gte: thirtyDaysAgo }
            },
            _count: { status: true }
        });

        // Enrollment trend (last 6 months)
        const enrollmentByMonth = await prisma.$queryRaw<Array<{ month: string; count: number }>>`
            SELECT 
                TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') as month,
                COUNT(*)::int as count
            FROM students
            WHERE "tenantId" = ${tenantId}
                AND "branchId" = ${id}
                AND "createdAt" >= ${sixMonthsAgo}
            GROUP BY DATE_TRUNC('month', "createdAt")
            ORDER BY month ASC
        `;

        res.json({
            branchId: id,
            branchName: branch.name,
            metrics: {
                retentionRate,
                teacherStudentRatio,
                avgClassSize,
                totalStudents: branch._count.students,
                totalTeachers: teachers,
                totalClasses: branch._count.classes
            },
            trends: {
                attendance: attendanceByDay.length,
                enrollment: enrollmentByMonth
            }
        });
    } catch (error) {
        console.error('Get branch performance metrics error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getAllBranchesPerformance = async (req: TenantRequest, res: Response) => {
    try {
        const tenantId = getTenantId(req);

        const branches = await prisma.branch.findMany({
            where: { tenantId },
            include: {
                _count: {
                    select: { students: true, users: true, classes: true, payments: true }
                }
            }
        });

        const performanceData = await Promise.all(
            branches.map(async (branch) => {
                // Calculate capacity utilization
                const capacityUtilization = branch.capacity
                    ? Math.round((branch._count.students / branch.capacity) * 100)
                    : null;

                // Get attendance rate (last 30 days)
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                const attendanceStats = await prisma.attendance.groupBy({
                    by: ['status'],
                    where: {
                        tenantId,
                        student: { branchId: branch.id },
                        date: { gte: thirtyDaysAgo }
                    },
                    _count: true
                });

                const totalAttendance = attendanceStats.reduce((sum, s) => sum + s._count, 0);
                const presentCount = attendanceStats.find(s => s.status === 'PRESENT')?._count || 0;
                const attendanceRate = totalAttendance > 0
                    ? Math.round((presentCount / totalAttendance) * 100)
                    : 0;

                // Get revenue
                const revenue = await prisma.payment.aggregate({
                    where: {
                        tenantId,
                        branchId: branch.id,
                        status: 'COMPLETED'
                    },
                    _sum: { amount: true }
                });

                return {
                    id: branch.id,
                    name: branch.name,
                    code: branch.code,
                    status: branch.status,
                    students: branch._count.students,
                    staff: branch._count.users,
                    classes: branch._count.classes,
                    capacityUtilization,
                    attendanceRate,
                    revenue: Number(revenue._sum.amount || 0)
                };
            })
        );

        // Calculate rankings
        const rankedByStudents = [...performanceData].sort((a, b) => b.students - a.students);
        const rankedByAttendance = [...performanceData].sort((a, b) => b.attendanceRate - a.attendanceRate);
        const rankedByRevenue = [...performanceData].sort((a, b) => b.revenue - a.revenue);

        res.json({
            branches: performanceData,
            rankings: {
                byStudents: rankedByStudents.slice(0, 5).map(b => ({ id: b.id, name: b.name, value: b.students })),
                byAttendance: rankedByAttendance.slice(0, 5).map(b => ({ id: b.id, name: b.name, value: b.attendanceRate })),
                byRevenue: rankedByRevenue.slice(0, 5).map(b => ({ id: b.id, name: b.name, value: b.revenue }))
            }
        });
    } catch (error) {
        console.error('Get all branches performance error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
