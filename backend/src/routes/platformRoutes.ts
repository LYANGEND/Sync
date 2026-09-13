import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { platformHostGuard } from '../middleware/platformHostGuard';
import {
  provisionTenant, listTenants, getTenant,
  updateTenantAdmin, suspendTenant, activateTenant,
  platformLogin, getPlatformOverview, getPlatformHealth,
  updateTenantFeature, listPlatformAuditLogs,
  updatePlatformUserStatus, resetPlatformUserPassword,
  setTenantMaintenance, impersonateTenantUser,
  listPlatformSecurityEvents, listOperationsFeed,
  updateTenantOnboarding, setupTenantDomain, verifyTenantDomain, checkTenantDomain,
  listPlatformPricing, updatePlatformPlanPricing, updatePlatformBillingSettings,
  getTenantBillingProfileHandler, updateTenantBillingProfileHandler, previewTenantBilling,
  listPlatformInvoicesHandler, generatePlatformInvoicesHandler, issuePlatformInvoiceHandler,
  markPlatformInvoicePaidHandler, voidPlatformInvoiceHandler,
  getPlatformSmsSettingsHandler, updatePlatformSmsSettingsHandler,
  getPlatformWhatsappSettingsHandler, updatePlatformWhatsappSettingsHandler,
  getPlatformLencoSettingsHandler, updatePlatformLencoSettingsHandler,
} from '../controllers/platformController';

const router = Router();

router.use(platformHostGuard);

// Platform admin login — no auth needed, no tenant header needed
router.post('/login', platformLogin);

// All below require PLATFORM_ADMIN
router.use(authenticateToken, authorizeRole(['PLATFORM_ADMIN']));

router.get('/overview', getPlatformOverview);
router.get('/health', getPlatformHealth);
router.get('/audit-logs', listPlatformAuditLogs);
router.get('/security-events', listPlatformSecurityEvents);
router.get('/operations-feed', listOperationsFeed);

router.post('/tenants', provisionTenant);
router.get('/tenants', listTenants);
router.get('/tenants/:id', getTenant);
router.put('/tenants/:id', updateTenantAdmin);
router.put('/tenants/:id/onboarding', updateTenantOnboarding);
router.post('/tenants/:id/suspend', suspendTenant);
router.post('/tenants/:id/activate', activateTenant);
router.put('/tenants/:id/maintenance', setTenantMaintenance);
router.post('/tenants/:id/domain/setup', setupTenantDomain);
router.post('/tenants/:id/domain/check', checkTenantDomain);
router.post('/tenants/:id/domain/verify', verifyTenantDomain);
router.post('/tenants/:id/impersonate/:userId', impersonateTenantUser);
router.put('/tenants/:id/features/:feature', updateTenantFeature);

router.patch('/users/:id/status', updatePlatformUserStatus);
router.post('/users/:id/reset-password', resetPlatformUserPassword);

router.get('/billing/pricing', listPlatformPricing);
router.put('/billing/pricing/:plan', updatePlatformPlanPricing);
router.put('/billing/settings', updatePlatformBillingSettings);
router.get('/billing/invoices', listPlatformInvoicesHandler);
router.post('/billing/invoices/generate', generatePlatformInvoicesHandler);
router.post('/billing/invoices/:id/issue', issuePlatformInvoiceHandler);
router.post('/billing/invoices/:id/paid', markPlatformInvoicePaidHandler);
router.post('/billing/invoices/:id/void', voidPlatformInvoiceHandler);
router.get('/tenants/:id/billing-profile', getTenantBillingProfileHandler);
router.put('/tenants/:id/billing-profile', updateTenantBillingProfileHandler);
router.get('/tenants/:id/billing-preview', previewTenantBilling);

router.get('/settings/sms', getPlatformSmsSettingsHandler);
router.put('/settings/sms', updatePlatformSmsSettingsHandler);
router.get('/settings/whatsapp', getPlatformWhatsappSettingsHandler);
router.put('/settings/whatsapp', updatePlatformWhatsappSettingsHandler);
router.get('/settings/lenco', getPlatformLencoSettingsHandler);
router.put('/settings/lenco', updatePlatformLencoSettingsHandler);

export default router;
