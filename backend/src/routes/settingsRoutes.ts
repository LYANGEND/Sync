import { Router } from 'express';
import { getSettings, updateSettings, getPublicSettings } from '../controllers/settingsController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.get('/public', getPublicSettings);

router.use(authenticateToken);

router.get('/', getSettings);
router.put('/', authorizeRole(['SUPER_ADMIN']), updateSettings);

export default router;
