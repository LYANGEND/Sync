CREATE INDEX "messages_tenantId_conversationId_isRead_senderId_idx"
ON "messages" ("tenantId", "conversationId", "isRead", "senderId");