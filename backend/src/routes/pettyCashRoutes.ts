import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  getPettyCashAccounts, createPettyCashAccount,
  getPettyCashTransactions, createPettyCashTransaction,
  getPettyCashSummary,
} from '../controllers/pettyCashController';

const router = Router();

router.use(authenticateToken);

router.get('/accounts', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPettyCashAccounts);
router.post('/accounts', authorizeRole(['SUPER_ADMIN']), createPettyCashAccount);
router.get('/accounts/:accountId/transactions', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPettyCashTransactions);
router.get('/accounts/:accountId/summary', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPettyCashSummary);
router.post('/transactions', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createPettyCashTransaction);

export default router;
