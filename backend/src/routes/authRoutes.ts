import { Router } from 'express';
import { login, register } from '../controllers/authController';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.post('/login', authLimiter, login);
router.post('/register', authenticateToken, authorizeRole(['SUPER_ADMIN']), authLimiter, register);

export default router;
