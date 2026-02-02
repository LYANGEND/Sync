-- CreateTable
CREATE TABLE "video_lesson_chats" (
    "id" TEXT NOT NULL,
    "videoLessonId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_lesson_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_lesson_raised_hands" (
    "id" TEXT NOT NULL,
    "videoLessonId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loweredAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "video_lesson_raised_hands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "video_lesson_chats_videoLessonId_idx" ON "video_lesson_chats"("videoLessonId");

-- CreateIndex
CREATE INDEX "video_lesson_chats_createdAt_idx" ON "video_lesson_chats"("createdAt");

-- CreateIndex
CREATE INDEX "video_lesson_raised_hands_videoLessonId_idx" ON "video_lesson_raised_hands"("videoLessonId");

-- CreateIndex
CREATE INDEX "video_lesson_raised_hands_studentId_idx" ON "video_lesson_raised_hands"("studentId");

-- CreateIndex
CREATE INDEX "video_lesson_raised_hands_isActive_idx" ON "video_lesson_raised_hands"("isActive");

-- AddForeignKey
ALTER TABLE "video_lesson_chats" ADD CONSTRAINT "video_lesson_chats_videoLessonId_fkey" FOREIGN KEY ("videoLessonId") REFERENCES "video_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_lesson_raised_hands" ADD CONSTRAINT "video_lesson_raised_hands_videoLessonId_fkey" FOREIGN KEY ("videoLessonId") REFERENCES "video_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_lesson_raised_hands" ADD CONSTRAINT "video_lesson_raised_hands_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
