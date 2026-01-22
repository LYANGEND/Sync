import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { resolveTenant } from '../middleware/tenantMiddleware';
import {
    chat,
    generateLessonPlan,
    generateQuiz,
    draftEmail,
    getConversations,
    getConversation,
    deleteConversation,
    getTemplates,
    saveTemplate,
    deleteTemplate,
    getUsageStats,
    getSubjects,
    exportConversationPDF,
    exportConversationWord,
} from '../controllers/teacherAssistantController';

const router = Router();

// All routes require authentication and tenant context
router.use(authenticateToken);
router.use(resolveTenant);

// Chat
router.post('/chat', chat);

// Generators
router.post('/lesson-plan/generate', generateLessonPlan);
router.post('/quiz/generate', generateQuiz);
router.post('/email/draft', draftEmail);

// Conversations
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.delete('/conversations/:id', deleteConversation);

// Export
router.get('/conversations/:id/export/pdf', exportConversationPDF);
router.get('/conversations/:id/export/word', exportConversationWord);

// Templates
router.get('/templates', getTemplates);
router.post('/templates', saveTemplate);
router.delete('/templates/:id', deleteTemplate);

// Usage & Stats
router.get('/usage/stats', getUsageStats);

// Form Data
router.get('/subjects', getSubjects);

export default router;
