import { Router } from 'express';
import { createPayment, getPayments, getStudentPayments } from '../controllers/paymentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'SYSTEM_OWNER']), createPayment);
router.get('/', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'SYSTEM_OWNER']), getPayments);
router.get('/student/:studentId', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SYSTEM_OWNER']), getStudentPayments);

export default router;
