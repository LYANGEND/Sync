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

import { prisma } from '../utils/prisma';

export type ConversationContextType =
  | 'teaching-assistant'
  | 'master-ai-ops'
  | 'financial-advisor';

// ------------------------------------------------------------------
// CREATE
// ------------------------------------------------------------------
export async function createConversation(
  userId: string,
  contextType: ConversationContextType,
  title = 'New Conversation',
  extraContext: Record<string, unknown> = {},
) {
  return prisma.aIConversation.create({
    data: {
      userId,
      title,
      context: { ...extraContext, type: contextType },
    },
  });
}

// ------------------------------------------------------------------
// LIST — returns most-recent-first, includes message/artifact counts
// ------------------------------------------------------------------
export async function listConversations(
  userId: string,
  contextType: ConversationContextType,
  limit = 50,
) {
  return prisma.aIConversation.findMany({
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
}

/**
 * LIST (exclude type) — used by the teaching-assistant which shows
 * everything *except* financial-advisor conversations.
 */
export async function listConversationsExcluding(
  userId: string,
  excludeType: ConversationContextType,
) {
  return prisma.aIConversation.findMany({
    where: {
      userId,
      NOT: { context: { path: ['type'], equals: excludeType } },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { messages: true, artifacts: true } },
    },
  });
}

// ------------------------------------------------------------------
// GET ONE — returns conversation + messages
// ------------------------------------------------------------------
export async function getConversation(
  id: string,
  userId: string,
  contextType?: ConversationContextType,
) {
  const where: any = { id, userId };
  if (contextType) {
    where.context = { path: ['type'], equals: contextType };
  }

  const conversation = await prisma.aIConversation.findFirst({
    where,
    include: { _count: { select: { messages: true, artifacts: true } } },
  });

  if (!conversation) return null;

  const messages = await prisma.aIMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: 'asc' },
  });

  return { conversation, messages };
}

// ------------------------------------------------------------------
// UPDATE (rename)
// ------------------------------------------------------------------
export async function updateConversation(
  id: string,
  userId: string,
  title: string,
  contextType?: ConversationContextType,
) {
  const where: any = { id, userId };
  if (contextType) {
    where.context = { path: ['type'], equals: contextType };
  }

  const existing = await prisma.aIConversation.findFirst({ where });
  if (!existing) return null;

  return prisma.aIConversation.update({
    where: { id },
    data: { title: title.trim() || existing.title },
  });
}

// ------------------------------------------------------------------
// DELETE
// ------------------------------------------------------------------
export async function deleteConversation(
  id: string,
  userId: string,
  contextType?: ConversationContextType,
) {
  const where: any = { id, userId };
  if (contextType) {
    where.context = { path: ['type'], equals: contextType };
  }

  const existing = await prisma.aIConversation.findFirst({ where });
  if (!existing) return false;

  await prisma.aIConversation.delete({ where: { id } });
  return true;
}

// ------------------------------------------------------------------
// HELPERS — used by the chat handlers
// ------------------------------------------------------------------

/**
 * Get or create a conversation, returning its ID.
 * Used by the execute/chat endpoints that accept an optional conversationId.
 */
export async function getOrCreateConversation(
  userId: string,
  contextType: ConversationContextType,
  conversationId?: string | null,
  autoTitle?: string,
) {
  if (conversationId) {
    const existing = await prisma.aIConversation.findFirst({
      where: { id: conversationId, userId, context: { path: ['type'], equals: contextType } },
    });
    if (existing) return { id: existing.id, isNew: false };
  }

  const convo = await createConversation(
    userId,
    contextType,
    autoTitle || 'New Conversation',
  );
  return { id: convo.id, isNew: true };
}

/**
 * Save a message and touch the conversation's updatedAt.
 */
export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  tokenCount?: number,
) {
  const msg = await prisma.aIMessage.create({
    data: { conversationId, role, content, tokenCount },
  });

  await prisma.aIConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return msg;
}

/**
 * Load conversation history for context window (most recent N messages).
 */
export async function getMessageHistory(
  conversationId: string,
  limit = 20,
) {
  return prisma.aIMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });
}
