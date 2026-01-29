import express from 'express';
import {
    getAllBranches,
    getBranchById,
    createBranch,
    updateBranch,
    deleteBranch,
    getBranchAnalytics,
    getBranchFinancialSummary,
    getUserBranchAssignments,
    assignUserToBranch,
    removeUserFromBranch,
    getStudentBranchEnrollments,
    enrollStudentInBranch,
    removeStudentFromBranch,
    transferStudent,
    getBranchTransfers,
    getBranchStudents,
    getBranchUsers,
    getBranchClasses,
    bulkTransferStudents,
    bulkAssignUsers,
    bulkUpdateBranchStatus,
    getBranchPerformanceMetrics,
    getAllBranchesPerformance
} from '../controllers/branchController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ==================== Branch CRUD ====================
// Get all branches
router.get('/', getAllBranches);

// Get branch by ID
router.get('/:id', getBranchById);

// Create a new branch (SUPER_ADMIN only)
router.post('/', authorizeRole(['SUPER_ADMIN']), createBranch);

// Update a branch
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']), updateBranch);

// Delete a branch (SUPER_ADMIN only)
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteBranch);

// ==================== Branch Analytics ====================
// System-wide analytics (must come before :id routes)
router.get('/analytics/performance', getAllBranchesPerformance);

// Individual branch analytics
router.get('/:id/analytics', getBranchAnalytics);
router.get('/:id/financial-summary', getBranchFinancialSummary);
router.get('/:id/performance', getBranchPerformanceMetrics);
router.get('/:id/transfers', getBranchTransfers);
router.get('/:id/students', getBranchStudents);
router.get('/:id/users', getBranchUsers);
router.get('/:id/classes', getBranchClasses);

// ==================== User Branch Assignments ====================
router.get('/users/:userId/branches',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    getUserBranchAssignments
);

router.post('/users/:userId/branches',
    authorizeRole(['SUPER_ADMIN']),
    assignUserToBranch
);

router.delete('/users/:userId/branches/:branchId',
    authorizeRole(['SUPER_ADMIN']),
    removeUserFromBranch
);

// ==================== Student Branch Enrollments ====================
router.get('/students/:studentId/branches',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'SECRETARY']),
    getStudentBranchEnrollments
);

router.post('/students/:studentId/branches',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    enrollStudentInBranch
);

router.delete('/students/:studentId/branches/:branchId',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    removeStudentFromBranch
);

// ==================== Transfers ====================
router.post('/transfer-student',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    transferStudent
);

// ==================== Bulk Operations ====================
router.post('/bulk/transfer-students',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    bulkTransferStudents
);

router.post('/bulk/assign-users',
    authorizeRole(['SUPER_ADMIN']),
    bulkAssignUsers
);

router.post('/bulk/update-status',
    authorizeRole(['SUPER_ADMIN']),
    bulkUpdateBranchStatus
);

export default router;
