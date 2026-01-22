/*
  Warnings:

  - The values [SUBJECT,CLASS] on the enum `ForumType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `isPublished` on the `announcements` table. All the data in the column will be lost.
  - You are about to drop the column `publishAt` on the `announcements` table. All the data in the column will be lost.
  - You are about to drop the column `lastViewedAt` on the `crm_documents` table. All the data in the column will be lost.
  - You are about to drop the column `parentDocumentId` on the `crm_documents` table. All the data in the column will be lost.
  - You are about to drop the column `version` on the `crm_documents` table. All the data in the column will be lost.
  - You are about to drop the column `viewCount` on the `crm_documents` table. All the data in the column will be lost.
  - You are about to drop the column `attachments` on the `crm_emails` table. All the data in the column will be lost.
  - You are about to drop the column `clickedAt` on the `crm_emails` table. All the data in the column will be lost.
  - You are about to drop the column `isHtml` on the `crm_emails` table. All the data in the column will be lost.
  - You are about to drop the column `openedAt` on the `crm_emails` table. All the data in the column will be lost.
  - You are about to drop the column `retryCount` on the `crm_emails` table. All the data in the column will be lost.
  - You are about to drop the column `websiteVisits` on the `crm_lead_scores` table. All the data in the column will be lost.
  - You are about to alter the column `quantity` on the `crm_quote_items` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,2)`.
  - You are about to drop the column `pdfUrl` on the `crm_quotes` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `forum_posts` table. All the data in the column will be lost.
  - You are about to drop the column `isAnswer` on the `forum_posts` table. All the data in the column will be lost.
  - You are about to drop the column `topicId` on the `forum_posts` table. All the data in the column will be lost.
  - You are about to drop the column `isLocked` on the `forums` table. All the data in the column will be lost.
  - You are about to drop the column `isPinned` on the `forums` table. All the data in the column will be lost.
  - You are about to drop the `crm_follow_up_reminders` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `forum_post_likes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `forum_topics` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `leadId` on table `crm_emails` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updatedAt` to the `crm_quote_items` table without a default value. This is not possible if the table is not empty.
  - Made the column `generatedById` on table `crm_reports` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `forumId` to the `forum_posts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `forum_posts` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('ACTIVE', 'LOCKED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VideoLessonStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TeacherAIConversationType" AS ENUM ('CHAT', 'LESSON_PLAN', 'QUIZ', 'EMAIL', 'GRADING', 'ANALYSIS');

-- AlterEnum
BEGIN;
CREATE TYPE "ForumType_new" AS ENUM ('GENERAL', 'QA', 'ANNOUNCEMENT', 'DISCUSSION');
ALTER TABLE "forums" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "forums" ALTER COLUMN "type" TYPE "ForumType_new" USING ("type"::text::"ForumType_new");
ALTER TYPE "ForumType" RENAME TO "ForumType_old";
ALTER TYPE "ForumType_new" RENAME TO "ForumType";
DROP TYPE "ForumType_old";
ALTER TABLE "forums" ALTER COLUMN "type" SET DEFAULT 'GENERAL';
COMMIT;

-- DropForeignKey
ALTER TABLE "announcement_reads" DROP CONSTRAINT "announcement_reads_userId_fkey";

-- DropForeignKey
ALTER TABLE "announcements" DROP CONSTRAINT "announcements_createdById_fkey";

-- DropForeignKey
ALTER TABLE "crm_email_templates" DROP CONSTRAINT "crm_email_templates_createdById_fkey";

-- DropForeignKey
ALTER TABLE "crm_emails" DROP CONSTRAINT "crm_emails_leadId_fkey";

-- DropForeignKey
ALTER TABLE "crm_follow_up_reminders" DROP CONSTRAINT "crm_follow_up_reminders_assignedToId_fkey";

-- DropForeignKey
ALTER TABLE "crm_follow_up_reminders" DROP CONSTRAINT "crm_follow_up_reminders_leadId_fkey";

-- DropForeignKey
ALTER TABLE "crm_reports" DROP CONSTRAINT "crm_reports_generatedById_fkey";

-- DropForeignKey
ALTER TABLE "forum_post_likes" DROP CONSTRAINT "forum_post_likes_postId_fkey";

-- DropForeignKey
ALTER TABLE "forum_post_likes" DROP CONSTRAINT "forum_post_likes_userId_fkey";

-- DropForeignKey
ALTER TABLE "forum_posts" DROP CONSTRAINT "forum_posts_createdById_fkey";

-- DropForeignKey
ALTER TABLE "forum_posts" DROP CONSTRAINT "forum_posts_parentPostId_fkey";

-- DropForeignKey
ALTER TABLE "forum_posts" DROP CONSTRAINT "forum_posts_topicId_fkey";

-- DropForeignKey
ALTER TABLE "forum_topics" DROP CONSTRAINT "forum_topics_createdById_fkey";

-- DropForeignKey
ALTER TABLE "forum_topics" DROP CONSTRAINT "forum_topics_forumId_fkey";

-- DropForeignKey
ALTER TABLE "forums" DROP CONSTRAINT "forums_createdById_fkey";

-- DropIndex
DROP INDEX "announcements_createdById_idx";

-- DropIndex
DROP INDEX "announcements_publishAt_idx";

-- DropIndex
DROP INDEX "crm_documents_category_idx";

-- DropIndex
DROP INDEX "crm_emails_status_idx";

-- DropIndex
DROP INDEX "crm_quotes_dealId_idx";

-- DropIndex
DROP INDEX "crm_quotes_leadId_idx";

-- DropIndex
DROP INDEX "crm_quotes_status_idx";

-- DropIndex
DROP INDEX "crm_reports_periodStart_periodEnd_idx";

-- DropIndex
DROP INDEX "crm_reports_reportType_idx";

-- DropIndex
DROP INDEX "forum_posts_createdById_idx";

-- DropIndex
DROP INDEX "forum_posts_topicId_idx";

-- AlterTable
ALTER TABLE "announcement_reads" ADD COLUMN     "acknowledgedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "announcements" DROP COLUMN "isPublished",
DROP COLUMN "publishAt",
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "requiresAcknowledgment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduledFor" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "crm_documents" DROP COLUMN "lastViewedAt",
DROP COLUMN "parentDocumentId",
DROP COLUMN "version",
DROP COLUMN "viewCount",
ALTER COLUMN "fileSize" DROP NOT NULL,
ALTER COLUMN "fileType" DROP NOT NULL,
ALTER COLUMN "mimeType" DROP NOT NULL,
ALTER COLUMN "category" DROP NOT NULL,
ALTER COLUMN "category" DROP DEFAULT;

-- AlterTable
ALTER TABLE "crm_email_templates" ALTER COLUMN "category" DROP NOT NULL,
ALTER COLUMN "category" DROP DEFAULT,
ALTER COLUMN "variables" DROP DEFAULT,
ALTER COLUMN "createdById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "crm_emails" DROP COLUMN "attachments",
DROP COLUMN "clickedAt",
DROP COLUMN "isHtml",
DROP COLUMN "openedAt",
DROP COLUMN "retryCount",
ALTER COLUMN "leadId" SET NOT NULL,
ALTER COLUMN "ccEmails" DROP DEFAULT,
ALTER COLUMN "bccEmails" DROP DEFAULT;

-- AlterTable
ALTER TABLE "crm_lead_scores" DROP COLUMN "websiteVisits",
ALTER COLUMN "grade" SET DEFAULT 'D';

-- AlterTable
ALTER TABLE "crm_quote_items" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "quantity" DROP DEFAULT,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "crm_quotes" DROP COLUMN "pdfUrl";

-- AlterTable
ALTER TABLE "crm_reports" ALTER COLUMN "generatedById" SET NOT NULL;

-- AlterTable
ALTER TABLE "forum_posts" DROP COLUMN "createdById",
DROP COLUMN "isAnswer",
DROP COLUMN "topicId",
ADD COLUMN     "attachments" TEXT[],
ADD COLUMN     "forumId" TEXT NOT NULL,
ADD COLUMN     "isAnswered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "PostStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "title" TEXT,
ADD COLUMN     "userId" TEXT NOT NULL,
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "forums" DROP COLUMN "isLocked",
DROP COLUMN "isPinned",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "crm_follow_up_reminders";

-- DropTable
DROP TABLE "forum_post_likes";

-- DropTable
DROP TABLE "forum_topics";

-- CreateTable
CREATE TABLE "crm_reminders" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reminderDate" TIMESTAMP(3) NOT NULL,
    "reminderType" TEXT,
    "priority" TEXT,
    "assignedToId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "snoozeUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_lessons" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "roomPassword" TEXT,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" "VideoLessonStatus" NOT NULL DEFAULT 'SCHEDULED',
    "recordingUrl" TEXT,
    "isRecordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_lesson_attendees" (
    "id" TEXT NOT NULL,
    "videoLessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "duration" INTEGER,

    CONSTRAINT "video_lesson_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "studentId" TEXT,
    "subjectId" TEXT,
    "title" TEXT,
    "totalTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "date" DATE NOT NULL,
    "messagesCount" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_ai_conversations" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "TeacherAIConversationType" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_ai_templates" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_ai_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_ai_usage" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_ai_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_reminders_assignedToId_idx" ON "crm_reminders"("assignedToId");

-- CreateIndex
CREATE INDEX "crm_reminders_reminderDate_idx" ON "crm_reminders"("reminderDate");

-- CreateIndex
CREATE INDEX "post_likes_postId_idx" ON "post_likes"("postId");

-- CreateIndex
CREATE INDEX "post_likes_userId_idx" ON "post_likes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "post_likes_postId_userId_key" ON "post_likes"("postId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "video_lessons_roomId_key" ON "video_lessons"("roomId");

-- CreateIndex
CREATE INDEX "video_lessons_tenantId_idx" ON "video_lessons"("tenantId");

-- CreateIndex
CREATE INDEX "video_lessons_classId_idx" ON "video_lessons"("classId");

-- CreateIndex
CREATE INDEX "video_lessons_teacherId_idx" ON "video_lessons"("teacherId");

-- CreateIndex
CREATE INDEX "video_lessons_scheduledStart_idx" ON "video_lessons"("scheduledStart");

-- CreateIndex
CREATE INDEX "video_lessons_status_idx" ON "video_lessons"("status");

-- CreateIndex
CREATE INDEX "video_lesson_attendees_videoLessonId_idx" ON "video_lesson_attendees"("videoLessonId");

-- CreateIndex
CREATE INDEX "video_lesson_attendees_studentId_idx" ON "video_lesson_attendees"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "video_lesson_attendees_videoLessonId_studentId_key" ON "video_lesson_attendees"("videoLessonId", "studentId");

-- CreateIndex
CREATE INDEX "ai_conversations_tenantId_idx" ON "ai_conversations"("tenantId");

-- CreateIndex
CREATE INDEX "ai_conversations_userId_idx" ON "ai_conversations"("userId");

-- CreateIndex
CREATE INDEX "ai_conversations_studentId_idx" ON "ai_conversations"("studentId");

-- CreateIndex
CREATE INDEX "ai_conversations_subjectId_idx" ON "ai_conversations"("subjectId");

-- CreateIndex
CREATE INDEX "ai_messages_conversationId_idx" ON "ai_messages"("conversationId");

-- CreateIndex
CREATE INDEX "ai_messages_createdAt_idx" ON "ai_messages"("createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_tenantId_idx" ON "ai_usage"("tenantId");

-- CreateIndex
CREATE INDEX "ai_usage_date_idx" ON "ai_usage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_tenantId_userId_date_key" ON "ai_usage"("tenantId", "userId", "date");

-- CreateIndex
CREATE INDEX "teacher_ai_conversations_teacherId_idx" ON "teacher_ai_conversations"("teacherId");

-- CreateIndex
CREATE INDEX "teacher_ai_conversations_tenantId_idx" ON "teacher_ai_conversations"("tenantId");

-- CreateIndex
CREATE INDEX "teacher_ai_conversations_createdAt_idx" ON "teacher_ai_conversations"("createdAt");

-- CreateIndex
CREATE INDEX "teacher_ai_messages_conversationId_idx" ON "teacher_ai_messages"("conversationId");

-- CreateIndex
CREATE INDEX "teacher_ai_templates_teacherId_idx" ON "teacher_ai_templates"("teacherId");

-- CreateIndex
CREATE INDEX "teacher_ai_templates_tenantId_idx" ON "teacher_ai_templates"("tenantId");

-- CreateIndex
CREATE INDEX "teacher_ai_templates_type_idx" ON "teacher_ai_templates"("type");

-- CreateIndex
CREATE INDEX "teacher_ai_usage_teacherId_idx" ON "teacher_ai_usage"("teacherId");

-- CreateIndex
CREATE INDEX "teacher_ai_usage_tenantId_idx" ON "teacher_ai_usage"("tenantId");

-- CreateIndex
CREATE INDEX "teacher_ai_usage_date_idx" ON "teacher_ai_usage"("date");

-- CreateIndex
CREATE INDEX "announcements_publishedAt_idx" ON "announcements"("publishedAt");

-- CreateIndex
CREATE INDEX "announcements_priority_idx" ON "announcements"("priority");

-- CreateIndex
CREATE INDEX "forum_posts_forumId_idx" ON "forum_posts"("forumId");

-- CreateIndex
CREATE INDEX "forum_posts_userId_idx" ON "forum_posts"("userId");

-- CreateIndex
CREATE INDEX "forum_posts_createdAt_idx" ON "forum_posts"("createdAt");

-- AddForeignKey
ALTER TABLE "crm_emails" ADD CONSTRAINT "crm_emails_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_email_templates" ADD CONSTRAINT "crm_email_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_reminders" ADD CONSTRAINT "crm_reminders_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "crm_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_reminders" ADD CONSTRAINT "crm_reminders_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_reports" ADD CONSTRAINT "crm_reports_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "platform_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forums" ADD CONSTRAINT "forums_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_forumId_fkey" FOREIGN KEY ("forumId") REFERENCES "forums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_parentPostId_fkey" FOREIGN KEY ("parentPostId") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_reads" ADD CONSTRAINT "announcement_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_lessons" ADD CONSTRAINT "video_lessons_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_lessons" ADD CONSTRAINT "video_lessons_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_lessons" ADD CONSTRAINT "video_lessons_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_lessons" ADD CONSTRAINT "video_lessons_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_lesson_attendees" ADD CONSTRAINT "video_lesson_attendees_videoLessonId_fkey" FOREIGN KEY ("videoLessonId") REFERENCES "video_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_lesson_attendees" ADD CONSTRAINT "video_lesson_attendees_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_ai_conversations" ADD CONSTRAINT "teacher_ai_conversations_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_ai_conversations" ADD CONSTRAINT "teacher_ai_conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_ai_messages" ADD CONSTRAINT "teacher_ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "teacher_ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_ai_templates" ADD CONSTRAINT "teacher_ai_templates_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_ai_templates" ADD CONSTRAINT "teacher_ai_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_ai_usage" ADD CONSTRAINT "teacher_ai_usage_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_ai_usage" ADD CONSTRAINT "teacher_ai_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
