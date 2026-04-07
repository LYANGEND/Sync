import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { aiLimiter } from '../middleware/rateLimiter';
import * as controller from '../controllers/aiParentEngagementController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Parent Engagement AI endpoints (with rate limiting)
router.post('/weekly-update', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'ADMIN']), aiLimiter, controller.generateWeeklyUpdate);
router.post('/early-warnings', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'ADMIN']), aiLimiter, controller.detectEarlyWarnings);
router.post('/interventions', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'ADMIN']), aiLimiter, controller.suggestInterventions);

export default router;
