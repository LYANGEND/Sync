-- CreateEnum
CREATE TYPE "AcademicEventType" AS ENUM ('HOLIDAY', 'EXAM_PERIOD', 'PARENT_MEETING', 'SPORTS_DAY', 'CULTURAL_EVENT', 'DEADLINE', 'STAFF_DEVELOPMENT', 'SCHOOL_CLOSURE', 'OTHER');

-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('ASSIGNED', 'SUBMITTED', 'LATE_SUBMITTED', 'GRADED', 'RETURNED');

-- AlterTable
ALTER TABLE "assessments" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "academic_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "AcademicEventType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homework_submissions" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "content" TEXT,
    "fileUrl" TEXT,
    "status" "HomeworkStatus" NOT NULL DEFAULT 'ASSIGNED',
    "submittedAt" TIMESTAMP(3),
    "score" DECIMAL(5,2),
    "feedback" TEXT,
    "gradedAt" TIMESTAMP(3),
    "gradedBy" TEXT,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_events_startDate_endDate_idx" ON "academic_events"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "academic_events_eventType_idx" ON "academic_events"("eventType");

-- CreateIndex
CREATE INDEX "homework_submissions_studentId_idx" ON "homework_submissions"("studentId");

-- CreateIndex
CREATE INDEX "homework_submissions_assessmentId_idx" ON "homework_submissions"("assessmentId");

-- CreateIndex
CREATE INDEX "homework_submissions_status_idx" ON "homework_submissions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "homework_submissions_assessmentId_studentId_key" ON "homework_submissions"("assessmentId", "studentId");

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homework_submissions" ADD CONSTRAINT "homework_submissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
