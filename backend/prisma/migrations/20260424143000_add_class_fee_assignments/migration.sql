CREATE TABLE "class_fee_assignments" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "feeTemplateId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_fee_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_fee_assignments_classId_feeTemplateId_key" ON "class_fee_assignments"("classId", "feeTemplateId");
CREATE INDEX "class_fee_assignments_classId_idx" ON "class_fee_assignments"("classId");
CREATE INDEX "class_fee_assignments_feeTemplateId_idx" ON "class_fee_assignments"("feeTemplateId");

ALTER TABLE "class_fee_assignments" ADD CONSTRAINT "class_fee_assignments_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_fee_assignments" ADD CONSTRAINT "class_fee_assignments_feeTemplateId_fkey"
FOREIGN KEY ("feeTemplateId") REFERENCES "fee_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;