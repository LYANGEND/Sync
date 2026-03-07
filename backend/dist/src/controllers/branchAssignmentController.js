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
exports.getBranchStudents = exports.getBranchUsers = exports.removeStudentFromBranch = exports.enrollStudentInBranch = exports.getStudentBranchEnrollments = exports.removeUserFromBranch = exports.assignUserToBranch = exports.getUserBranchAssignments = void 0;
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
// ==================== Schemas ====================
const assignUserToBranchSchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid(),
    isPrimary: zod_1.z.boolean().default(false),
    role: zod_1.z.string().optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
});
const assignStudentToBranchSchema = zod_1.z.object({
    branchId: zod_1.z.string().uuid(),
    isPrimary: zod_1.z.boolean().default(false),
    enrollType: zod_1.z.string().optional(),
    startDate: zod_1.z.string().datetime().optional(),
    endDate: zod_1.z.string().datetime().optional(),
});
// ==================== User Branch Assignments ====================
/**
 * Get all branch assignments for a user
 */
const getUserBranchAssignments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const assignments = yield prisma_1.prisma.userBranch.findMany({
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
    }
    catch (error) {
        console.error('Get user branch assignments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getUserBranchAssignments = getUserBranchAssignments;
/**
 * Assign a user to a branch
 */
const assignUserToBranch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.params;
        const parseResult = assignUserToBranchSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const { branchId, isPrimary, role, startDate, endDate } = parseResult.data;
        // Check if user exists
        const user = yield prisma_1.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Check if branch exists
        const branch = yield prisma_1.prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }
        // If setting as primary, unset other primaries for this user
        if (isPrimary) {
            yield prisma_1.prisma.userBranch.updateMany({
                where: { userId, isPrimary: true },
                data: { isPrimary: false }
            });
            // Also update the user's primary branchId
            yield prisma_1.prisma.user.update({
                where: { id: userId },
                data: { branchId }
            });
        }
        // Create or update the assignment
        const assignment = yield prisma_1.prisma.userBranch.upsert({
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
    }
    catch (error) {
        console.error('Assign user to branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.assignUserToBranch = assignUserToBranch;
/**
 * Remove a user from a branch
 */
const removeUserFromBranch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, branchId } = req.params;
        // Check if this is their primary branch
        const assignment = yield prisma_1.prisma.userBranch.findUnique({
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
        yield prisma_1.prisma.userBranch.delete({
            where: { userId_branchId: { userId, branchId } }
        });
        res.json({ message: 'User removed from branch successfully' });
    }
    catch (error) {
        console.error('Remove user from branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.removeUserFromBranch = removeUserFromBranch;
// ==================== Student Branch Enrollments ====================
/**
 * Get all branch enrollments for a student
 */
const getStudentBranchEnrollments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        const enrollments = yield prisma_1.prisma.studentBranch.findMany({
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
    }
    catch (error) {
        console.error('Get student branch enrollments error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getStudentBranchEnrollments = getStudentBranchEnrollments;
/**
 * Enroll a student in a branch
 */
const enrollStudentInBranch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId } = req.params;
        const parseResult = assignStudentToBranchSchema.safeParse(req.body);
        if (!parseResult.success) {
            return res.status(400).json({ error: parseResult.error.errors });
        }
        const { branchId, isPrimary, enrollType, startDate, endDate } = parseResult.data;
        // Check if student exists
        const student = yield prisma_1.prisma.student.findUnique({ where: { id: studentId } });
        if (!student) {
            return res.status(404).json({ message: 'Student not found' });
        }
        // Check if branch exists
        const branch = yield prisma_1.prisma.branch.findUnique({ where: { id: branchId } });
        if (!branch) {
            return res.status(404).json({ message: 'Branch not found' });
        }
        // If setting as primary, unset other primaries for this student
        if (isPrimary) {
            yield prisma_1.prisma.studentBranch.updateMany({
                where: { studentId, isPrimary: true },
                data: { isPrimary: false }
            });
            // Also update the student's primary branchId
            yield prisma_1.prisma.student.update({
                where: { id: studentId },
                data: { branchId }
            });
        }
        // Create or update the enrollment
        const enrollment = yield prisma_1.prisma.studentBranch.upsert({
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
    }
    catch (error) {
        console.error('Enroll student in branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.enrollStudentInBranch = enrollStudentInBranch;
/**
 * Remove a student from a branch
 */
const removeStudentFromBranch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { studentId, branchId } = req.params;
        // Check if this is their primary branch
        const enrollment = yield prisma_1.prisma.studentBranch.findUnique({
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
        yield prisma_1.prisma.studentBranch.delete({
            where: { studentId_branchId: { studentId, branchId } }
        });
        res.json({ message: 'Student removed from branch successfully' });
    }
    catch (error) {
        console.error('Remove student from branch error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.removeStudentFromBranch = removeStudentFromBranch;
// ==================== Bulk Operations ====================
/**
 * Get all users assigned to a branch (including multi-branch users)
 */
const getBranchUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { branchId } = req.params;
        const { includeSecondary } = req.query;
        // Get users with this as primary branch OR assigned via junction table
        const [primaryUsers, assignedUsers] = yield Promise.all([
            // Users with this as primary branch
            prisma_1.prisma.user.findMany({
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
            includeSecondary === 'true' ? prisma_1.prisma.userBranch.findMany({
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
                allUsers.push(Object.assign(Object.assign({}, assignment.user), { _assignment: {
                        isPrimary: assignment.isPrimary,
                        role: assignment.role,
                        startDate: assignment.startDate
                    } }));
            }
        }
        res.json(allUsers);
    }
    catch (error) {
        console.error('Get branch users error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getBranchUsers = getBranchUsers;
/**
 * Get all students enrolled in a branch (including multi-branch students)
 */
const getBranchStudents = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { branchId } = req.params;
        const { includeSecondary } = req.query;
        // Get students with this as primary branch OR enrolled via junction table
        const [primaryStudents, enrolledStudents] = yield Promise.all([
            // Students with this as primary branch
            prisma_1.prisma.student.findMany({
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
            includeSecondary === 'true' ? prisma_1.prisma.studentBranch.findMany({
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
                allStudents.push(Object.assign(Object.assign({}, enrollment.student), { _enrollment: {
                        isPrimary: enrollment.isPrimary,
                        enrollType: enrollment.enrollType,
                        startDate: enrollment.startDate
                    } }));
            }
        }
        res.json(allStudents);
    }
    catch (error) {
        console.error('Get branch students error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.getBranchStudents = getBranchStudents;
