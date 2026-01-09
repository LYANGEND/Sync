-- CreateEnum safely
DO $$ BEGIN
    CREATE TYPE "PaymentStatus" AS ENUM ('COMPLETED', 'VOIDED', 'PENDING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable (moved up for data migration)
CREATE TABLE "timetable_period_classes" (
    "id" TEXT NOT NULL,
    "timetablePeriodId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "timetable_period_classes_pkey" PRIMARY KEY ("id")
);

-- DATA MIGRATION: Preserve existing class links
-- Uses gen_random_uuid() which is standard in Postgres 13+. 
-- If using older Postgres without pgcrypto, this might fail, but it's the best effortless attempt.
INSERT INTO "timetable_period_classes" ("id", "timetablePeriodId", "classId")
SELECT 
    gen_random_uuid()::text,
    "id", 
    "classId"
FROM "timetable_periods"
WHERE "classId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "timetable_periods" DROP CONSTRAINT "timetable_periods_classId_fkey";

-- AlterTable (Payments)
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED';
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "voidReason" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "voidedAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "voidedByUserId" TEXT;

-- AlterTable (Subjects)
ALTER TABLE "subjects" ADD COLUMN IF NOT EXISTS "teacherId" TEXT;

-- AlterTable (Drop classId now that data is copied)
ALTER TABLE "timetable_periods" DROP COLUMN "classId";

-- CreateTable (Teacher Subjects)
CREATE TABLE "teacher_subjects" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_subjects_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "teacher_subjects_classId_subjectId_key" ON "teacher_subjects"("classId", "subjectId");
CREATE UNIQUE INDEX "timetable_period_classes_timetablePeriodId_classId_key" ON "timetable_period_classes"("timetablePeriodId", "classId");
CREATE INDEX IF NOT EXISTS "payments_studentId_status_idx" ON "payments"("studentId", "status");
CREATE INDEX IF NOT EXISTS "payments_paymentDate_status_idx" ON "payments"("paymentDate", "status");

-- Foreign Keys
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "teacher_subjects" ADD CONSTRAINT "teacher_subjects_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timetable_period_classes" ADD CONSTRAINT "timetable_period_classes_timetablePeriodId_fkey" FOREIGN KEY ("timetablePeriodId") REFERENCES "timetable_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "timetable_period_classes" ADD CONSTRAINT "timetable_period_classes_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
