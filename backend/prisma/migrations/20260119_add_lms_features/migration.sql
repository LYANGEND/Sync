-- LMS Features Migration
-- Phase 1: Homework & Resources

-- Create enum for homework types
CREATE TYPE "HomeworkType" AS ENUM ('CLASSWORK', 'HOMEWORK', 'PROJECT', 'RESEARCH', 'PRACTICE');

-- Create enum for resource types
CREATE TYPE "ResourceType" AS ENUM ('PDF', 'VIDEO', 'DOCUMENT', 'LINK', 'IMAGE', 'PAST_PAPER', 'NOTES');

-- Create enum for submission status
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'GRADED', 'RETURNED');

-- Subject Content (Links class to subject with teacher)
CREATE TABLE "subject_content" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "curriculumCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subject_content_pkey" PRIMARY KEY ("id")
);

-- Homework
CREATE TABLE "homework" (
    "id" TEXT NOT NULL,
    "subjectContentId" TEXT NOT NULL,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "type" "HomeworkType" NOT NULL DEFAULT 'HOMEWORK',
    "assignedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "maxPoints" DECIMAL(5,2),
    "requiresSubmission" BOOLEAN NOT NULL DEFAULT false,
    "allowLateSubmission" BOOLEAN NOT NULL DEFAULT true,
    "attachments" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_pkey" PRIMARY KEY ("id")
);

-- Homework Submissions
CREATE TABLE "homework_submission" (
    "id" TEXT NOT NULL,
    "homeworkId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLate" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT,
    "attachments" TEXT[],
    "marks" DECIMAL(5,2),
    "maxMarks" DECIMAL(5,2),
    "feedback" TEXT,
    "gradedAt" TIMESTAMP(3),
    "gradedByUserId" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homework_submission_pkey" PRIMARY KEY ("id")
);

-- Resources
CREATE TABLE "resource" (
    "id" TEXT NOT NULL,
    "subjectContentId" TEXT NOT NULL,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ResourceType" NOT NULL,
    "fileUrl" TEXT,
    "externalUrl" TEXT,
    "content" TEXT,
    "fileSize" INTEGER,
    "duration" INTEGER,
    "isDownloadable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);

-- Lesson (Daily/Weekly lessons)
CREATE TABLE "lesson" (
    "id" TEXT NOT NULL,
    "subjectContentId" TEXT NOT NULL,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "period" INTEGER,
    "objectives" TEXT[],
    "notes" TEXT,
    "attendanceRecorded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_pkey" PRIMARY KEY ("id")
);

-- Lesson Resources (Many-to-Many)
CREATE TABLE "lesson_resource" (
    "lessonId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,

    CONSTRAINT "lesson_resource_pkey" PRIMARY KEY ("lessonId","resourceId")
);

-- Add unique constraint for subject content
CREATE UNIQUE INDEX "subject_content_classId_subjectId_academicTermId_key" ON "subject_content"("classId", "subjectId", "academicTermId");

-- Add unique constraint for homework submission
CREATE UNIQUE INDEX "homework_submission_homeworkId_studentId_key" ON "homework_submission"("homeworkId", "studentId");

-- Add indexes for performance
CREATE INDEX "subject_content_tenantId_idx" ON "subject_content"("tenantId");
CREATE INDEX "subject_content_teacherId_idx" ON "subject_content"("teacherId");
CREATE INDEX "homework_subjectContentId_idx" ON "homework"("subjectContentId");
CREATE INDEX "homework_dueDate_idx" ON "homework"("dueDate");
CREATE INDEX "homework_submission_studentId_idx" ON "homework_submission"("studentId");
CREATE INDEX "homework_submission_homeworkId_idx" ON "homework_submission"("homeworkId");
CREATE INDEX "resource_subjectContentId_idx" ON "resource"("subjectContentId");
CREATE INDEX "lesson_subjectContentId_idx" ON "lesson"("subjectContentId");
CREATE INDEX "lesson_date_idx" ON "lesson"("date");

-- Add foreign keys
ALTER TABLE "subject_content" ADD CONSTRAINT "subject_content_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_content" ADD CONSTRAINT "subject_content_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_content" ADD CONSTRAINT "subject_content_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_content" ADD CONSTRAINT "subject_content_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subject_content" ADD CONSTRAINT "subject_content_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "homework" ADD CONSTRAINT "homework_subjectContentId_fkey" FOREIGN KEY ("subjectContentId") REFERENCES "subject_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homework" ADD CONSTRAINT "homework_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "homework_submission" ADD CONSTRAINT "homework_submission_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homework_submission" ADD CONSTRAINT "homework_submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "homework_submission" ADD CONSTRAINT "homework_submission_gradedByUserId_fkey" FOREIGN KEY ("gradedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "resource" ADD CONSTRAINT "resource_subjectContentId_fkey" FOREIGN KEY ("subjectContentId") REFERENCES "subject_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resource" ADD CONSTRAINT "resource_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lesson" ADD CONSTRAINT "lesson_subjectContentId_fkey" FOREIGN KEY ("subjectContentId") REFERENCES "subject_content"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson" ADD CONSTRAINT "lesson_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lesson_resource" ADD CONSTRAINT "lesson_resource_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lesson_resource" ADD CONSTRAINT "lesson_resource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
