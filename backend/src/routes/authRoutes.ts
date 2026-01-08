import { Router } from 'express';
import { login, register, getTenantBySlug, me } from '../controllers/authController';
import { authenticateToken } from '../middleware/authMiddleware';
import { tenantHandler, publicHandler } from '../utils/routeTypes';

const router = Router();

// Public routes
router.post('/login', publicHandler(login));
router.post('/register', publicHandler(register));
router.get('/tenant/:slug', publicHandler(getTenantBySlug));

// Protected routes
router.get('/me', authenticateToken, tenantHandler(me));

export default router;
