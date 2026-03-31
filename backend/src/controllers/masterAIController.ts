import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { masterAIService } from '../services/masterAIService';
import * as convoService from '../services/conversationService';
import aiService from '../services/aiService';
import { streamVoiceResponse, quickSpeak, detectFarewell, detectAIFarewell } from '../services/voiceConversationService';

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
    const result = await masterAIService.processCommand(message, userId, conversationHistory, imageBase64);

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

    const audioBuffer = await quickSpeak(text);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(audioBuffer);
  } catch (error: any) {
    console.error('TTS error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate speech' });
  }
};

/**
 * POST /api/v1/master-ai/speech/stream
 * Streaming TTS — returns chunked audio responses for each sentence.
 * Uses Server-Sent Events (SSE) to push base64-encoded audio chunks.
 * This dramatically reduces time-to-first-audio compared to generating
 * the entire response as one audio file.
 */
export const streamSpeech = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let aborted = false;
    req.on('close', () => { aborted = true; });

    await streamVoiceResponse(text, {
      shouldAbort: () => aborted,
      onSentenceAudio: (audioBuffer, sentence, index, isFinal) => {
        if (aborted) return;
        res.write(`data: ${JSON.stringify({
          audio: audioBuffer.toString('base64'),
          sentence,
          index,
          isFinal,
          contentType: 'audio/mpeg',
        })}\n\n`);
      },
      onError: (error) => {
        if (aborted) return;
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      },
    });

    if (!aborted) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error('Streaming TTS error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to stream speech' });
    }
  }
};

/**
 * POST /api/v1/master-ai/voice-execute
 * Combined voice pipeline: execute command + stream TTS response.
 * Returns SSE with both the AI text response AND audio chunks,
 * so the first sentence starts playing while the rest is being generated.
 */
export const voiceExecute = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { message, conversationId } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let aborted = false;
    req.on('close', () => { aborted = true; });

    // ---- Farewell detection on user message ----
    const userFarewell = detectFarewell(message);

    // Check AI availability
    const isAvailable = await aiService.isAvailable();
    if (!isAvailable) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'AI is not configured.' })}\n\n`);
      res.end();
      return;
    }

    // Get or create conversation
    const autoTitle = message.length > 60 ? message.substring(0, 57) + '...' : message;
    const { id: convoId, isNew: isNewConvo } = await convoService.getOrCreateConversation(
      userId, CTX, conversationId, autoTitle,
    );

    // Save user message
    await convoService.saveMessage(convoId, 'user', message);

    // Load history
    const previousMessages = await convoService.getMessageHistory(convoId, 20);
    const conversationHistory = previousMessages.slice(0, -1).map((m: any) => ({
      role: m.role,
      content: m.content,
    }));

    // Execute command
    const result = await masterAIService.processCommand(message, userId, conversationHistory);

    // Build response text
    let assistantContent = result.message;
    if (result.actions?.length) {
      assistantContent += '\n\n---\n';
      for (const action of result.actions) {
        assistantContent += `\n${action.summary}`;
      }
    }

    // Save assistant message
    await convoService.saveMessage(convoId, 'assistant', assistantContent);

    if (aborted) return;

    // ---- Farewell detection on AI response ----
    const aiFarewell = detectAIFarewell(result.message);
    const shouldEndConversation = userFarewell.isFarewell || aiFarewell;

    // Send the text response immediately so frontend can show it
    res.write(`data: ${JSON.stringify({
      type: 'response',
      message: result.message,
      actions: result.actions,
      suggestions: result.suggestions,
      conversationId: convoId,
      isNewConversation: isNewConvo,
      shouldEndConversation,
    })}\n\n`);

    // Stream TTS audio sentence by sentence
    await streamVoiceResponse(result.message, {
      shouldAbort: () => aborted,
      onSentenceAudio: (audioBuffer, sentence, index, isFinal) => {
        if (aborted) return;
        res.write(`data: ${JSON.stringify({
          type: 'audio',
          audio: audioBuffer.toString('base64'),
          sentence,
          index,
          isFinal,
          contentType: 'audio/mpeg',
        })}\n\n`);
      },
      onError: (error) => {
        if (aborted) return;
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      },
    });

    if (!aborted) {
      res.write(`data: ${JSON.stringify({ type: 'done', shouldEndConversation })}\n\n`);
      res.end();
    }
  } catch (error: any) {
    console.error('Voice execute error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Failed to process voice command' });
    }
  }
};

/**
 * GET /api/v1/master-ai/voice-config
 * Returns voice configuration — available voices, whether ElevenLabs is configured, etc.
 */
export const getVoiceConfig = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Azure AI voices available through Azure OpenAI TTS
    const voices = [
      { id: 'nova', name: 'Nova (Female, warm)', provider: 'azure' },
      { id: 'alloy', name: 'Alloy (Neutral)', provider: 'azure' },
      { id: 'echo', name: 'Echo (Male)', provider: 'azure' },
      { id: 'fable', name: 'Fable (British)', provider: 'azure' },
      { id: 'onyx', name: 'Onyx (Male, deep)', provider: 'azure' },
      { id: 'shimmer', name: 'Shimmer (Female, expressive)', provider: 'azure' },
    ];

    res.json({
      provider: 'azure',
      voices,
      streamingSupported: true,
      farewellDetectionEnabled: true,
    });
  } catch (error: any) {
    console.error('Voice config error:', error);
    res.status(500).json({ error: 'Failed to get voice configuration' });
  }
};

