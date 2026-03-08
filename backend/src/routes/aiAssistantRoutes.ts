import { Router } from 'express';
import {
  createConversation,
  getConversations,
  getConversation,
  deleteConversation,
  sendMessage,
  handleSlashCommand,
  saveArtifact,
  getArtifacts,
  deleteArtifact,
  publishArtifactToHomework,
  getFavoritePrompts,
  saveFavoritePrompt,
  deleteFavoritePrompt,
  getAIStatus,
  generateReportRemarks,
  getTeachingContext,
  getStudentInsights,
  getSubjectsContext,
} from '../controllers/aiAssistantController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateToken);

// AI Status
router.get('/status', getAIStatus);

// Teacher context (classes, subjects, students)
router.get('/teaching-context', getTeachingContext);
router.get('/student-insights', getStudentInsights);
router.get('/subjects', getSubjectsContext);

// Conversations
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.post('/conversations', createConversation);
router.delete('/conversations/:id', deleteConversation);

// Chat (with rate limiting)
router.post('/chat', aiLimiter, sendMessage);
router.post('/command', aiLimiter, handleSlashCommand);

// Artifacts
router.get('/artifacts', getArtifacts);
router.post('/artifacts', saveArtifact);
router.delete('/artifacts/:id', deleteArtifact);
router.post('/artifacts/:id/publish', authorizeRole(['SUPER_ADMIN', 'TEACHER']), publishArtifactToHomework);

// Favorite Prompts
router.get('/prompts', getFavoritePrompts);
router.post('/prompts', saveFavoritePrompt);
router.delete('/prompts/:id', deleteFavoritePrompt);

// AI Report Card Remarks
router.post('/report-remarks', authorizeRole(['SUPER_ADMIN', 'TEACHER']), aiLimiter, generateReportRemarks);

export default router;
