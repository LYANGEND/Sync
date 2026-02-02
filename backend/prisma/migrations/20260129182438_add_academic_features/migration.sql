-- CreateTable
CREATE TABLE "curriculum_standards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "domain" TEXT,
    "cluster" TEXT,
    "description" TEXT NOT NULL,
    "fullText" TEXT,
    "prerequisites" TEXT[],
    "nextStandards" TEXT[],
    "bloomsLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_standards" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "standardId" TEXT NOT NULL,
    "alignment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lesson_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blooms_questions" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "bloomsLevel" TEXT NOT NULL,
    "dokLevel" INTEGER,
    "questionType" TEXT NOT NULL,
    "correctAnswer" TEXT,
    "distractors" TEXT[],
    "rubric" JSONB,
    "difficulty" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blooms_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "differentiated_content" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "originalContent" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "modifications" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "differentiated_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "common_misconceptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "misconception" TEXT NOT NULL,
    "whyItHappens" TEXT NOT NULL,
    "intervention" TEXT NOT NULL,
    "checkQuestions" TEXT[],
    "resources" JSONB,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "common_misconceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_vocabulary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "gradeLevel" INTEGER NOT NULL,
    "definition" TEXT NOT NULL,
    "studentFriendly" TEXT NOT NULL,
    "examples" TEXT[],
    "nonExamples" TEXT[],
    "visualUrl" TEXT,
    "synonyms" TEXT[],
    "relatedWords" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_vocabulary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "curriculum_standards_tenantId_idx" ON "curriculum_standards"("tenantId");

-- CreateIndex
CREATE INDEX "curriculum_standards_framework_idx" ON "curriculum_standards"("framework");

-- CreateIndex
CREATE INDEX "curriculum_standards_subject_idx" ON "curriculum_standards"("subject");

-- CreateIndex
CREATE INDEX "curriculum_standards_gradeLevel_idx" ON "curriculum_standards"("gradeLevel");

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_standards_tenantId_code_framework_key" ON "curriculum_standards"("tenantId", "code", "framework");

-- CreateIndex
CREATE INDEX "lesson_standards_conversationId_idx" ON "lesson_standards"("conversationId");

-- CreateIndex
CREATE INDEX "lesson_standards_standardId_idx" ON "lesson_standards"("standardId");

-- CreateIndex
CREATE INDEX "blooms_questions_conversationId_idx" ON "blooms_questions"("conversationId");

-- CreateIndex
CREATE INDEX "blooms_questions_bloomsLevel_idx" ON "blooms_questions"("bloomsLevel");

-- CreateIndex
CREATE INDEX "differentiated_content_conversationId_idx" ON "differentiated_content"("conversationId");

-- CreateIndex
CREATE INDEX "differentiated_content_level_idx" ON "differentiated_content"("level");

-- CreateIndex
CREATE INDEX "common_misconceptions_tenantId_idx" ON "common_misconceptions"("tenantId");

-- CreateIndex
CREATE INDEX "common_misconceptions_subject_idx" ON "common_misconceptions"("subject");

-- CreateIndex
CREATE INDEX "common_misconceptions_topic_idx" ON "common_misconceptions"("topic");

-- CreateIndex
CREATE INDEX "common_misconceptions_gradeLevel_idx" ON "common_misconceptions"("gradeLevel");

-- CreateIndex
CREATE INDEX "academic_vocabulary_tenantId_idx" ON "academic_vocabulary"("tenantId");

-- CreateIndex
CREATE INDEX "academic_vocabulary_subject_idx" ON "academic_vocabulary"("subject");

-- CreateIndex
CREATE INDEX "academic_vocabulary_gradeLevel_idx" ON "academic_vocabulary"("gradeLevel");

-- CreateIndex
CREATE INDEX "academic_vocabulary_tier_idx" ON "academic_vocabulary"("tier");

-- AddForeignKey
ALTER TABLE "curriculum_standards" ADD CONSTRAINT "curriculum_standards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_standards" ADD CONSTRAINT "lesson_standards_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "teacher_ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_standards" ADD CONSTRAINT "lesson_standards_standardId_fkey" FOREIGN KEY ("standardId") REFERENCES "curriculum_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blooms_questions" ADD CONSTRAINT "blooms_questions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "teacher_ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "differentiated_content" ADD CONSTRAINT "differentiated_content_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "teacher_ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "common_misconceptions" ADD CONSTRAINT "common_misconceptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_vocabulary" ADD CONSTRAINT "academic_vocabulary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
