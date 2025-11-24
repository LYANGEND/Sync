import { Router } from 'express';
import { getSettings, updateSettings } from '../controllers/settingsController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getSettings);
router.put('/', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), updateSettings);

export default router;
