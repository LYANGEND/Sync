
import express from 'express';
import {
    createBranch,
    getAllBranches,
    getBranchById,
    updateBranch,
    deleteBranch,
    getBranchAnalytics,
    getBranchFinancialSummary,
    transferStudent,
    transferUser,
    getTransferHistory,
    compareBranches
} from '../controllers/branchController';
import { authenticateToken, authorizeRole, authorizeBranchAccess } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ==================== Basic CRUD ====================
// List all branches - Accessible by authenticated users
router.get('/', getAllBranches);
router.get('/compare', authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']), compareBranches);
router.get('/:id', getBranchById);

// Admin only routes for management
router.post('/', authorizeRole(['SUPER_ADMIN']), createBranch);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']), authorizeBranchAccess, updateBranch);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteBranch);

// ==================== Analytics & Financials ====================
router.get('/:id/analytics', authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR']), authorizeBranchAccess, getBranchAnalytics);
router.get('/:id/financial-summary', authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR']), authorizeBranchAccess, getBranchFinancialSummary);

// ==================== Transfers ====================
router.post('/:id/students/:studentId/transfer', authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']), authorizeBranchAccess, transferStudent);
router.post('/:id/users/:userId/transfer', authorizeRole(['SUPER_ADMIN']), transferUser);
router.get('/:id/transfers', authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']), authorizeBranchAccess, getTransferHistory);

export default router;
