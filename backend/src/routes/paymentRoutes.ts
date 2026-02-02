import { Router } from 'express';
import { createPayment, getPayments, getStudentPayments, getFinanceStats, getFinancialReport, voidPayment, sendPaymentReceipt, getMobileMoneyPayments } from '../controllers/paymentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

router.get('/stats', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(getFinanceStats));
router.get('/reports', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(getFinancialReport));
router.get('/mobile-money', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(getMobileMoneyPayments));

router.post('/', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'PARENT']), tenantHandler(createPayment));
router.post('/:id/receipt/send', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(sendPaymentReceipt));
router.put('/:id/void', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(voidPayment));
router.get('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(getPayments));
router.get('/student/:studentId', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'TEACHER']), tenantHandler(getStudentPayments));

export default router;
