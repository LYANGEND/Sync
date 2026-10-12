-- Master AI: keep plans awaiting confirmation in the database so they survive restarts and work across instances
CREATE TABLE "ai_pending_actions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "userMessage" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_pending_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_pending_actions_expiresAt_idx" ON "ai_pending_actions"("expiresAt");
