import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/authMiddleware';

const prisma = new PrismaClient();

// ==================== Schemas ====================

const assignUserToBranchSchema = z.object({
    branchId: z.string().uuid(),
    isPrimary: z.boolean().default(false),
    role: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

const assignStudentToBranchSchema = z.object({
    branchId: z.string().uuid(),
    isPrimary: z.boolean().default(false),
    enrollType: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
});

// ==================== User Branch Assignments ====================

/**
 * Get all branch assignments for a user
 */
export const getUserBranchAssignments = async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;

        const assignments = await prisma.userBranch.findMany({
            where: { userId },
            include: {
                branch: {
                    select: { id: true, name: true, code: true, status: true, isMain: true }
                }
            },
            orderBy: [
                { isPrimary: 'desc' },
                { startDate: 'desc' }
            ]
        });

        res.json(assignments);
    } catch (error) {
        console.error('Get user branch assignments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Assign a user to a branch
 */
export const assignUserToBranch = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;
        const parseResult = assignUserToBranchSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const { branchId, isPrimary, role, startDate, endDate } = parseResult.data;

        // Check if user exists
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check if branch exists
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // If setting as primary, unset other primaries for this user
        if (isPrimary) {
            await prisma.userBranch.updateMany({
                where: { userId, isPrimary: true },
                data: { isPrimary: false }
            });

            // Also update the user's primary branchId
            await prisma.user.update({
                where: { id: userId },
                data: { branchId }
            });
        }

        // Create or update the assignment
        const assignment = await prisma.userBranch.upsert({
            where: {
                userId_branchId: { userId, branchId }
            },
            create: {
                userId,
                branchId,
                isPrimary,
                role,
                startDate: startDate ? new Date(startDate) : new Date(),
                endDate: endDate ? new Date(endDate) : undefined
            },
            update: {
                isPrimary,
                role,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : null
            },
            include: {
                branch: {
                    select: { id: true, name: true, code: true }
                }
            }
        });

        res.status(201).json(assignment);
    } catch (error) {
        console.error('Assign user to branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Remove a user from a branch
 */
export const removeUserFromBranch = async (req: Request, res: Response) => {
    try {
        const { userId, branchId } = req.params;

        // Check if this is their primary branch
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

// ==================== Student Branch Enrollments ====================

/**
 * Get all branch enrollments for a student
 */
export const getStudentBranchEnrollments = async (req: Request, res: Response) => {
    try {
        const { studentId } = req.params;

        const enrollments = await prisma.studentBranch.findMany({
            where: { studentId },
            include: {
                branch: {
                    select: { id: true, name: true, code: true, status: true, isMain: true }
                }
            },
            orderBy: [
                { isPrimary: 'desc' },
                { startDate: 'desc' }
            ]
        });

        res.json(enrollments);
    } catch (error) {
        console.error('Get student branch enrollments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Enroll a student in a branch
 */
export const enrollStudentInBranch = async (req: AuthRequest, res: Response) => {
    try {
        const { studentId } = req.params;
        const parseResult = assignStudentToBranchSchema.safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }

        const { branchId, isPrimary, enrollType, startDate, endDate } = parseResult.data;

        // Check if student exists
        const student = await prisma.student.findUnique({ where: { id: studentId } });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Check if branch exists
        const branch = await prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }

        // If setting as primary, unset other primaries for this student
        if (isPrimary) {
            await prisma.studentBranch.updateMany({
                where: { studentId, isPrimary: true },
                data: { isPrimary: false }
            });

            // Also update the student's primary branchId
            await prisma.student.update({
                where: { id: studentId },
                data: { branchId }
            });
        }

        // Create or update the enrollment
        const enrollment = await prisma.studentBranch.upsert({
            where: {
                studentId_branchId: { studentId, branchId }
            },
            create: {
                studentId,
                branchId,
                isPrimary,
                enrollType,
                startDate: startDate ? new Date(startDate) : new Date(),
                endDate: endDate ? new Date(endDate) : undefined
            },
            update: {
                isPrimary,
                enrollType,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : null
            },
            include: {
                branch: {
                    select: { id: true, name: true, code: true }
                }
            }
        });

        res.status(201).json(enrollment);
    } catch (error) {
        console.error('Enroll student in branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Remove a student from a branch
 */
export const removeStudentFromBranch = async (req: Request, res: Response) => {
    try {
        const { studentId, branchId } = req.params;

        // Check if this is their primary branch
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

// ==================== Bulk Operations ====================

/**
 * Get all users assigned to a branch (including multi-branch users)
 */
export const getBranchUsers = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.params;
        const { includeSecondary } = req.query;

        // Get users with this as primary branch OR assigned via junction table
        const [primaryUsers, assignedUsers] = await Promise.all([
            // Users with this as primary branch
            prisma.user.findMany({
                where: { branchId },
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: true,
                    isActive: true,
                    profilePictureUrl: true
                }
            }),
            // Users assigned via junction table (if includeSecondary)
            includeSecondary === 'true' ? prisma.userBranch.findMany({
                where: {
                    branchId,
                    endDate: null // Only active assignments
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            fullName: true,
                            email: true,
                            role: true,
                            isActive: true,
                            profilePictureUrl: true,
                            branchId: true
                        }
                    }
                }
            }) : []
        ]);

        // Combine and dedupe
        const allUsers = [...primaryUsers];
        const primaryIds = new Set(primaryUsers.map(u => u.id));

        for (const assignment of assignedUsers) {
            if (!primaryIds.has(assignment.user.id)) {
                allUsers.push({
                    ...assignment.user,
                    _assignment: {
                        isPrimary: assignment.isPrimary,
                        role: assignment.role,
                        startDate: assignment.startDate
                    }
                } as any);
            }
        }

        res.json(allUsers);
    } catch (error) {
        console.error('Get branch users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Get all students enrolled in a branch (including multi-branch students)
 */
export const getBranchStudents = async (req: Request, res: Response) => {
    try {
        const { branchId } = req.params;
        const { includeSecondary } = req.query;

        // Get students with this as primary branch OR enrolled via junction table
        const [primaryStudents, enrolledStudents] = await Promise.all([
            // Students with this as primary branch
            prisma.student.findMany({
                where: { branchId },
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    admissionNumber: true,
                    status: true,
                    class: { select: { id: true, name: true } }
                }
            }),
            // Students enrolled via junction table (if includeSecondary)
            includeSecondary === 'true' ? prisma.studentBranch.findMany({
                where: {
                    branchId,
                    endDate: null // Only active enrollments
                },
                include: {
                    student: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            admissionNumber: true,
                            status: true,
                            branchId: true,
                            class: { select: { id: true, name: true } }
                        }
                    }
                }
            }) : []
        ]);

        // Combine and dedupe
        const allStudents = [...primaryStudents];
        const primaryIds = new Set(primaryStudents.map(s => s.id));

        for (const enrollment of enrolledStudents) {
            if (!primaryIds.has(enrollment.student.id)) {
                allStudents.push({
                    ...enrollment.student,
                    _enrollment: {
                        isPrimary: enrollment.isPrimary,
                        enrollType: enrollment.enrollType,
                        startDate: enrollment.startDate
                    }
                } as any);
            }
        }

        res.json(allStudents);
    } catch (error) {
        console.error('Get branch students error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
