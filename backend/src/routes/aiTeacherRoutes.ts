import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { resolveTenant } from '../middleware/tenantMiddleware';
import {
  sendMessage,
  getConversations,
  getConversation,
  deleteConversation,
  getUsageStats,
  getSubjects,
  getTopicsBySubject,
  getRelatedVideoLessons,
  getRelatedHomework,
  getRelatedAssessments,
} from '../controllers/aiTeacherController';

const router = Router();

// All routes require authentication and tenant context
router.use(authenticateToken);
router.use(resolveTenant);

// Send a message to AI Teacher
router.post('/chat', sendMessage);

// Get all conversations
router.get('/conversations', getConversations);

// Get single conversation with messages
router.get('/conversations/:conversationId', getConversation);

// Delete a conversation
router.delete('/conversations/:conversationId', deleteConversation);

// Get usage stats
router.get('/usage', getUsageStats);

// Get available subjects for tutoring context
router.get('/subjects', getSubjects);

// Get topics for a specific subject
router.get('/subjects/:subjectId/topics', getTopicsBySubject);

// Get related content for learning
router.get('/related/video-lessons', getRelatedVideoLessons);
router.get('/related/video-lessons/:subjectId', getRelatedVideoLessons);
router.get('/related/homework', getRelatedHomework);
router.get('/related/homework/:subjectId', getRelatedHomework);
router.get('/related/assessments', getRelatedAssessments);
router.get('/related/assessments/:subjectId', getRelatedAssessments);

export default router;
