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

const router = Router();

router.use(authenticateToken);

// Topics (Syllabus Definition)
router.get('/topics', getTopics);
router.post('/topics', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']), createTopic);
router.delete('/topics/:id', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']), deleteTopic);

// Progress Tracking
router.get('/progress', getClassProgress);
router.put('/progress/:topicId/:classId', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']), updateTopicProgress);

// Lesson Plans
router.get('/lesson-plans', getLessonPlans);
router.post('/lesson-plans', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']), createLessonPlan);

export default router;
