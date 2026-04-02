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
  ingestContent,
  ingestionStatus,
  uploadContent,
} from '../controllers/syllabusController';
import multer from 'multer';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

const router = Router();

router.use(authenticateToken);

const teacherOrAdmin = authorizeRole(['SUPER_ADMIN', 'TEACHER']);
const superAdminOnly = authorizeRole(['SUPER_ADMIN']);

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

// Content Ingestion (SUPER_ADMIN only)
router.post('/ingest-content', superAdminOnly, ingestContent);
router.get('/ingestion-status', superAdminOnly, ingestionStatus);
router.post('/upload-content', superAdminOnly, pdfUpload.array('pdfs', 20), uploadContent);

export default router;
