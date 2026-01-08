import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboardController';
import { authenticateToken } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

router.get('/stats', tenantHandler(getDashboardStats));

export default router;
