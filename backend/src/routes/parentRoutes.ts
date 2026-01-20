import { Router } from 'express';
import { getParentChildren } from '../controllers/parentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';
import { requireActiveSubscription } from '../middleware/subscriptionMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

// Parent routes
router.get('/children', authorizeRole(['PARENT', 'SUPER_ADMIN']), tenantHandler(getParentChildren));

export default router;
