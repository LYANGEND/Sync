-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AcademicTermStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSING', 'CLOSED');

-- CreateEnum
CREATE TYPE "ClassCohortStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "StudentTermEnrollmentStatus" AS ENUM ('STAGED', 'ACTIVE', 'COMPLETED', 'TRANSFERRED', 'WITHDRAWN', 'GRADUATED');

-- CreateEnum
CREATE TYPE "StudentTransitionAction" AS ENUM ('CARRY_FORWARD', 'PROMOTE', 'RETAIN', 'GRADUATE', 'TRANSFER', 'WITHDRAW');

-- CreateEnum
CREATE TYPE "TermRolloverType" AS ENUM ('WITHIN_YEAR', 'YEAR_END');

-- CreateEnum
CREATE TYPE "TermRolloverStatus" AS ENUM ('DRAFT', 'PREPARING', 'PREPARED', 'READY', 'EXECUTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TermRolloverTaskStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "StudentTermReportStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ClosedTermAmendmentStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');

-- AlterTable
ALTER TABLE "academic_terms" ADD COLUMN     "academicYearId" TEXT,
ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedByUserId" TEXT,
ADD COLUMN     "closingStartedAt" TIMESTAMP(3),
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sequence" INTEGER,
ADD COLUMN     "status" "AcademicTermStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Compatibility backfill: lifecycle status is authoritative for new code, while
-- isActive remains synchronized during the expand/migrate/contract rollout.
UPDATE "academic_terms"
SET "status" = CASE
    WHEN "isActive" THEN 'ACTIVE'::"AcademicTermStatus"
    ELSE 'DRAFT'::"AcademicTermStatus"
END,
"activatedAt" = CASE WHEN "isActive" THEN CURRENT_TIMESTAMP ELSE NULL END;

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM "academic_terms" WHERE "status" = 'ACTIVE') > 1 THEN
        RAISE EXCEPTION 'Cannot add the term lifecycle because multiple active academic terms exist.';
    END IF;

    IF (SELECT COUNT(*) FROM "school_settings") > 1 THEN
        RAISE EXCEPTION 'Cannot reconcile the current term because multiple school settings rows exist.';
    END IF;
END $$;

-- SchoolSettings is a singleton compatibility pointer. Reconcile stale or null
-- legacy values to the same term selected by the lifecycle backfill.
UPDATE "school_settings"
SET "currentTermId" = (
    SELECT "id"
    FROM "academic_terms"
    WHERE "status" = 'ACTIVE'
    LIMIT 1
);

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "classCohortId" TEXT;

