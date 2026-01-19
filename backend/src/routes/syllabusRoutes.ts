import { Router } from 'express';
import {
  getTopics,
  createTopic,
  deleteTopic,
  getClassProgress,
  updateTopicProgress,
  getLessonPlans,
  createLessonPlan
} from '../controllers/syllabusController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';
import { requireActiveSubscription, requireFeature } from '../middleware/subscriptionMiddleware';
import { FEATURES } from '../services/subscriptionService';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription); // Check subscription
router.use(requireFeature(FEATURES.SYLLABUS_TRACKING)); // Require syllabus tracking feature

// Topics (Syllabus Definition)
router.get('/topics', tenantHandler(getTopics));
router.post('/topics', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tenantHandler(createTopic));
router.delete('/topics/:id', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tenantHandler(deleteTopic));

// Progress Tracking
router.get('/progress', tenantHandler(getClassProgress));
router.put('/progress/:topicId/:classId', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tenantHandler(updateTopicProgress));

// Lesson Plans
router.get('/lesson-plans', tenantHandler(getLessonPlans));
router.post('/lesson-plans', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tenantHandler(createLessonPlan));

export default router;
