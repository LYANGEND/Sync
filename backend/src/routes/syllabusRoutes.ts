import { Router } from 'express';
import { 
  getSyllabusOverview,
  getTopics, 
  createTopic, 
  deleteTopic,
  updateTopic,
  getSubTopics,
  createSubTopic,
  updateSubTopic,
  deleteSubTopic,
  getTopicAvailability,
  getClassProgress,
  updateTopicProgress,
  getLessonPlans,
  createLessonPlan,
  updateLessonPlan,
  deleteLessonPlan,
  generateLessonPlan,
  generateQuestions,
  generateHomework,
  generateSyllabus,
  getNextTopic,
} from '../controllers/syllabusController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

const teacherOrAdmin = authorizeRole(['SUPER_ADMIN', 'TEACHER']);

// Syllabus Overview (subject-level stats)
router.get('/overview', getSyllabusOverview);

// Topics (Syllabus Definition)
router.get('/topics', getTopics);
router.post('/topics', teacherOrAdmin, createTopic);
router.put('/topics/:id', teacherOrAdmin, updateTopic);
router.delete('/topics/:id', teacherOrAdmin, deleteTopic);

// SubTopics
router.get('/subtopics', getSubTopics);
router.post('/subtopics', teacherOrAdmin, createSubTopic);
router.put('/subtopics/:id', teacherOrAdmin, updateSubTopic);
router.delete('/subtopics/:id', teacherOrAdmin, deleteSubTopic);

// Topic Availability (for AI modal - subjects with topics for a class)
router.get('/topic-availability', getTopicAvailability);

// Progress Tracking
router.get('/progress', getClassProgress);
router.put('/progress/:topicId/:classId', teacherOrAdmin, updateTopicProgress);

// Lesson Plans
router.get('/lesson-plans', getLessonPlans);
router.post('/lesson-plans', teacherOrAdmin, createLessonPlan);
router.put('/lesson-plans/:id', teacherOrAdmin, updateLessonPlan);
router.delete('/lesson-plans/:id', teacherOrAdmin, deleteLessonPlan);

// AI-Powered Lesson Plan Generation + Next Topic Suggestion
router.post('/generate-lesson-plan', teacherOrAdmin, generateLessonPlan);
router.post('/generate-questions', teacherOrAdmin, generateQuestions);
router.post('/generate-homework', teacherOrAdmin, generateHomework);
router.post('/generate-syllabus', teacherOrAdmin, generateSyllabus);
router.get('/next-topic', getNextTopic);

export default router;
