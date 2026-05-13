import { Router } from 'express';
import {
  sendSingleSms,
  sendBulkSms,
  broadcastSms,
  checkSmsBalance,
} from '../controllers/smsController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { requireFeature } from '../middleware/featureGate';

const router = Router();

// All SMS routes require authentication + SMS feature
router.use(authenticateToken, requireFeature('SMS'));

const smsRoles = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY'];

// Send a single SMS
router.post('/send', authorizeRole(smsRoles), sendSingleSms);

// Send bulk SMS (different messages per recipient)
router.post('/bulk', authorizeRole(smsRoles), sendBulkSms);

// Broadcast same message to multiple numbers (uses mShastra comma endpoint when available)
router.post('/broadcast', authorizeRole(smsRoles), broadcastSms);

// Check SMS credit balance (mShastra only)
router.get('/balance', authorizeRole(smsRoles), checkSmsBalance);

export default router;
