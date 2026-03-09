import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { masterAIService } from '../services/masterAIService';
import * as convoService from '../services/conversationService';
import aiService from '../services/aiService';

// ==========================================
// MASTER AI OPS CONTROLLER
// ==========================================
// ChatGPT-style conversation management + command execution
// Uses shared conversationService for CRUD operations.

const CTX: convoService.ConversationContextType = 'master-ai-ops';

// ---- Conversations (delegated to conversationService) ----

export const createConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversation = await convoService.createConversation(userId, CTX, 'New Chat');
    res.status(201).json(conversation);
  } catch (error: any) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Failed to create conversation' });
  }
};

export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const conversations = await convoService.listConversations(userId, CTX);
    res.json(conversations);
  } catch (error: any) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
};

export const getConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const result = await convoService.getConversation(req.params.id, userId, CTX);
    if (!result) return res.status(404).json({ error: 'Conversation not found' });
    res.json(result);
  } catch (error: any) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
};

export const updateConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const updated = await convoService.updateConversation(req.params.id, userId, req.body.title || '', CTX);
    if (!updated) return res.status(404).json({ error: 'Conversation not found' });
    res.json(updated);
  } catch (error: any) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
};

export const deleteConversation = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const deleted = await convoService.deleteConversation(req.params.id, userId, CTX);
    if (!deleted) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ message: 'Conversation deleted' });
  } catch (error: any) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
};

// ---- Execute Command (within a conversation) ----

/**
 * POST /api/v1/master-ai/execute
 * Execute a natural language command and store messages in a conversation
 */
export const executeCommand = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { message, conversationId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
    }

    // Check AI availability before doing anything
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      return res.status(503).json({
        error: 'AI is not configured. Please set up AI in School Settings (Settings → AI Configuration).',
      });
    }

    // Get or create conversation (via shared service)
    const autoTitle = message.length > 60 ? message.substring(0, 57) + '...' : message;
    const { id: convoId, isNew: isNewConvo } = await convoService.getOrCreateConversation(
      userId, CTX, conversationId, autoTitle,
    );

    // Save user message
    await convoService.saveMessage(convoId, 'user', message);

    // Load conversation history for AI context
    const previousMessages = await convoService.getMessageHistory(convoId, 20);
    const conversationHistory = previousMessages.slice(0, -1).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // Execute via Master AI service
    const result = await masterAIService.processCommand(message, userId, conversationHistory);

    // Build assistant content for DB storage
    let assistantContent = result.message;
    if (result.actions?.length) {
      assistantContent += '\n\n---\n';
      for (const action of result.actions) {
        assistantContent += `\n${action.summary}`;
      }
    }

    // Save assistant message (shared service also touches updatedAt)
    await convoService.saveMessage(convoId, 'assistant', assistantContent);

    res.json({
      ...result,
      conversationId: convoId,
      isNewConversation: isNewConvo,
    });
  } catch (error: any) {
    console.error('Master AI execute error:', error);
    res.status(500).json({ error: 'Failed to process command', details: error.message });
  }
};

/**
 * GET /api/v1/master-ai/tools
 */
export const getTools = async (_req: AuthRequest, res: Response) => {
  try {
    const tools = masterAIService.getAvailableTools();
    res.json(tools);
  } catch (error: any) {
    console.error('Master AI tools error:', error);
    res.status(500).json({ error: 'Failed to list tools' });
  }
};
