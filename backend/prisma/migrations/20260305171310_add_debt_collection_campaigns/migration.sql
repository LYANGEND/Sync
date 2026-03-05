-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DebtorSegment" AS ENUM ('WILL_PAY', 'NEEDS_NUDGE', 'AT_RISK', 'HARDSHIP');

-- AlterTable
ALTER TABLE "school_settings" ADD COLUMN     "aiPersonalizedMessages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "debtCollectionEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "debtCollectionMinAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "escalationDay1Channel" TEXT NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "escalationDay1Days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "escalationDay2Channel" TEXT NOT NULL DEFAULT 'SMS',
ADD COLUMN     "escalationDay2Days" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN     "escalationDay3Channel" TEXT NOT NULL DEFAULT 'WHATSAPP',
ADD COLUMN     "escalationDay3Days" INTEGER NOT NULL DEFAULT 21,
ADD COLUMN     "escalationDay4Channel" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "escalationDay4Days" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "debt_collection_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "minAmountOwed" DECIMAL(10,2),
    "minDaysOverdue" INTEGER,
    "targetSegments" TEXT[],
    "targetGradeLevels" INTEGER[],
    "totalTargeted" INTEGER NOT NULL DEFAULT 0,
    "totalContacted" INTEGER NOT NULL DEFAULT 0,
    "totalResponded" INTEGER NOT NULL DEFAULT 0,
    "amountCollected" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_collection_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_messages" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "parentName" TEXT,
    "parentEmail" TEXT,
    "parentPhone" TEXT,
    "channel" TEXT NOT NULL,
    "escalationLevel" INTEGER NOT NULL DEFAULT 1,
    "subject" TEXT,
    "messageContent" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "amountOwed" DECIMAL(10,2) NOT NULL,
    "daysOverdue" INTEGER NOT NULL,
    "segment" TEXT NOT NULL,
    "paymentLikelihood" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "paidAmount" DECIMAL(10,2),
    "paidAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debt_collection_campaigns_status_idx" ON "debt_collection_campaigns"("status");

-- CreateIndex
CREATE INDEX "debt_collection_campaigns_createdById_idx" ON "debt_collection_campaigns"("createdById");

-- CreateIndex
CREATE INDEX "campaign_messages_campaignId_idx" ON "campaign_messages"("campaignId");

-- CreateIndex
CREATE INDEX "campaign_messages_studentId_idx" ON "campaign_messages"("studentId");

-- CreateIndex
CREATE INDEX "campaign_messages_status_idx" ON "campaign_messages"("status");

-- CreateIndex
CREATE INDEX "campaign_messages_sentAt_idx" ON "campaign_messages"("sentAt");

-- AddForeignKey
ALTER TABLE "debt_collection_campaigns" ADD CONSTRAINT "debt_collection_campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_messages" ADD CONSTRAINT "campaign_messages_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "debt_collection_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
