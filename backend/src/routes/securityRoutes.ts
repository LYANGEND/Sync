import express from 'express';
import {
    getSecurityDashboard,
    getSecurityEvents,
    getLockedAccounts,
    unlockAccount,
    getDataExportRequests,
    createDataExportRequest,
    processDataExport,
    getDataDeletionRequests,
    updateDeletionRequest,
    getRetentionPolicies,
    upsertRetentionPolicy,
    getBackupLogs,
    triggerBackup,
} from '../controllers/securityController';
import { authenticatePlatformUser } from '../middleware/platformMiddleware';

const router = express.Router();

// All routes require platform authentication
router.use(authenticatePlatformUser);

// Security Dashboard
router.get('/dashboard', getSecurityDashboard);
router.get('/events', getSecurityEvents);
router.get('/locked-accounts', getLockedAccounts);
router.post('/locked-accounts/:lockId/unlock', unlockAccount);

// Data Export (GDPR)
router.get('/data-exports', getDataExportRequests);
router.post('/data-exports', createDataExportRequest);
router.post('/data-exports/:requestId/process', processDataExport);

// Data Deletion (GDPR)
router.get('/data-deletions', getDataDeletionRequests);
router.patch('/data-deletions/:requestId', updateDeletionRequest);

// Data Retention
router.get('/retention-policies', getRetentionPolicies);
router.post('/retention-policies', upsertRetentionPolicy);

// Backups
router.get('/backups', getBackupLogs);
router.post('/backups/trigger', triggerBackup);

export default router;
