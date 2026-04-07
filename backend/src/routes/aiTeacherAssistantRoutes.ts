import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { aiLimiter } from '../middleware/rateLimiter';
import * as controller from '../controllers/aiTeacherAssistantController';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Teacher Assistant AI endpoints (with rate limiting)
router.post('/lesson-plan', authorizeRole(['SUPER_ADMIN', 'TEACHER']), aiLimiter, controller.generateLessonPlan);
router.post('/resources', authorizeRole(['SUPER_ADMIN', 'TEACHER']), aiLimiter, controller.recommendResources);
router.post('/assessment', authorizeRole(['SUPER_ADMIN', 'TEACHER']), aiLimiter, controller.generateAssessment);

export default router;
