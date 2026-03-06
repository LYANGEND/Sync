-- CreateTable
CREATE TABLE "virtual_classrooms" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "classId" TEXT,
    "subjectId" TEXT,
    "teacherId" TEXT,
    "roomName" TEXT NOT NULL,
    "roomPassword" TEXT,
    "jitsiDomain" TEXT NOT NULL DEFAULT 'meet.jit.si',
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "aiTutorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiTutorVoiceId" TEXT,
    "aiTutorName" TEXT NOT NULL DEFAULT 'AI Teacher',
    "aiTutorPersona" TEXT,
    "lessonPlanContent" TEXT,
    "aiTutorLanguage" TEXT NOT NULL DEFAULT 'en',
    "maxParticipants" INTEGER NOT NULL DEFAULT 50,
    "isRecordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "virtual_classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tutor_sessions" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "voiceId" TEXT,
    "modelUsed" TEXT,
    "personaUsed" TEXT,
    "lessonPhase" TEXT NOT NULL DEFAULT 'GREETING',
    "currentTopic" TEXT,
    "topicIndex" INTEGER NOT NULL DEFAULT 0,
    "totalTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "totalTTSCharacters" INTEGER NOT NULL DEFAULT 0,
    "totalSTTMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "questionsAsked" INTEGER NOT NULL DEFAULT 0,
    "questionsAnswered" INTEGER NOT NULL DEFAULT 0,
    "conversationLog" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_tutor_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_participants" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "userId" TEXT,
    "studentId" TEXT,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STUDENT',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "handRaiseCount" INTEGER NOT NULL DEFAULT 0,
    "chatMessageCount" INTEGER NOT NULL DEFAULT 0,
    "speakingDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "attentionScore" DOUBLE PRECISION,

    CONSTRAINT "classroom_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_chats" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderId" TEXT,
    "isAI" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "audioUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_recordings" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "recordingUrl" TEXT,
    "duration" DOUBLE PRECISION,
    "fileSize" BIGINT,
    "summary" TEXT,
    "keyTopics" JSONB,
    "transcript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_recordings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "virtual_classrooms_roomName_key" ON "virtual_classrooms"("roomName");

-- CreateIndex
CREATE INDEX "virtual_classrooms_status_idx" ON "virtual_classrooms"("status");

-- CreateIndex
CREATE INDEX "virtual_classrooms_scheduledStart_idx" ON "virtual_classrooms"("scheduledStart");

-- CreateIndex
CREATE INDEX "virtual_classrooms_createdById_idx" ON "virtual_classrooms"("createdById");

-- CreateIndex
CREATE INDEX "virtual_classrooms_classId_idx" ON "virtual_classrooms"("classId");

-- CreateIndex
CREATE INDEX "virtual_classrooms_subjectId_idx" ON "virtual_classrooms"("subjectId");

-- CreateIndex
CREATE INDEX "ai_tutor_sessions_classroomId_idx" ON "ai_tutor_sessions"("classroomId");

-- CreateIndex
CREATE INDEX "ai_tutor_sessions_status_idx" ON "ai_tutor_sessions"("status");

-- CreateIndex
CREATE INDEX "classroom_participants_classroomId_idx" ON "classroom_participants"("classroomId");

-- CreateIndex
CREATE INDEX "classroom_participants_userId_idx" ON "classroom_participants"("userId");

-- CreateIndex
CREATE INDEX "classroom_chats_classroomId_idx" ON "classroom_chats"("classroomId");

-- CreateIndex
CREATE INDEX "classroom_chats_createdAt_idx" ON "classroom_chats"("createdAt");

-- CreateIndex
CREATE INDEX "class_recordings_classroomId_idx" ON "class_recordings"("classroomId");

-- AddForeignKey
ALTER TABLE "ai_tutor_sessions" ADD CONSTRAINT "ai_tutor_sessions_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "virtual_classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_participants" ADD CONSTRAINT "classroom_participants_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "virtual_classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_chats" ADD CONSTRAINT "classroom_chats_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "virtual_classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_recordings" ADD CONSTRAINT "class_recordings_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "virtual_classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
