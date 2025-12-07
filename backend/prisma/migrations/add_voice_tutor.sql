-- Voice AI Tutor Migration
-- Add tables for voice tutoring functionality

-- Voice Sessions table
CREATE TABLE "voice_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL,
    "topicId" TEXT,
    "subjectId" TEXT,
    "startedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP,
    "duration" INTEGER,
    
    CONSTRAINT "voice_sessions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE,
    CONSTRAINT "voice_sessions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL,
    CONSTRAINT "voice_sessions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL
);

-- Voice Messages table
CREATE TABLE "voice_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "audioUrl" TEXT,
    "transcription" TEXT NOT NULL,
    "response" TEXT,
    "responseAudioUrl" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "duration" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "voice_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "voice_sessions"("id") ON DELETE CASCADE
);

-- Tutor Context table
CREATE TABLE "tutor_context" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "studentId" TEXT NOT NULL UNIQUE,
    "currentTopic" TEXT,
    "recentTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "learningStyle" TEXT,
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "weakAreas" JSONB,
    "strengths" JSONB,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "tutor_context_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE
);

-- AI Content table
CREATE TABLE "ai_content" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT,
    "contentType" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "generatedContent" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "ai_content_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL,
    CONSTRAINT "ai_content_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX "voice_sessions_studentId_idx" ON "voice_sessions"("studentId");
CREATE INDEX "voice_sessions_startedAt_idx" ON "voice_sessions"("startedAt");
CREATE INDEX "voice_messages_sessionId_idx" ON "voice_messages"("sessionId");
CREATE INDEX "voice_messages_createdAt_idx" ON "voice_messages"("createdAt");
CREATE INDEX "ai_content_topicId_idx" ON "ai_content"("topicId");
CREATE INDEX "ai_content_subjectId_idx" ON "ai_content"("subjectId");
