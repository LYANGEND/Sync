"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTools = exports.executeCommand = exports.deleteConversation = exports.updateConversation = exports.getConversation = exports.getConversations = exports.createConversation = void 0;
const masterAIService_1 = require("../services/masterAIService");
const convoService = __importStar(require("../services/conversationService"));
// ==========================================
// MASTER AI OPS CONTROLLER
// ==========================================
// ChatGPT-style conversation management + command execution
// Uses shared conversationService for CRUD operations.
const CTX = 'master-ai-ops';
// ---- Conversations (delegated to conversationService) ----
const createConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const conversation = yield convoService.createConversation(userId, CTX, 'New Chat');
        res.status(201).json(conversation);
    }
    catch (error) {
        console.error('Create conversation error:', error);
        res.status(500).json({ error: 'Failed to create conversation' });
    }
});
exports.createConversation = createConversation;
const getConversations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const conversations = yield convoService.listConversations(userId, CTX);
        res.json(conversations);
    }
    catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});
exports.getConversations = getConversations;
const getConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const result = yield convoService.getConversation(req.params.id, userId, CTX);
        if (!result)
            return res.status(404).json({ error: 'Conversation not found' });
        res.json(result);
    }
    catch (error) {
        console.error('Get conversation error:', error);
        res.status(500).json({ error: 'Failed to fetch conversation' });
    }
});
exports.getConversation = getConversation;
const updateConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const updated = yield convoService.updateConversation(req.params.id, userId, req.body.title || '', CTX);
        if (!updated)
            return res.status(404).json({ error: 'Conversation not found' });
        res.json(updated);
    }
    catch (error) {
        console.error('Update conversation error:', error);
        res.status(500).json({ error: 'Failed to update conversation' });
    }
});
exports.updateConversation = updateConversation;
const deleteConversation = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const deleted = yield convoService.deleteConversation(req.params.id, userId, CTX);
        if (!deleted)
            return res.status(404).json({ error: 'Conversation not found' });
        res.json({ message: 'Conversation deleted' });
    }
    catch (error) {
        console.error('Delete conversation error:', error);
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
});
exports.deleteConversation = deleteConversation;
// ---- Execute Command (within a conversation) ----
/**
 * POST /api/v1/master-ai/execute
 * Execute a natural language command and store messages in a conversation
 */
const executeCommand = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { message, conversationId } = req.body;
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ error: 'Message is required' });
        }
        if (message.length > 2000) {
            return res.status(400).json({ error: 'Message too long (max 2000 characters)' });
        }
        // Get or create conversation (via shared service)
        const autoTitle = message.length > 60 ? message.substring(0, 57) + '...' : message;
        const { id: convoId, isNew: isNewConvo } = yield convoService.getOrCreateConversation(userId, CTX, conversationId, autoTitle);
        // Save user message
        yield convoService.saveMessage(convoId, 'user', message);
        // Load conversation history for AI context
        const previousMessages = yield convoService.getMessageHistory(convoId, 20);
        const conversationHistory = previousMessages.slice(0, -1).map((m) => ({
            role: m.role,
            content: m.content,
        }));
        // Execute via Master AI service
        const result = yield masterAIService_1.masterAIService.processCommand(message, userId, conversationHistory);
        // Build assistant content for DB storage
        let assistantContent = result.message;
        if ((_b = result.actions) === null || _b === void 0 ? void 0 : _b.length) {
            assistantContent += '\n\n---\n';
            for (const action of result.actions) {
                assistantContent += `\n${action.summary}`;
            }
        }
        // Save assistant message (shared service also touches updatedAt)
        yield convoService.saveMessage(convoId, 'assistant', assistantContent);
        res.json(Object.assign(Object.assign({}, result), { conversationId: convoId, isNewConversation: isNewConvo }));
    }
    catch (error) {
        console.error('Master AI execute error:', error);
        res.status(500).json({ error: 'Failed to process command', details: error.message });
    }
});
exports.executeCommand = executeCommand;
/**
 * GET /api/v1/master-ai/tools
 */
const getTools = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tools = masterAIService_1.masterAIService.getAvailableTools();
        res.json(tools);
    }
    catch (error) {
        console.error('Master AI tools error:', error);
        res.status(500).json({ error: 'Failed to list tools' });
    }
});
exports.getTools = getTools;
