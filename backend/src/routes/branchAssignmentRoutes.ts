import express from 'express';
import {
    getUserBranchAssignments,
    assignUserToBranch,
    removeUserFromBranch,
    getStudentBranchEnrollments,
    enrollStudentInBranch,
    removeStudentFromBranch,
    getBranchUsers,
    getBranchStudents
} from '../controllers/branchAssignmentController';
import { authenticateToken, authorizeRole, authorizeBranchAccess } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ==================== User Branch Assignments ====================
// Get all branch assignments for a user
router.get('/users/:userId/branches',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    getUserBranchAssignments
);

// Assign a user to a branch
router.post('/users/:userId/branches',
    authorizeRole(['SUPER_ADMIN']),
    assignUserToBranch
);

// Remove a user from a branch
router.delete('/users/:userId/branches/:branchId',
    authorizeRole(['SUPER_ADMIN']),
    removeUserFromBranch
);

// ==================== Student Branch Enrollments ====================
// Get all branch enrollments for a student
router.get('/students/:studentId/branches',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'SECRETARY']),
    getStudentBranchEnrollments
);

// Enroll a student in a branch
router.post('/students/:studentId/branches',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    enrollStudentInBranch
);

// Remove a student from a branch
router.delete('/students/:studentId/branches/:branchId',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    removeStudentFromBranch
);

// ==================== Branch-centric queries ====================
// Get all users in a branch (with optional secondary assignments)
router.get('/branches/:branchId/users',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    authorizeBranchAccess,
    getBranchUsers
);

// Get all students in a branch (with optional secondary enrollments)
router.get('/branches/:branchId/students',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'SECRETARY']),
    authorizeBranchAccess,
    getBranchStudents
);

export default router;
