"use strict";
/**
 * Unified AI Conversation Service
 * ================================
 * Single source of truth for conversation CRUD across all AI modules:
 *   - teaching-assistant  (AI Teaching Assistant)
 *   - master-ai-ops       (Master AI Ops)
 *   - financial-advisor    (AI Financial Advisor)
 *
 * Eliminates ~450 lines of duplicated Prisma queries that were
 * previously copy-pasted across aiAssistantController, masterAIController,
 * and aiFinancialController.
 */
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
exports.createConversation = createConversation;
exports.listConversations = listConversations;
exports.listConversationsExcluding = listConversationsExcluding;
exports.getConversation = getConversation;
exports.updateConversation = updateConversation;
exports.deleteConversation = deleteConversation;
exports.getOrCreateConversation = getOrCreateConversation;
exports.saveMessage = saveMessage;
exports.getMessageHistory = getMessageHistory;
const prisma_1 = require("../utils/prisma");
// ------------------------------------------------------------------
// CREATE
// ------------------------------------------------------------------
function createConversation(userId_1, contextType_1) {
    return __awaiter(this, arguments, void 0, function* (userId, contextType, title = 'New Conversation', extraContext = {}) {
        return prisma_1.prisma.aIConversation.create({
            data: {
                userId,
                title,
                context: Object.assign(Object.assign({}, extraContext), { type: contextType }),
            },
        });
    });
}
// ------------------------------------------------------------------
// LIST — returns most-recent-first, includes message/artifact counts
// ------------------------------------------------------------------
function listConversations(userId_1, contextType_1) {
    return __awaiter(this, arguments, void 0, function* (userId, contextType, limit = 50) {
        return prisma_1.prisma.aIConversation.findMany({
            where: {
                userId,
                context: { path: ['type'], equals: contextType },
            },
            orderBy: { updatedAt: 'desc' },
            include: {
                _count: { select: { messages: true, artifacts: true } },
            },
            take: limit,
        });
    });
}
/**
 * LIST (exclude type) — used by the teaching-assistant which shows
 * everything *except* financial-advisor conversations.
 */
function listConversationsExcluding(userId, excludeType) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma_1.prisma.aIConversation.findMany({
            where: {
                userId,
                NOT: { context: { path: ['type'], equals: excludeType } },
            },
            orderBy: { updatedAt: 'desc' },
            include: {
                _count: { select: { messages: true, artifacts: true } },
            },
        });
    });
}
// ------------------------------------------------------------------
// GET ONE — returns conversation + messages
// ------------------------------------------------------------------
function getConversation(id, userId, contextType) {
    return __awaiter(this, void 0, void 0, function* () {
        const where = { id, userId };
        if (contextType) {
            where.context = { path: ['type'], equals: contextType };
        }
        const conversation = yield prisma_1.prisma.aIConversation.findFirst({
            where,
            include: { _count: { select: { messages: true, artifacts: true } } },
        });
        if (!conversation)
            return null;
        const messages = yield prisma_1.prisma.aIMessage.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'asc' },
        });
        return { conversation, messages };
    });
}
// ------------------------------------------------------------------
// UPDATE (rename)
// ------------------------------------------------------------------
function updateConversation(id, userId, title, contextType) {
    return __awaiter(this, void 0, void 0, function* () {
        const where = { id, userId };
        if (contextType) {
            where.context = { path: ['type'], equals: contextType };
        }
        const existing = yield prisma_1.prisma.aIConversation.findFirst({ where });
        if (!existing)
            return null;
        return prisma_1.prisma.aIConversation.update({
            where: { id },
            data: { title: title.trim() || existing.title },
        });
    });
}
// ------------------------------------------------------------------
// DELETE
// ------------------------------------------------------------------
function deleteConversation(id, userId, contextType) {
    return __awaiter(this, void 0, void 0, function* () {
        const where = { id, userId };
        if (contextType) {
            where.context = { path: ['type'], equals: contextType };
        }
        const existing = yield prisma_1.prisma.aIConversation.findFirst({ where });
        if (!existing)
            return false;
        yield prisma_1.prisma.aIConversation.delete({ where: { id } });
        return true;
    });
}
// ------------------------------------------------------------------
// HELPERS — used by the chat handlers
// ------------------------------------------------------------------
/**
 * Get or create a conversation, returning its ID.
 * Used by the execute/chat endpoints that accept an optional conversationId.
 */
function getOrCreateConversation(userId, contextType, conversationId, autoTitle) {
    return __awaiter(this, void 0, void 0, function* () {
        if (conversationId) {
            const existing = yield prisma_1.prisma.aIConversation.findFirst({
                where: { id: conversationId, userId, context: { path: ['type'], equals: contextType } },
            });
            if (existing)
                return { id: existing.id, isNew: false };
        }
        const convo = yield createConversation(userId, contextType, autoTitle || 'New Conversation');
        return { id: convo.id, isNew: true };
    });
}
/**
 * Save a message and touch the conversation's updatedAt.
 */
function saveMessage(conversationId, role, content, tokenCount) {
    return __awaiter(this, void 0, void 0, function* () {
        const msg = yield prisma_1.prisma.aIMessage.create({
            data: { conversationId, role, content, tokenCount },
        });
        yield prisma_1.prisma.aIConversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
        });
        return msg;
    });
}
/**
 * Load conversation history for context window (most recent N messages).
 */
function getMessageHistory(conversationId_1) {
    return __awaiter(this, arguments, void 0, function* (conversationId, limit = 20) {
        return prisma_1.prisma.aIMessage.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            take: limit,
        });
    });
}
