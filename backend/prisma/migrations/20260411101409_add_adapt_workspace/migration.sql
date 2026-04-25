-- CreateTable
CREATE TABLE "adapted_lessons" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subTopicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "activities" JSONB NOT NULL,
    "targetStudentIds" TEXT[],
    "sourceActionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adapted_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "adapted_lessons_teacherId_idx" ON "adapted_lessons"("teacherId");

-- CreateIndex
CREATE INDEX "adapted_lessons_classId_idx" ON "adapted_lessons"("classId");

-- CreateIndex
CREATE INDEX "adapted_lessons_status_idx" ON "adapted_lessons"("status");

-- AddForeignKey
ALTER TABLE "adapted_lessons" ADD CONSTRAINT "adapted_lessons_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adapted_lessons" ADD CONSTRAINT "adapted_lessons_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adapted_lessons" ADD CONSTRAINT "adapted_lessons_subTopicId_fkey" FOREIGN KEY ("subTopicId") REFERENCES "sub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