-- AlterTable
ALTER TABLE "student_term_reports" ADD COLUMN     "currentVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "finalizedByUserId" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "publishedByUserId" TEXT,
ADD COLUMN     "status" "StudentTermReportStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "termCount" INTEGER NOT NULL DEFAULT 3,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "finalizedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_cohorts" (
    "id" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "branchId" TEXT,
    "predecessorCohortId" TEXT,
    "status" "ClassCohortStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_term_enrollments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "status" "StudentTermEnrollmentStatus" NOT NULL DEFAULT 'STAGED',
    "transitionAction" "StudentTransitionAction",
    "sourceEnrollmentId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_term_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_instructional_days" (
    "id" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isInstructional" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_instructional_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_rollovers" (
    "id" TEXT NOT NULL,
    "sourceTermId" TEXT NOT NULL,
    "targetTermId" TEXT NOT NULL,
    "transitionType" "TermRolloverType" NOT NULL,
    "status" "TermRolloverStatus" NOT NULL DEFAULT 'DRAFT',
    "idempotencyKey" TEXT NOT NULL,
    "inputHash" TEXT,
    "preflightHash" TEXT,
    "configuration" JSONB,
    "warningAcknowledgements" JSONB,
    "backupReference" TEXT,
    "backupChecksum" TEXT,
    "backupVerifiedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "executedByUserId" TEXT,
    "executedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_rollovers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_rollover_tasks" (
    "id" TEXT NOT NULL,
    "rolloverId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "status" "TermRolloverTaskStatus" NOT NULL DEFAULT 'PENDING',
    "sourceEntityId" TEXT,
    "targetEntityId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "resultData" JSONB,
    "errorData" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_rollover_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_rollover_events" (
    "id" TEXT NOT NULL,
    "rolloverId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "term_rollover_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_transition_decisions" (
    "id" TEXT NOT NULL,
    "rolloverId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sourceEnrollmentId" TEXT,
    "targetClassId" TEXT,
    "action" "StudentTransitionAction" NOT NULL,
    "reason" TEXT,
    "decidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_transition_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_close_snapshots" (
    "id" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "rolloverId" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "checksum" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "term_close_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closed_term_amendments" (
    "id" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "rolloverId" TEXT,
    "status" "ClosedTermAmendmentStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedByUserId" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "appliedByUserId" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closed_term_amendments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closed_term_amendment_items" (
    "id" TEXT NOT NULL,
    "amendmentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT,
    "beforeValue" JSONB,
    "afterValue" JSONB,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "closed_term_amendment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_term_report_versions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "StudentTermReportStatus" NOT NULL,
    "snapshot" JSONB NOT NULL,
    "reason" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_term_report_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_name_key" ON "academic_years"("name");

-- CreateIndex
CREATE INDEX "academic_years_status_startDate_idx" ON "academic_years"("status", "startDate");

-- CreateIndex
CREATE INDEX "class_cohorts_academicYearId_gradeLevel_idx" ON "class_cohorts"("academicYearId", "gradeLevel");

-- CreateIndex
CREATE INDEX "class_cohorts_branchId_idx" ON "class_cohorts"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "class_cohorts_academicYearId_branchId_name_key" ON "class_cohorts"("academicYearId", "branchId", "name");

-- CreateIndex
CREATE INDEX "student_term_enrollments_academicTermId_classId_status_idx" ON "student_term_enrollments"("academicTermId", "classId", "status");

-- CreateIndex
CREATE INDEX "student_term_enrollments_classId_status_idx" ON "student_term_enrollments"("classId", "status");

-- CreateIndex
CREATE INDEX "student_term_enrollments_sourceEnrollmentId_idx" ON "student_term_enrollments"("sourceEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "student_term_enrollments_studentId_academicTermId_key" ON "student_term_enrollments"("studentId", "academicTermId");

-- CreateIndex
CREATE INDEX "term_instructional_days_academicTermId_isInstructional_idx" ON "term_instructional_days"("academicTermId", "isInstructional");

-- CreateIndex
CREATE UNIQUE INDEX "term_instructional_days_academicTermId_date_key" ON "term_instructional_days"("academicTermId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "term_rollovers_idempotencyKey_key" ON "term_rollovers"("idempotencyKey");

-- CreateIndex
CREATE INDEX "term_rollovers_sourceTermId_targetTermId_status_idx" ON "term_rollovers"("sourceTermId", "targetTermId", "status");

-- CreateIndex
CREATE INDEX "term_rollovers_status_updatedAt_idx" ON "term_rollovers"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "term_rollover_tasks_rolloverId_category_status_idx" ON "term_rollover_tasks"("rolloverId", "category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "term_rollover_tasks_rolloverId_operationKey_key" ON "term_rollover_tasks"("rolloverId", "operationKey");

-- CreateIndex
CREATE INDEX "term_rollover_events_rolloverId_createdAt_idx" ON "term_rollover_events"("rolloverId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "term_rollover_events_rolloverId_sequence_key" ON "term_rollover_events"("rolloverId", "sequence");

-- CreateIndex
CREATE INDEX "student_transition_decisions_rolloverId_action_idx" ON "student_transition_decisions"("rolloverId", "action");

-- CreateIndex
CREATE INDEX "student_transition_decisions_sourceEnrollmentId_idx" ON "student_transition_decisions"("sourceEnrollmentId");

-- CreateIndex
CREATE INDEX "student_transition_decisions_targetClassId_idx" ON "student_transition_decisions"("targetClassId");

-- CreateIndex
CREATE UNIQUE INDEX "student_transition_decisions_rolloverId_studentId_key" ON "student_transition_decisions"("rolloverId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "term_close_snapshots_academicTermId_key" ON "term_close_snapshots"("academicTermId");

-- CreateIndex
CREATE UNIQUE INDEX "term_close_snapshots_rolloverId_key" ON "term_close_snapshots"("rolloverId");

-- CreateIndex
CREATE INDEX "term_close_snapshots_createdAt_idx" ON "term_close_snapshots"("createdAt");

-- CreateIndex
CREATE INDEX "closed_term_amendments_academicTermId_status_idx" ON "closed_term_amendments"("academicTermId", "status");

-- CreateIndex
CREATE INDEX "closed_term_amendments_rolloverId_idx" ON "closed_term_amendments"("rolloverId");

-- CreateIndex
CREATE INDEX "closed_term_amendment_items_amendmentId_entityType_idx" ON "closed_term_amendment_items"("amendmentId", "entityType");

-- CreateIndex
CREATE INDEX "closed_term_amendment_items_entityType_entityId_idx" ON "closed_term_amendment_items"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "student_term_report_versions_reportId_status_idx" ON "student_term_report_versions"("reportId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_term_report_versions_reportId_version_key" ON "student_term_report_versions"("reportId", "version");

-- CreateIndex
CREATE INDEX "academic_terms_status_startDate_idx" ON "academic_terms"("status", "startDate");

-- PostgreSQL partial uniqueness enforces exactly zero or one active term while
-- still allowing any number of draft, closing, and closed terms.
CREATE UNIQUE INDEX "academic_terms_one_active_idx"
ON "academic_terms" ((1))
WHERE "status" = 'ACTIVE';

-- The application and lifecycle compatibility pointer treat SchoolSettings as
-- a singleton. The preflight check above makes this safe to enforce.
CREATE UNIQUE INDEX "school_settings_singleton_idx"
ON "school_settings" ((1));

ALTER TABLE "academic_years"
ADD CONSTRAINT "academic_years_valid_dates_check" CHECK ("endDate" > "startDate"),
ADD CONSTRAINT "academic_years_term_count_check" CHECK ("termCount" > 0);

ALTER TABLE "academic_terms"
ADD CONSTRAINT "academic_terms_valid_dates_check" CHECK ("endDate" > "startDate"),
ADD CONSTRAINT "academic_terms_sequence_check" CHECK ("sequence" IS NULL OR "sequence" > 0),
ADD CONSTRAINT "academic_terms_active_compatibility_check"
CHECK (("status" = 'ACTIVE') = "isActive");

ALTER TABLE "student_term_enrollments"
ADD CONSTRAINT "student_term_enrollments_valid_dates_check"
CHECK ("endsAt" IS NULL OR "endsAt" >= "startsAt");

ALTER TABLE "term_rollovers"
ADD CONSTRAINT "term_rollovers_distinct_terms_check"
CHECK ("sourceTermId" <> "targetTermId");

-- CreateIndex
CREATE INDEX "academic_terms_academicYearId_sequence_idx" ON "academic_terms"("academicYearId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "academic_terms_academicYearId_sequence_key" ON "academic_terms"("academicYearId", "sequence");

-- CreateIndex
CREATE INDEX "classes_academicTermId_branchId_idx" ON "classes"("academicTermId", "branchId");

-- CreateIndex
CREATE INDEX "classes_classCohortId_idx" ON "classes"("classCohortId");

-- CreateIndex
CREATE UNIQUE INDEX "classes_classCohortId_academicTermId_key" ON "classes"("classCohortId", "academicTermId");

-- CreateIndex
CREATE INDEX "student_term_reports_termId_status_idx" ON "student_term_reports"("termId", "status");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_classCohortId_fkey" FOREIGN KEY ("classCohortId") REFERENCES "class_cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_cohorts" ADD CONSTRAINT "class_cohorts_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_cohorts" ADD CONSTRAINT "class_cohorts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_cohorts" ADD CONSTRAINT "class_cohorts_predecessorCohortId_fkey" FOREIGN KEY ("predecessorCohortId") REFERENCES "class_cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_enrollments" ADD CONSTRAINT "student_term_enrollments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_enrollments" ADD CONSTRAINT "student_term_enrollments_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_enrollments" ADD CONSTRAINT "student_term_enrollments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_enrollments" ADD CONSTRAINT "student_term_enrollments_sourceEnrollmentId_fkey" FOREIGN KEY ("sourceEnrollmentId") REFERENCES "student_term_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_instructional_days" ADD CONSTRAINT "term_instructional_days_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_rollovers" ADD CONSTRAINT "term_rollovers_sourceTermId_fkey" FOREIGN KEY ("sourceTermId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_rollovers" ADD CONSTRAINT "term_rollovers_targetTermId_fkey" FOREIGN KEY ("targetTermId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_rollover_tasks" ADD CONSTRAINT "term_rollover_tasks_rolloverId_fkey" FOREIGN KEY ("rolloverId") REFERENCES "term_rollovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_rollover_events" ADD CONSTRAINT "term_rollover_events_rolloverId_fkey" FOREIGN KEY ("rolloverId") REFERENCES "term_rollovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transition_decisions" ADD CONSTRAINT "student_transition_decisions_rolloverId_fkey" FOREIGN KEY ("rolloverId") REFERENCES "term_rollovers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transition_decisions" ADD CONSTRAINT "student_transition_decisions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transition_decisions" ADD CONSTRAINT "student_transition_decisions_sourceEnrollmentId_fkey" FOREIGN KEY ("sourceEnrollmentId") REFERENCES "student_term_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_transition_decisions" ADD CONSTRAINT "student_transition_decisions_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_close_snapshots" ADD CONSTRAINT "term_close_snapshots_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_close_snapshots" ADD CONSTRAINT "term_close_snapshots_rolloverId_fkey" FOREIGN KEY ("rolloverId") REFERENCES "term_rollovers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closed_term_amendments" ADD CONSTRAINT "closed_term_amendments_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closed_term_amendments" ADD CONSTRAINT "closed_term_amendments_rolloverId_fkey" FOREIGN KEY ("rolloverId") REFERENCES "term_rollovers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closed_term_amendment_items" ADD CONSTRAINT "closed_term_amendment_items_amendmentId_fkey" FOREIGN KEY ("amendmentId") REFERENCES "closed_term_amendments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_term_report_versions" ADD CONSTRAINT "student_term_report_versions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "student_term_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

