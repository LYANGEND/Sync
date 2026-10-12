import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { masterAIService } from '../services/masterAIService';
import * as convoService from '../services/conversationService';
import aiService from '../services/aiService';
import { detectFarewell, detectAIFarewell } from '../services/voiceConversationService';

// ==========================================
// MASTER AI OPS CONTROLLER
// ==========================================
// ChatGPT-style conversation management + command execution
// Uses shared conversationService for CRUD operations.

const CTX: convoService.ConversationContextType = 'master-ai-ops';
const CANCELLED_MESSAGE = 'Cancelled. Nothing was changed.';

/** Text stored in conversation history for an assistant reply. */
const toStoredContent = (result: { message: string; actions?: { summary: string }[]; pendingConfirmation?: { items: string[] } }) => {
  let content = result.message;
  if (result.pendingConfirmation) content += `\n\n${result.pendingConfirmation.items.map(i => `- ${i}`).join('\n')}`;
  if (result.actions?.length) content += `\n\n---\n${result.actions.map(a => `\n${a.summary}`).join('')}`;
  return content;
};

const isSpeechUnavailableError = (error: any) => {
  const message = String(error?.message || '');
  return (
    message.includes('Failed to generate speech') ||
    message.includes('Azure TTS API error') ||
    message.includes('TTS API error') ||
    message.includes('AI is not configured')
  );
};

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

    const { message, conversationId, imageBase64 } = req.body;

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
    const result = await masterAIService.processCommand(message, { userId, role: req.user!.role, conversationId: convoId }, conversationHistory, imageBase64);

    // Save assistant message (shared service also touches updatedAt)
    await convoService.saveMessage(convoId, 'assistant', toStoredContent(result));

    res.json({
      ...result,
      conversationId: convoId,
      isNewConversation: isNewConvo,
    });
  } catch (error: any) {
    console.error('Master AI execute error:', error);
    // Detect invalid/expired API key — return 503 with actionable message
    const msg: string = error.message || '';
    if (
      msg.includes('invalid_api_key') ||
      msg.includes('Incorrect API key') ||
      msg.includes('authentication') ||
      msg.includes('401')
    ) {
      return res.status(503).json({
        error: 'Your AI API key is invalid or has expired. Please update it in School Settings → AI Configuration.',
      });
    }
    res.status(500).json({ error: 'Failed to process command', details: msg });
  }
};

/**
 * POST /api/v1/master-ai/confirm
 * Run a plan that was held for confirmation (deletes, messages, announcements).
 */
export const confirmAction = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { token } = req.body;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Confirmation token is required' });

    const outcome = await masterAIService.confirmPending(token, { userId, role: req.user!.role });
    if (!outcome) {
      return res.status(410).json({ error: 'This request has expired or was already handled. Please ask again.' });
    }
    if (outcome.conversationId) {
      await convoService.saveMessage(outcome.conversationId, 'assistant', toStoredContent(outcome.response));
    }
    res.json({ ...outcome.response, conversationId: outcome.conversationId });
  } catch (error: any) {
    console.error('Master AI confirm error:', error);
    res.status(500).json({ error: 'Failed to run the confirmed request', details: error.message });
  }
};

/**
 * POST /api/v1/master-ai/cancel
 * Discard a plan that was held for confirmation.
 */
export const cancelAction = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const { token } = req.body;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Confirmation token is required' });

    const outcome = masterAIService.cancelPending(token, userId);
    if (outcome?.conversationId) await convoService.saveMessage(outcome.conversationId, 'assistant', CANCELLED_MESSAGE);
    res.json({ message: CANCELLED_MESSAGE });
  } catch (error: any) {
    console.error('Master AI cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel' });
  }
};

export const transcribeAudio = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const text = await aiService.transcribeAudio(req.file.buffer, req.file.mimetype);
    res.json({ text });
  } catch (error: any) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: error.message || 'Failed to transcribe audio' });
  }
};

export const generateSpeech = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    const audioBuffer = await aiService.generateSpeech(text);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (error: any) {
    if (isSpeechUnavailableError(error)) {
      console.warn('TTS unavailable:', error.message);
      res.setHeader('X-Sync-TTS-Status', 'unavailable');
      return res.status(204).end();
    }
    console.error('TTS error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate speech' });
  }
};

/**
 * POST /api/v1/master-ai/voice-execute-v2
 * ──────────────────────────────────────────
 * Two-phase streaming voice pipeline:
 *
 *   Phase 1 ("quick"):  AI plan ready → immediately sends plan.message
 *                        so the frontend can start TTS ("Let me check...")
 *                        while tools execute in the background.
 *   Phase 2 ("result"): Tools + summarizer done → sends the final
 *                        data-driven answer for TTS playback.
 *
 * For simple queries (no tools), only "result" fires.
 * Uses Server-Sent Events to push each phase as it becomes ready.
 */
export const voiceExecuteV2 = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { message, conversationId } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // SSE setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let aborted = false;
    req.on('close', () => { aborted = true; });

    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'AI is not configured.' })}\n\n`);
      res.end();
      return;
    }

    // Conversation management
    const autoTitle = message.length > 60 ? message.substring(0, 57) + '...' : message;
    const { id: convoId, isNew: isNewConvo } = await convoService.getOrCreateConversation(
      userId, CTX, conversationId, autoTitle,
    );
    await convoService.saveMessage(convoId, 'user', message);

    const previousMessages = await convoService.getMessageHistory(convoId, 20);
    const conversationHistory = previousMessages.slice(0, -1).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    const userFarewell = detectFarewell(message);

    // Two-phase streaming execution
    const result = await masterAIService.processCommandStreaming(
      message,
      { userId, role: req.user!.role },
      (phase, data) => {
        if (aborted) return;
        if (phase === 'quick') {
          // Filler message — frontend starts TTS immediately
          res.write(`data: ${JSON.stringify({ type: 'quick', message: data.message })}\n\n`);
        } else if (phase === 'result') {
          const aiFarewell = detectAIFarewell(data.message || '');
          const shouldEnd = userFarewell.isFarewell || aiFarewell;
          res.write(`data: ${JSON.stringify({
            type: 'result',
            message: data.message,
            actions: data.actions,
            suggestions: data.suggestions,
            conversationId: convoId,
            isNewConversation: isNewConvo,
            shouldEndConversation: shouldEnd,
          })}\n\n`);
        }
      },
      conversationHistory,
    );

    // Persist assistant message
    await convoService.saveMessage(convoId, 'assistant', toStoredContent(result));

    if (!aborted) {
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error('Voice execute V2 error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to process voice command' });
    } else {
      try {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message || 'Processing failed' })}\n\n`);
        res.end();
      } catch { /* closed */ }
    }
  }
};

