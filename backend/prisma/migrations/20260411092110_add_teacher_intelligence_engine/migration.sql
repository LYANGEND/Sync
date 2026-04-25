-- CreateTable
CREATE TABLE "learning_objective_mastery" (
    "id" TEXT NOT NULL,
    "studentId" TEXT,
    "classId" TEXT NOT NULL,
    "learning_objective_id" TEXT NOT NULL,
    "masteryScore" DECIMAL(5,2) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAssessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'SECURE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_objective_mastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "misconception_patterns" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "subTopicId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "wrongAnswer" TEXT,
    "studentCount" INTEGER NOT NULL,
    "isAddressed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "misconception_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_teacher_actions" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "draftPayload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_teacher_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intervention_records" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subTopicId" TEXT NOT NULL,
    "studentIds" TEXT[],
    "strategyUsed" TEXT NOT NULL,
    "notes" TEXT,
    "preInterventionScore" DECIMAL(5,2),
    "postInterventionScore" DECIMAL(5,2),
    "effectiveness" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intervention_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "learning_objective_mastery_classId_idx" ON "learning_objective_mastery"("classId");

-- CreateIndex
CREATE INDEX "learning_objective_mastery_status_idx" ON "learning_objective_mastery"("status");

-- CreateIndex
CREATE UNIQUE INDEX "learning_objective_mastery_studentId_learning_objective_id_key" ON "learning_objective_mastery"("studentId", "learning_objective_id");

-- CreateIndex
CREATE INDEX "misconception_patterns_assessmentId_idx" ON "misconception_patterns"("assessmentId");

-- CreateIndex
CREATE INDEX "misconception_patterns_subTopicId_idx" ON "misconception_patterns"("subTopicId");

-- CreateIndex
CREATE INDEX "pending_teacher_actions_teacherId_idx" ON "pending_teacher_actions"("teacherId");

-- CreateIndex
CREATE INDEX "pending_teacher_actions_actionType_idx" ON "pending_teacher_actions"("actionType");

-- CreateIndex
CREATE INDEX "pending_teacher_actions_status_idx" ON "pending_teacher_actions"("status");

-- CreateIndex
CREATE INDEX "intervention_records_teacherId_idx" ON "intervention_records"("teacherId");

-- CreateIndex
CREATE INDEX "intervention_records_classId_idx" ON "intervention_records"("classId");

-- CreateIndex
CREATE INDEX "intervention_records_effectiveness_idx" ON "intervention_records"("effectiveness");

-- AddForeignKey
ALTER TABLE "learning_objective_mastery" ADD CONSTRAINT "learning_objective_mastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_objective_mastery" ADD CONSTRAINT "learning_objective_mastery_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_objective_mastery" ADD CONSTRAINT "learning_objective_mastery_learning_objective_id_fkey" FOREIGN KEY ("learning_objective_id") REFERENCES "sub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "misconception_patterns" ADD CONSTRAINT "misconception_patterns_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "misconception_patterns" ADD CONSTRAINT "misconception_patterns_subTopicId_fkey" FOREIGN KEY ("subTopicId") REFERENCES "sub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_teacher_actions" ADD CONSTRAINT "pending_teacher_actions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_teacher_actions" ADD CONSTRAINT "pending_teacher_actions_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_records" ADD CONSTRAINT "intervention_records_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_records" ADD CONSTRAINT "intervention_records_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention_records" ADD CONSTRAINT "intervention_records_subTopicId_fkey" FOREIGN KEY ("subTopicId") REFERENCES "sub_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
