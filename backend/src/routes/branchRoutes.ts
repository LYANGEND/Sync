
import express from 'express';
import {
    createBranch,
    getAllBranches,
    getBranchById,
    updateBranch,
    deleteBranch
} from '../controllers/branchController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = express.Router();

// Public route (optional) - or protected
router.use(authenticateToken);

// List all branches - Accessible by authenticated users
router.get('/', getAllBranches);
router.get('/:id', getBranchById);

// Admin only routes for management
router.post('/', authorizeRole(['SUPER_ADMIN', 'ADMIN']), createBranch);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'ADMIN']), updateBranch);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteBranch);

export default router;
