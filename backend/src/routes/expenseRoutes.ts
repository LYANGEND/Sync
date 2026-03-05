import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  getVendors, createVendor, updateVendor, deleteVendor,
  getExpenses, getExpenseById, createExpense, updateExpense,
  approveExpense, rejectExpense, markExpensePaid, deleteExpense,
  getExpenseSummary,
} from '../controllers/expenseController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Vendors
router.get('/vendors', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getVendors);
router.post('/vendors', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createVendor);
router.put('/vendors/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR']), updateVendor);
router.delete('/vendors/:id', authorizeRole(['SUPER_ADMIN']), deleteVendor);

// Expenses
router.get('/summary', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getExpenseSummary);
router.get('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getExpenses);
router.get('/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getExpenseById);
router.post('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createExpense);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR']), updateExpense);
router.post('/:id/approve', authorizeRole(['SUPER_ADMIN']), approveExpense);
router.post('/:id/reject', authorizeRole(['SUPER_ADMIN']), rejectExpense);
router.post('/:id/pay', authorizeRole(['SUPER_ADMIN', 'BURSAR']), markExpensePaid);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteExpense);

export default router;
