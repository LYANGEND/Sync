import { Router } from 'express';
import { authenticatePlatformUser, authorizePlatformRole } from '../middleware/platformMiddleware';
import {
    platformLogin,
    getDashboardStats,
    getAllTenants,
    getTenantDetails,
    updateTenantSubscription,
    suspendTenant,
    activateTenant,
    getAllPayments,
    confirmPayment,
    rejectPayment,
    createPlatformUser,
    getPlatformUsers,
    getPlatformSettings,
    updatePlatformSettings,
    updateTenantSmsConfig,
    getAllTenantsSmsConfig,
    addSmsCredits,
} from '../controllers/platformAdminController';

const router = Router();

// Public route - login
router.post('/auth/login', platformLogin);

// All routes below require platform authentication
router.use(authenticatePlatformUser);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Tenant management
router.get('/tenants', getAllTenants);
router.get('/tenants/:tenantId', getTenantDetails);
router.put('/tenants/:tenantId/subscription', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), updateTenantSubscription);
router.post('/tenants/:tenantId/suspend', authorizePlatformRole(['PLATFORM_SUPERADMIN']), suspendTenant);
router.post('/tenants/:tenantId/activate', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), activateTenant);

// Payment management
router.get('/payments', getAllPayments);
router.post('/payments/:paymentId/confirm', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), confirmPayment);
router.post('/payments/:paymentId/reject', authorizePlatformRole(['PLATFORM_SUPERADMIN']), rejectPayment);

// Platform user management (superadmin only)
router.get('/users', authorizePlatformRole(['PLATFORM_SUPERADMIN']), getPlatformUsers);
router.post('/users', authorizePlatformRole(['PLATFORM_SUPERADMIN']), createPlatformUser);

// Platform settings (SMS, Email configuration)
router.get('/settings', getPlatformSettings);
router.put('/settings', authorizePlatformRole(['PLATFORM_SUPERADMIN']), updatePlatformSettings);

// SMS Configuration per tenant
router.get('/sms/tenants', getAllTenantsSmsConfig);
router.put('/sms/tenants/:tenantId', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), updateTenantSmsConfig);
router.post('/sms/credits', authorizePlatformRole(['PLATFORM_SUPERADMIN']), addSmsCredits);

export default router;

