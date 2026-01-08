-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'REFERRAL', 'COLD_CALL', 'SOCIAL_MEDIA', 'TRADE_SHOW', 'EMAIL_CAMPAIGN', 'PARTNER', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'NOTE', 'DEMO', 'FOLLOW_UP', 'PROPOSAL_SENT');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "schoolType" TEXT,
    "website" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactRole" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Zambia',
    "address" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "source" "LeadSource" NOT NULL DEFAULT 'WEBSITE',
    "estimatedStudents" INTEGER,
    "estimatedValue" DECIMAL(12,2),
    "interestedTier" "SubscriptionTier",
    "assignedToId" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "notes" TEXT,
    "convertedToTenantId" TEXT,
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_deals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "stage" TEXT NOT NULL DEFAULT 'prospecting',
    "probability" INTEGER NOT NULL DEFAULT 10,
    "leadId" TEXT NOT NULL,
    "proposedTier" "SubscriptionTier" NOT NULL,
    "proposedBillingCycle" TEXT NOT NULL DEFAULT 'ANNUAL',
    "expectedCloseDate" TIMESTAMP(3),
    "actualCloseDate" TIMESTAMP(3),
    "ownerId" TEXT,
    "wonReason" TEXT,
    "lostReason" TEXT,
    "competitorName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "leadId" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "activityDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "durationMinutes" INTEGER,
    "callOutcome" TEXT,
    "meetingLocation" TEXT,
    "attendees" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "leadId" TEXT,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_leads_convertedToTenantId_key" ON "crm_leads"("convertedToTenantId");

-- CreateIndex
CREATE INDEX "crm_leads_status_idx" ON "crm_leads"("status");

-- CreateIndex
CREATE INDEX "crm_leads_assignedToId_idx" ON "crm_leads"("assignedToId");

-- CreateIndex
CREATE INDEX "crm_leads_source_idx" ON "crm_leads"("source");

-- CreateIndex
CREATE INDEX "crm_deals_stage_idx" ON "crm_deals"("stage");

-- CreateIndex
CREATE INDEX "crm_deals_ownerId_idx" ON "crm_deals"("ownerId");

-- CreateIndex
CREATE INDEX "crm_deals_leadId_idx" ON "crm_deals"("leadId");

-- CreateIndex
CREATE INDEX "crm_activities_leadId_idx" ON "crm_activities"("leadId");

-- CreateIndex
CREATE INDEX "crm_activities_type_idx" ON "crm_activities"("type");

-- CreateIndex
CREATE INDEX "crm_activities_activityDate_idx" ON "crm_activities"("activityDate");

-- CreateIndex
CREATE INDEX "crm_tasks_status_idx" ON "crm_tasks"("status");

-- CreateIndex
CREATE INDEX "crm_tasks_assignedToId_idx" ON "crm_tasks"("assignedToId");

-- CreateIndex
CREATE INDEX "crm_tasks_dueDate_idx" ON "crm_tasks"("dueDate");

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tasks" ADD CONSTRAINT "crm_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
