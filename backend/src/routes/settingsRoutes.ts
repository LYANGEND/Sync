import { Router } from 'express';
import { getSettings, updateSettings, getPublicSettings, uploadLogo, deleteLogo } from '../controllers/settingsController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { uploadSchoolLogo } from '../middleware/uploadMiddleware';

const router = Router();

router.get('/public', getPublicSettings);

router.use(authenticateToken);

router.get('/', getSettings);
router.put('/', authorizeRole(['SUPER_ADMIN']), updateSettings);

// Logo upload routes
router.post('/logo', authorizeRole(['SUPER_ADMIN']), uploadSchoolLogo.single('logo'), uploadLogo);
router.delete('/logo', authorizeRole(['SUPER_ADMIN']), deleteLogo);

export default router;
