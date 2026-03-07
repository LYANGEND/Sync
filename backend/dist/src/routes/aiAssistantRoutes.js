"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiAssistantController_1 = require("../controllers/aiAssistantController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// AI Status
router.get('/status', aiAssistantController_1.getAIStatus);
// Teacher context (classes, subjects, students)
router.get('/teaching-context', aiAssistantController_1.getTeachingContext);
router.get('/student-insights', aiAssistantController_1.getStudentInsights);
// Conversations
router.get('/conversations', aiAssistantController_1.getConversations);
router.get('/conversations/:id', aiAssistantController_1.getConversation);
router.post('/conversations', aiAssistantController_1.createConversation);
router.delete('/conversations/:id', aiAssistantController_1.deleteConversation);
// Chat (with rate limiting)
router.post('/chat', rateLimiter_1.aiLimiter, aiAssistantController_1.sendMessage);
router.post('/command', rateLimiter_1.aiLimiter, aiAssistantController_1.handleSlashCommand);
// Artifacts
router.get('/artifacts', aiAssistantController_1.getArtifacts);
router.post('/artifacts', aiAssistantController_1.saveArtifact);
router.delete('/artifacts/:id', aiAssistantController_1.deleteArtifact);
router.post('/artifacts/:id/publish', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), aiAssistantController_1.publishArtifactToHomework);
// Favorite Prompts
router.get('/prompts', aiAssistantController_1.getFavoritePrompts);
router.post('/prompts', aiAssistantController_1.saveFavoritePrompt);
router.delete('/prompts/:id', aiAssistantController_1.deleteFavoritePrompt);
// AI Report Card Remarks
router.post('/report-remarks', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), rateLimiter_1.aiLimiter, aiAssistantController_1.generateReportRemarks);
exports.default = router;
