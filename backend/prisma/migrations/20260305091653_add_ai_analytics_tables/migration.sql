-- AlterTable (drop legacy teacherId from subjects if it exists)
ALTER TABLE "subjects" DROP COLUMN IF EXISTS "teacherId";

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT,
    "feature" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "tokensUsed" INTEGER,
    "responseTimeMs" INTEGER,
    "provider" TEXT,
    "model" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_proactive_alerts" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "actionType" TEXT,
    "actionLabel" TEXT,
    "actionPayload" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isActioned" BOOLEAN NOT NULL DEFAULT false,
    "actionedBy" TEXT,
    "actionedAt" TIMESTAMP(3),
    "isDismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedBy" TEXT,
    "expiresAt" TIMESTAMP(3),
    "generatedBy" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_proactive_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights_cache" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "cacheKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_insights_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_logs_userId_idx" ON "ai_usage_logs"("userId");
CREATE INDEX "ai_usage_logs_feature_idx" ON "ai_usage_logs"("feature");
CREATE INDEX "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");
CREATE INDEX "ai_usage_logs_branchId_idx" ON "ai_usage_logs"("branchId");

-- CreateIndex
CREATE INDEX "ai_proactive_alerts_category_idx" ON "ai_proactive_alerts"("category");
CREATE INDEX "ai_proactive_alerts_severity_idx" ON "ai_proactive_alerts"("severity");
CREATE INDEX "ai_proactive_alerts_isRead_idx" ON "ai_proactive_alerts"("isRead");
CREATE INDEX "ai_proactive_alerts_isActioned_idx" ON "ai_proactive_alerts"("isActioned");
CREATE INDEX "ai_proactive_alerts_branchId_idx" ON "ai_proactive_alerts"("branchId");
CREATE INDEX "ai_proactive_alerts_createdAt_idx" ON "ai_proactive_alerts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_insights_cache_cacheKey_key" ON "ai_insights_cache"("cacheKey");
CREATE INDEX "ai_insights_cache_cacheKey_idx" ON "ai_insights_cache"("cacheKey");
