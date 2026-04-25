import { Router } from 'express';
import {
    createPayment,
    getPayments,
    getStudentPayments,
    getFinanceStats,
    getFinancialReport,
    getReconciliationDashboard,
    reconcilePayment,
    unreconcilePayment,
    voidPayment,
    getPaymentById,
    checkDuplicatePayment,
    // Mobile Money endpoints
    initiateMobileMoneyPayment,
    checkMobileMoneyStatus,
    handleLencoWebhook,
    getMobileMoneyCollections,
    getMobileMoneyCollectionById,
    getStudentForPublicPayment,
    initiatePublicMobileMoneyPayment,
} from '../controllers/paymentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

// ============================================
// PUBLIC WEBHOOK ROUTES (No authentication)
// ============================================

// Lenco webhook endpoint - must be public for Lenco to call
router.post('/webhook/lenco', handleLencoWebhook);

// Public Student Lookup & Payment
router.get('/public/students/:identifier', getStudentForPublicPayment);
router.post('/public/mobile-money/initiate', initiatePublicMobileMoneyPayment);

// ============================================
// AUTHENTICATED ROUTES
// ============================================

router.use(authenticateToken);

// Stats and reports
router.get('/stats', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getFinanceStats);
router.get('/reports', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getFinancialReport);
router.get('/reconciliation', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getReconciliationDashboard);

// Check for duplicate payments before creating
router.get('/check-duplicate', authorizeRole(['SUPER_ADMIN', 'BURSAR']), checkDuplicatePayment);

// ============================================
// MOBILE MONEY ROUTES
// ============================================

// Initiate mobile money collection
router.post('/mobile-money/initiate', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'PARENT']), initiateMobileMoneyPayment);

// Check status of mobile money collection
router.get('/mobile-money/status/:reference', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'PARENT']), checkMobileMoneyStatus);

// List all mobile money collections
router.get('/mobile-money', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'PARENT']), getMobileMoneyCollections);

// Get single mobile money collection
router.get('/mobile-money/:collectionId', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'PARENT']), getMobileMoneyCollectionById);

// ============================================
// STANDARD PAYMENT CRUD ROUTES
// ============================================

// CRUD operations
router.post('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createPayment);
router.get('/', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPayments);
router.get('/student/:studentId', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'PARENT']), getStudentPayments);

// Single payment operations
router.post('/:paymentId/reconcile', authorizeRole(['SUPER_ADMIN', 'BURSAR']), reconcilePayment);
router.post('/:paymentId/unreconcile', authorizeRole(['SUPER_ADMIN', 'BURSAR']), unreconcilePayment);
router.get('/:paymentId', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPaymentById);
router.post('/:paymentId/void', authorizeRole(['SUPER_ADMIN', 'BURSAR']), voidPayment);

export default router;
