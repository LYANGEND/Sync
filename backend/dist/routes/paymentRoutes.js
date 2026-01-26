"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentController_1 = require("../controllers/paymentController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// ============================================
// PUBLIC WEBHOOK ROUTES (No authentication)
// ============================================
// Lenco webhook endpoint - must be public for Lenco to call
router.post('/webhook/lenco', paymentController_1.handleLencoWebhook);
// Public Student Lookup & Payment
router.get('/public/students/:identifier', paymentController_1.getStudentForPublicPayment);
router.post('/public/mobile-money/initiate', paymentController_1.initiatePublicMobileMoneyPayment);
// ============================================
// AUTHENTICATED ROUTES
// ============================================
router.use(authMiddleware_1.authenticateToken);
// Stats and reports
router.get('/stats', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), paymentController_1.getFinanceStats);
router.get('/reports', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), paymentController_1.getFinancialReport);
// Check for duplicate payments before creating
router.get('/check-duplicate', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), paymentController_1.checkDuplicatePayment);
// ============================================
// MOBILE MONEY ROUTES
// ============================================
// Initiate mobile money collection
router.post('/mobile-money/initiate', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'PARENT']), paymentController_1.initiateMobileMoneyPayment);
// Check status of mobile money collection
router.get('/mobile-money/status/:reference', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'PARENT']), paymentController_1.checkMobileMoneyStatus);
// List all mobile money collections
router.get('/mobile-money', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'PARENT']), paymentController_1.getMobileMoneyCollections);
// Get single mobile money collection
router.get('/mobile-money/:collectionId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'PARENT']), paymentController_1.getMobileMoneyCollectionById);
// ============================================
// STANDARD PAYMENT CRUD ROUTES
// ============================================
// CRUD operations
router.post('/', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), paymentController_1.createPayment);
router.get('/', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), paymentController_1.getPayments);
router.get('/student/:studentId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'PARENT']), paymentController_1.getStudentPayments);
// Single payment operations
router.get('/:paymentId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), paymentController_1.getPaymentById);
router.post('/:paymentId/void', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), paymentController_1.voidPayment);
exports.default = router;
