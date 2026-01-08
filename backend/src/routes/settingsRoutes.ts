import { Router } from 'express';
import { getSettings, updateSettings, getPublicSettings, getUsageStats } from '../controllers/settingsController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler, publicHandler } from '../utils/routeTypes';

const router = Router();

// Public route - doesn't require authentication
router.get('/public', publicHandler(getPublicSettings));
router.get('/public/:slug', publicHandler(getPublicSettings));

router.use(authenticateToken);

router.get('/', tenantHandler(getSettings));
router.put('/', authorizeRole(['SUPER_ADMIN']), tenantHandler(updateSettings));
router.get('/usage', authorizeRole(['SUPER_ADMIN']), tenantHandler(getUsageStats));

export default router;
