import { Router } from 'express';
import { getPromotionCandidates, processPromotions } from '../controllers/promotionController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

// Only Admins and Teachers (maybe) should handle promotions
router.get('/candidates', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tenantHandler(getPromotionCandidates));
router.post('/process', authorizeRole(['SUPER_ADMIN']), tenantHandler(processPromotions));

export default router;
