-- CreateTable
CREATE TABLE "teaching_content" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "topicId" TEXT,
    "subTopicId" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceFile" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'NOTES',
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teaching_content_subjectId_gradeLevel_idx" ON "teaching_content"("subjectId", "gradeLevel");

-- CreateIndex
CREATE INDEX "teaching_content_topicId_idx" ON "teaching_content"("topicId");

-- CreateIndex
CREATE INDEX "teaching_content_subTopicId_idx" ON "teaching_content"("subTopicId");
