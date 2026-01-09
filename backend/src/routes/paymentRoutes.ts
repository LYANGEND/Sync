import { Router } from 'express';
import {
    createPayment,
    getPayments,
    getStudentPayments,
    getFinanceStats,
    getFinancialReport,
    voidPayment,
    getPaymentById,
    checkDuplicatePayment
} from '../controllers/paymentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Stats and reports
router.get('/stats', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getFinanceStats);
router.get('/reports', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getFinancialReport);

// Check for duplicate payments before creating
router.get('/check-duplicate', authorizeRole(['SUPER_ADMIN', 'BURSAR']), checkDuplicatePayment);

// CRUD operations
router.post('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createPayment);
router.get('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPayments);
router.get('/student/:studentId', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'TEACHER']), getStudentPayments);

// Single payment operations
router.get('/:paymentId', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPaymentById);
router.post('/:paymentId/void', authorizeRole(['SUPER_ADMIN', 'BURSAR']), voidPayment);

export default router;
