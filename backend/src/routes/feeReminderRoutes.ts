import { Router } from 'express';
import {
    sendPaymentReceipt,
    sendFeeReminders,
    getStudentsWithOutstandingFees,
    testNotification
} from '../controllers/feeReminderController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

// Get students with outstanding fees (for reminder preview)
router.get('/outstanding', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(getStudentsWithOutstandingFees));

// Send fee reminders
router.post('/send', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(sendFeeReminders));

// Send payment receipt for a specific payment
router.post('/receipt/:paymentId', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'SECRETARY']), tenantHandler(sendPaymentReceipt));

// Test notification settings
router.post('/test', authorizeRole(['SUPER_ADMIN']), tenantHandler(testNotification));

export default router;
