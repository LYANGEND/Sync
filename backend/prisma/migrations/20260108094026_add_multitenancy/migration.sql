/*
  Multi-Tenancy Migration
  
  This migration:
  1. Creates the tenants table and related new tables
  2. Creates a default tenant for existing data
  3. Adds tenantId columns to all existing tables
  4. Updates existing data with the default tenant ID
  5. Adds foreign key constraints and indexes
*/

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_SUPERADMIN', 'PLATFORM_SUPPORT', 'PLATFORM_SALES');

-- Step 1: Create new tables first (no dependencies on existing data)

-- CreateTable tenants
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "logoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#2563eb',
    "secondaryColor" TEXT NOT NULL DEFAULT '#475569',
    "accentColor" TEXT NOT NULL DEFAULT '#f59e0b',
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'ZM',
    "website" TEXT,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "subscriptionStartedAt" TIMESTAMP(3),
    "subscriptionEndsAt" TIMESTAMP(3),
    "maxStudents" INTEGER NOT NULL DEFAULT 50,
    "maxTeachers" INTEGER NOT NULL DEFAULT 5,
    "maxUsers" INTEGER NOT NULL DEFAULT 10,
    "maxClasses" INTEGER NOT NULL DEFAULT 5,
    "maxStorageGB" INTEGER NOT NULL DEFAULT 1,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "onlineAssessmentsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "parentPortalEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reportCardsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "attendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "feeManagementEnabled" BOOLEAN NOT NULL DEFAULT true,
    "chatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "advancedReportsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "apiAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
    "timetableEnabled" BOOLEAN NOT NULL DEFAULT true,
    "syllabusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFromEmail" TEXT,
    "smtpFromName" TEXT,
    "smsProvider" TEXT,
    "smsApiKey" TEXT,
    "smsApiSecret" TEXT,
    "smsSenderId" TEXT,
    "currentStudentCount" INTEGER NOT NULL DEFAULT 0,
    "currentTeacherCount" INTEGER NOT NULL DEFAULT 0,
    "currentUserCount" INTEGER NOT NULL DEFAULT 0,
    "currentStorageUsedMB" INTEGER NOT NULL DEFAULT 0,
    "currentTermId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable platform_users
CREATE TABLE "platform_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'PLATFORM_SUPPORT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable subscription_plans
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "description" TEXT,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "yearlyPrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "maxStudents" INTEGER NOT NULL,
    "maxTeachers" INTEGER NOT NULL,
    "maxUsers" INTEGER NOT NULL,
    "maxClasses" INTEGER NOT NULL,
    "maxStorageGB" INTEGER NOT NULL,
    "features" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable contact_submissions
CREATE TABLE "contact_submissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "schoolName" TEXT,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id")
);

-- Step 2: Create default tenant from existing school_settings (or create empty one)
INSERT INTO "tenants" ("id", "name", "slug", "email", "tier", "status", "maxStudents", "maxTeachers", "maxUsers", "maxClasses", "maxStorageGB", "smsEnabled", "emailEnabled", "onlineAssessmentsEnabled", "parentPortalEnabled", "reportCardsEnabled", "attendanceEnabled", "feeManagementEnabled", "chatEnabled", "advancedReportsEnabled", "apiAccessEnabled", "timetableEnabled", "syllabusEnabled", "updatedAt")
SELECT
    gen_random_uuid(),
    COALESCE((SELECT "schoolName" FROM "school_settings" LIMIT 1), 'Default School'),
    'default',
    COALESCE((SELECT "schoolEmail" FROM "school_settings" LIMIT 1), 'admin@school.com'),
    'PROFESSIONAL',
    'ACTIVE',
    1000, 100, 200, 50, 50,
    true, true, true, true, true, true, true, true, true, true, true, true,
    CURRENT_TIMESTAMP;

-- Step 3: Add tenantId columns as NULLABLE first
ALTER TABLE "users" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "students" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "classes" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "subjects" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "academic_terms" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "fee_templates" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "payments" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "attendance" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "attendance" ADD COLUMN "reason" TEXT;
ALTER TABLE "assessments" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "grading_scales" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "scholarships" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "timetable_periods" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "topics" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "lesson_plans" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "notifications" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "conversations" ADD COLUMN "tenantId" TEXT;

