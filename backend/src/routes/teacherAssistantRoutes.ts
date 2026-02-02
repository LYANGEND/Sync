import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { resolveTenant } from '../middleware/tenantMiddleware';
import { tenantHandler } from '../utils/routeTypes';
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
    saveFavoritePrompt,
    getFavoritePrompts,
    deleteFavoritePrompt,
    saveDraft,
    getDrafts,
    deleteDraft,
    publishQuizToHomework,
    generateStandardsAlignedLesson,
    generateBloomsQuestions,
    generateDifferentiatedContent,
    analyzeMisconceptions,
    generateFormativeAssessment,
    getStandards,
    searchStandards,
} from '../controllers/teacherAssistantController';

const router = Router();

// All routes require authentication and tenant context
router.use(authenticateToken);
router.use(resolveTenant);

// Chat
router.post('/chat', tenantHandler(chat));

// Generators
router.post('/lesson-plan/generate', tenantHandler(generateLessonPlan));
router.post('/quiz/generate', tenantHandler(generateQuiz));
router.post('/email/draft', tenantHandler(draftEmail));

// Conversations
router.get('/conversations', tenantHandler(getConversations));
router.get('/conversations/:id', tenantHandler(getConversation));
router.delete('/conversations/:id', tenantHandler(deleteConversation));

// Export
router.get('/conversations/:id/export/pdf', tenantHandler(exportConversationPDF));
router.get('/conversations/:id/export/word', tenantHandler(exportConversationWord));

// Templates
router.get('/templates', tenantHandler(getTemplates));
router.post('/templates', tenantHandler(saveTemplate));
router.delete('/templates/:id', tenantHandler(deleteTemplate));

// Favorite Prompts
router.get('/favorite-prompts', tenantHandler(getFavoritePrompts));
router.post('/favorite-prompts', tenantHandler(saveFavoritePrompt));
router.delete('/favorite-prompts/:id', tenantHandler(deleteFavoritePrompt));

// Drafts (Auto-save)
router.get('/drafts', tenantHandler(getDrafts));
router.post('/drafts', tenantHandler(saveDraft));
router.delete('/drafts/:id', tenantHandler(deleteDraft));

// Direct-to-Homework Integration
router.post('/quiz/:conversationId/publish-homework', tenantHandler(publishQuizToHomework));

// Academic Features
router.post('/academic/standards-aligned-lesson', tenantHandler(generateStandardsAlignedLesson));
router.post('/academic/blooms-questions', tenantHandler(generateBloomsQuestions));
router.post('/academic/differentiate', tenantHandler(generateDifferentiatedContent));
router.post('/academic/misconceptions', tenantHandler(analyzeMisconceptions));
router.post('/academic/formative-assessment', tenantHandler(generateFormativeAssessment));

// Standards Management
router.get('/standards', tenantHandler(getStandards));
router.get('/standards/search', tenantHandler(searchStandards));

// Usage & Stats
router.get('/usage/stats', tenantHandler(getUsageStats));

// Form Data
router.get('/subjects', tenantHandler(getSubjects));

export default router;
