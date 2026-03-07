import { Router } from 'express';
import {
  executeCommand,
  getTools,
  createConversation,
  getConversations,
  getConversation,
  updateConversation,
  deleteConversation,
} from '../controllers/masterAIController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

// All master AI routes require authentication + SUPER_ADMIN role
router.use(authenticateToken);
router.use(authorizeRole(['SUPER_ADMIN']));

// Conversations (ChatGPT-style)
router.post('/conversations', createConversation);
router.get('/conversations', getConversations);
router.get('/conversations/:id', getConversation);
router.patch('/conversations/:id', updateConversation);
router.delete('/conversations/:id', deleteConversation);

// Execute a natural language command (within a conversation)
router.post('/execute', executeCommand);

// Get available tools
router.get('/tools', getTools);

export default router;
