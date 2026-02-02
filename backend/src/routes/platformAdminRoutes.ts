import { Router } from 'express';
import { authenticatePlatformUser, authorizePlatformRole } from '../middleware/platformMiddleware';
import {
    platformLogin,
    getDashboardStats,
    getAllTenants,
    getTenantDetails,
    createTenant,
    updateTenant,
    updateTenantSubscription,
    suspendTenant,
    activateTenant,
    getAllPayments,
    confirmPayment,
    rejectPayment,
    getAllSchoolTransactions,
    getFinanceAnalytics,
    createPlatformUser,
    getPlatformUsers,
    getPlatformSettings,
    updatePlatformSettings,
    updateTenantSmsConfig,
    getAllTenantsSmsConfig,
    addSmsCredits,
    getAllPlans,
    createPlan,
    updatePlan,
    togglePlanStatus,
    getPlatformProfile,
    createAnnouncement,
    getAllAnnouncements,
    deleteAnnouncement,
    toggleAnnouncementStatus,
    sendBulkEmailToSchools,
    sendBulkSMSToSchools,
    sendBulkNotificationToSchools,
    getCommunicationHistory,
    getCommunicationStats,
    scheduleAnnouncement,
    sendTargetedMessage,
    getMessageTemplates,
    exportTenants,
    exportSubscriptionPayments,
    exportSchoolTransactions,
    sendBulkEmail,
    generateInvoice,
} from '../controllers/platformAdminController';

const router = Router();

// Public route - login
router.post('/auth/login', platformLogin);

// All routes below require platform authentication
router.use(authenticatePlatformUser);

// Profile
router.get('/auth/me', getPlatformProfile);

// Dashboard
router.get('/dashboard', getDashboardStats);

// Tenant management
router.get('/tenants', getAllTenants);
router.post('/tenants', authorizePlatformRole(['PLATFORM_SUPERADMIN']), createTenant);  // SUPERADMIN ONLY - Create new schools
router.put('/tenants/:tenantId', authorizePlatformRole(['PLATFORM_SUPERADMIN']), updateTenant); // Update tenant details
router.get('/tenants/:tenantId', getTenantDetails);
router.put('/tenants/:tenantId/subscription', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), updateTenantSubscription);
router.post('/tenants/:tenantId/suspend', authorizePlatformRole(['PLATFORM_SUPERADMIN']), suspendTenant);
router.post('/tenants/:tenantId/activate', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), activateTenant);

// Payment management
router.get('/payments', getAllPayments);
router.get('/payments/school-transactions', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), getAllSchoolTransactions);
router.get('/payments/finance-analytics', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), getFinanceAnalytics);
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

// Subscription Plan Management
router.get('/plans', getAllPlans);
router.post('/plans', authorizePlatformRole(['PLATFORM_SUPERADMIN']), createPlan);
router.put('/plans/:planId', authorizePlatformRole(['PLATFORM_SUPERADMIN']), updatePlan);
router.patch('/plans/:planId/status', authorizePlatformRole(['PLATFORM_SUPERADMIN']), togglePlanStatus);

// Announcements
router.get('/announcements', getAllAnnouncements);
router.post('/announcements', authorizePlatformRole(['PLATFORM_SUPERADMIN']), createAnnouncement);
router.delete('/announcements/:id', authorizePlatformRole(['PLATFORM_SUPERADMIN']), deleteAnnouncement);
router.patch('/announcements/:id/status', authorizePlatformRole(['PLATFORM_SUPERADMIN']), toggleAnnouncementStatus);

// Communication Center
router.post('/communication/bulk-email', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SUPPORT']), sendBulkEmailToSchools);
router.post('/communication/bulk-sms', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SUPPORT']), sendBulkSMSToSchools);
router.post('/communication/bulk-notification', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SUPPORT']), sendBulkNotificationToSchools);
router.post('/communication/targeted-message', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SUPPORT']), sendTargetedMessage);
router.post('/communication/schedule-announcement', authorizePlatformRole(['PLATFORM_SUPERADMIN']), scheduleAnnouncement);
router.get('/communication/history', getCommunicationHistory);
router.get('/communication/stats', getCommunicationStats);
router.get('/communication/templates', getMessageTemplates);

// Export Reports
router.get('/export/tenants', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), exportTenants);
router.get('/export/subscription-payments', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), exportSubscriptionPayments);
router.get('/export/school-transactions', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), exportSchoolTransactions);

// Bulk Operations
router.post('/bulk/email', authorizePlatformRole(['PLATFORM_SUPERADMIN']), sendBulkEmail);

// Invoice Generation
router.get('/invoices/:paymentId/pdf', authorizePlatformRole(['PLATFORM_SUPERADMIN', 'PLATFORM_SALES']), generateInvoice);

export default router;

