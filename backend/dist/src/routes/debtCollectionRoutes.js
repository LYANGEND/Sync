"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const debtCollectionController_1 = require("../controllers/debtCollectionController");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
const allowedRoles = ['SUPER_ADMIN', 'BURSAR'];
// Debtors
router.get('/debtors', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.getDebtors);
// Campaigns
router.get('/campaigns', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.listCampaigns);
router.post('/campaigns', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.createNewCampaign);
router.get('/campaigns/:id', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.getCampaignDetails);
router.post('/campaigns/:id/execute', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.executeExistingCampaign);
// Quick Send
router.post('/send', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.sendReminders);
// AI Preview
router.post('/preview-message', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.previewMessage);
// Analytics
router.get('/analytics', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.getCollectionAnalytics);
router.post('/reconcile', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.reconcilePayments);
// Settings
router.get('/settings', (0, authMiddleware_1.authorizeRole)(allowedRoles), debtCollectionController_1.getCollectionSettings);
router.put('/settings', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), debtCollectionController_1.updateCollectionSettings);
exports.default = router;
