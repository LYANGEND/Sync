-- Master AI: keep action results, suggestions and pending items so reopened chats show them
ALTER TABLE "ai_messages" ADD COLUMN "metadata" JSONB;
