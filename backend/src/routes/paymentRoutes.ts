import { Router } from 'express';
import { createPayment, getPayments, getStudentPayments, getFinanceStats } from '../controllers/paymentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/stats', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getFinanceStats);

router.post('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createPayment);
router.get('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPayments);
router.get('/student/:studentId', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'TEACHER']), getStudentPayments);

export default router;
