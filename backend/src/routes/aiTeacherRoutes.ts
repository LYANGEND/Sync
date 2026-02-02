import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { resolveTenant } from '../middleware/tenantMiddleware';
import { tenantHandler } from '../utils/routeTypes';
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
router.post('/chat', tenantHandler(sendMessage));

// Get all conversations
router.get('/conversations', tenantHandler(getConversations));

// Get single conversation with messages
router.get('/conversations/:conversationId', tenantHandler(getConversation));

// Delete a conversation
router.delete('/conversations/:conversationId', tenantHandler(deleteConversation));

// Get usage stats
router.get('/usage', tenantHandler(getUsageStats));

// Get available subjects for tutoring context
router.get('/subjects', tenantHandler(getSubjects));

// Get topics for a specific subject
router.get('/subjects/:subjectId/topics', tenantHandler(getTopicsBySubject));

// Get related content for learning
router.get('/related/video-lessons', tenantHandler(getRelatedVideoLessons));
router.get('/related/video-lessons/:subjectId', tenantHandler(getRelatedVideoLessons));
router.get('/related/homework', tenantHandler(getRelatedHomework));
router.get('/related/homework/:subjectId', tenantHandler(getRelatedHomework));
router.get('/related/assessments', tenantHandler(getRelatedAssessments));
router.get('/related/assessments/:subjectId', tenantHandler(getRelatedAssessments));

export default router;
