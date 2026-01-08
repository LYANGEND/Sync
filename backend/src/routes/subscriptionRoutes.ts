import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler, publicHandler } from '../utils/routeTypes';
import {
    getPlans,
    getSubscriptionStatus,
    getPaymentHistory,
    initiateUpgrade,
    confirmPayment,
} from '../controllers/subscriptionController';

const router = Router();

// Public routes (no auth required)
router.get('/plans', publicHandler(getPlans));

// Protected routes (require authentication)
router.get('/status', authenticateToken, tenantHandler(getSubscriptionStatus));
router.get('/payments', authenticateToken, tenantHandler(getPaymentHistory));
router.post('/upgrade', authenticateToken, authorizeRole(['SUPER_ADMIN']), tenantHandler(initiateUpgrade));

// Admin only routes
router.post('/payments/:paymentId/confirm', authenticateToken, authorizeRole(['SUPER_ADMIN']), tenantHandler(confirmPayment));

export default router;
