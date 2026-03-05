import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  getBudgets, getBudgetById, createBudget, updateBudget,
  activateBudget, closeBudget, deleteBudget, getBudgetVsActual,
} from '../controllers/budgetController';

const router = Router();

router.use(authenticateToken);

router.get('/vs-actual', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getBudgetVsActual);
router.get('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getBudgets);
router.get('/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getBudgetById);
router.post('/', authorizeRole(['SUPER_ADMIN']), createBudget);
router.put('/:id', authorizeRole(['SUPER_ADMIN']), updateBudget);
router.post('/:id/activate', authorizeRole(['SUPER_ADMIN']), activateBudget);
router.post('/:id/close', authorizeRole(['SUPER_ADMIN']), closeBudget);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteBudget);

export default router;
