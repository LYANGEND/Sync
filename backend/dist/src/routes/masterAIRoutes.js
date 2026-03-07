"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const masterAIController_1 = require("../controllers/masterAIController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// All master AI routes require authentication + SUPER_ADMIN role
router.use(authMiddleware_1.authenticateToken);
router.use((0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']));
// Conversations (ChatGPT-style)
router.post('/conversations', masterAIController_1.createConversation);
router.get('/conversations', masterAIController_1.getConversations);
router.get('/conversations/:id', masterAIController_1.getConversation);
router.patch('/conversations/:id', masterAIController_1.updateConversation);
router.delete('/conversations/:id', masterAIController_1.deleteConversation);
// Execute a natural language command (within a conversation)
router.post('/execute', masterAIController_1.executeCommand);
// Get available tools
router.get('/tools', masterAIController_1.getTools);
exports.default = router;