-- Step 4: Update all existing records with the default tenant ID
UPDATE "users" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "students" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "classes" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "subjects" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "academic_terms" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "fee_templates" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "payments" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "attendance" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "assessments" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "grading_scales" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "scholarships" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "timetable_periods" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "topics" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "lesson_plans" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "notifications" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;
UPDATE "conversations" SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default' LIMIT 1) WHERE "tenantId" IS NULL;

-- Step 5: Update tenant usage counts
UPDATE "tenants"
SET 
    "currentStudentCount" = (SELECT COUNT(*) FROM "students" WHERE "students"."tenantId" = "tenants"."id"),
    "currentUserCount" = (SELECT COUNT(*) FROM "users" WHERE "users"."tenantId" = "tenants"."id"),
    "currentTeacherCount" = (SELECT COUNT(*) FROM "users" WHERE "users"."tenantId" = "tenants"."id" AND "users"."role" = 'TEACHER')
WHERE "slug" = 'default';

-- Step 6: Make tenantId columns NOT NULL now that they have values
ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "students" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "classes" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "subjects" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "academic_terms" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "fee_templates" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "attendance" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "assessments" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "grading_scales" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "scholarships" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "timetable_periods" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "topics" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "lesson_plans" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "notifications" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "conversations" ALTER COLUMN "tenantId" SET NOT NULL;

-- Step 7: Drop old constraints and foreign keys
ALTER TABLE "school_settings" DROP CONSTRAINT IF EXISTS "school_settings_currentTermId_fkey";
DROP INDEX IF EXISTS "students_admissionNumber_key";
DROP INDEX IF EXISTS "subjects_code_key";
DROP INDEX IF EXISTS "users_email_key";

-- Step 8: Clean up school_settings (deprecated columns - now in tenant)
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "emailNotificationsEnabled";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "feeReminderDaysBefore";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "feeReminderEnabled";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "overdueReminderEnabled";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "overdueReminderFrequency";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smsApiKey";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smsApiSecret";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smsNotificationsEnabled";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smsProvider";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smsSenderId";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smtpFromEmail";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smtpFromName";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smtpHost";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smtpPassword";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smtpPort";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smtpSecure";
ALTER TABLE "school_settings" DROP COLUMN IF EXISTS "smtpUser";

-- Step 9: Create indexes on new tables
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");
CREATE INDEX "tenants_status_idx" ON "tenants"("status");
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- Step 10: Create indexes on tenantId columns
CREATE INDEX "academic_terms_tenantId_idx" ON "academic_terms"("tenantId");
CREATE INDEX "attendance_tenantId_idx" ON "attendance"("tenantId");
CREATE INDEX "classes_tenantId_idx" ON "classes"("tenantId");
CREATE INDEX "conversations_tenantId_idx" ON "conversations"("tenantId");
CREATE INDEX "fee_templates_tenantId_idx" ON "fee_templates"("tenantId");
CREATE INDEX "grading_scales_tenantId_idx" ON "grading_scales"("tenantId");
CREATE INDEX "lesson_plans_tenantId_idx" ON "lesson_plans"("tenantId");
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");
CREATE INDEX "payments_tenantId_idx" ON "payments"("tenantId");
CREATE INDEX "scholarships_tenantId_idx" ON "scholarships"("tenantId");
CREATE INDEX "students_tenantId_idx" ON "students"("tenantId");
CREATE INDEX "subjects_tenantId_idx" ON "subjects"("tenantId");
CREATE INDEX "timetable_periods_tenantId_idx" ON "timetable_periods"("tenantId");
CREATE INDEX "topics_tenantId_idx" ON "topics"("tenantId");
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- Step 11: Create unique constraints (now per-tenant)
CREATE UNIQUE INDEX "students_tenantId_admissionNumber_key" ON "students"("tenantId", "admissionNumber");
CREATE UNIQUE INDEX "subjects_tenantId_code_key" ON "subjects"("tenantId", "code");
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- Step 12: Add foreign key constraints
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "students" ADD CONSTRAINT "students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "classes" ADD CONSTRAINT "classes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "topics" ADD CONSTRAINT "topics_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_plans" ADD CONSTRAINT "lesson_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
