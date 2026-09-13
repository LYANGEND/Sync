import { Router } from 'express';
import { getSettings, updateSettings, getPublicSettings, uploadLogo, deleteLogo, getDomainStatus, checkDomainStatus } from '../controllers/settingsController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { uploadSchoolLogo } from '../middleware/uploadMiddleware';
import { requirePublicTenant } from '../middleware/publicTenantContext';

const router = Router();

router.get('/public', requirePublicTenant, getPublicSettings);

router.use(authenticateToken);

router.get('/', authorizeRole(['SUPER_ADMIN']), getSettings);
router.put('/', authorizeRole(['SUPER_ADMIN']), updateSettings);
router.get('/domain-status', authorizeRole(['SUPER_ADMIN']), getDomainStatus);
router.post('/domain-status/check', authorizeRole(['SUPER_ADMIN']), checkDomainStatus);

// Logo upload routes
router.post('/logo', authorizeRole(['SUPER_ADMIN']), uploadSchoolLogo.single('logo'), uploadLogo);
router.delete('/logo', authorizeRole(['SUPER_ADMIN']), deleteLogo);

export default router;
