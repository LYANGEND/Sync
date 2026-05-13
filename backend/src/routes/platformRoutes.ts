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

export default router;
