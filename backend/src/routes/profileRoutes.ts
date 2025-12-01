import { Router } from 'express';
import { getProfile, updateProfilePicture, changePassword } from '../controllers/profileController';
import { authenticateToken } from '../middleware/authMiddleware';
import { uploadProfilePicture } from '../middleware/uploadMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getProfile);
router.post('/picture', uploadProfilePicture.single('image'), updateProfilePicture);
router.post('/password', changePassword);

export default router;
