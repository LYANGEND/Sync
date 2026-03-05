import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  getDebtors,
  listCampaigns,
  createNewCampaign,
  executeExistingCampaign,
  getCampaignDetails,
  sendReminders,
  previewMessage,
  getCollectionAnalytics,
  reconcilePayments,
  getCollectionSettings,
  updateCollectionSettings,
} from '../controllers/debtCollectionController';

const router = Router();

router.use(authenticateToken);

const allowedRoles = ['SUPER_ADMIN', 'BURSAR'];

// Debtors
router.get('/debtors', authorizeRole(allowedRoles), getDebtors);

// Campaigns
router.get('/campaigns', authorizeRole(allowedRoles), listCampaigns);
router.post('/campaigns', authorizeRole(allowedRoles), createNewCampaign);
router.get('/campaigns/:id', authorizeRole(allowedRoles), getCampaignDetails);
router.post('/campaigns/:id/execute', authorizeRole(allowedRoles), executeExistingCampaign);

// Quick Send
router.post('/send', authorizeRole(allowedRoles), sendReminders);

// AI Preview
router.post('/preview-message', authorizeRole(allowedRoles), previewMessage);

// Analytics
router.get('/analytics', authorizeRole(allowedRoles), getCollectionAnalytics);
router.post('/reconcile', authorizeRole(allowedRoles), reconcilePayments);

// Settings
router.get('/settings', authorizeRole(allowedRoles), getCollectionSettings);
router.put('/settings', authorizeRole(['SUPER_ADMIN']), updateCollectionSettings);

export default router;
