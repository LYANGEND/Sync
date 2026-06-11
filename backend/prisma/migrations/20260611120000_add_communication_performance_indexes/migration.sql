-- Communication hot-path indexes for faster notifications, chats, and templates
CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");

CREATE INDEX IF NOT EXISTS "conversation_participants_userId_idx" ON "conversation_participants"("userId");

CREATE INDEX IF NOT EXISTS "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");
CREATE INDEX IF NOT EXISTS "messages_conversationId_isRead_senderId_idx" ON "messages"("conversationId", "isRead", "senderId");

CREATE INDEX IF NOT EXISTS "conversations_updatedAt_idx" ON "conversations"("updatedAt");

CREATE INDEX IF NOT EXISTS "message_templates_category_channel_updatedAt_idx" ON "message_templates"("category", "channel", "updatedAt");
