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
import { tenantHandler } from '../utils/routeTypes';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ==================== Branch CRUD ====================
// Get all branches
router.get('/', tenantHandler(getAllBranches));

// Get branch by ID
router.get('/:id', tenantHandler(getBranchById));

// Create a new branch (SUPER_ADMIN only)
router.post('/', authorizeRole(['SUPER_ADMIN']), tenantHandler(createBranch));

// Update a branch
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']), tenantHandler(updateBranch));

// Delete a branch (SUPER_ADMIN only)
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(deleteBranch));

// ==================== Branch Analytics ====================
// System-wide analytics (must come before :id routes)
router.get('/analytics/performance', tenantHandler(getAllBranchesPerformance));

// Individual branch analytics
router.get('/:id/analytics', tenantHandler(getBranchAnalytics));
router.get('/:id/financial-summary', tenantHandler(getBranchFinancialSummary));
router.get('/:id/performance', tenantHandler(getBranchPerformanceMetrics));
router.get('/:id/transfers', tenantHandler(getBranchTransfers));
router.get('/:id/students', tenantHandler(getBranchStudents));
router.get('/:id/users', tenantHandler(getBranchUsers));
router.get('/:id/classes', tenantHandler(getBranchClasses));

// ==================== User Branch Assignments ====================
router.get('/users/:userId/branches',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    tenantHandler(getUserBranchAssignments)
);

router.post('/users/:userId/branches',
    authorizeRole(['SUPER_ADMIN']),
    tenantHandler(assignUserToBranch)
);

router.delete('/users/:userId/branches/:branchId',
    authorizeRole(['SUPER_ADMIN']),
    tenantHandler(removeUserFromBranch)
);

// ==================== Student Branch Enrollments ====================
router.get('/students/:studentId/branches',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'SECRETARY']),
    tenantHandler(getStudentBranchEnrollments)
);

router.post('/students/:studentId/branches',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    tenantHandler(enrollStudentInBranch)
);

router.delete('/students/:studentId/branches/:branchId',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    tenantHandler(removeStudentFromBranch)
);

// ==================== Transfers ====================
router.post('/transfer-student',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    tenantHandler(transferStudent)
);

// ==================== Bulk Operations ====================
router.post('/bulk/transfer-students',
    authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']),
    tenantHandler(bulkTransferStudents)
);

router.post('/bulk/assign-users',
    authorizeRole(['SUPER_ADMIN']),
    tenantHandler(bulkAssignUsers)
);

router.post('/bulk/update-status',
    authorizeRole(['SUPER_ADMIN']),
    tenantHandler(bulkUpdateBranchStatus)
);

export default router;
