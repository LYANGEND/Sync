ALTER TABLE "class_fee_assignments"
ADD COLUMN "academicTermId" TEXT,
ADD COLUMN "categoryId" TEXT;

UPDATE "class_fee_assignments" cfa
SET
  "academicTermId" = ft."academicTermId",
  "categoryId" = ft."categoryId"
FROM "fee_templates" ft
WHERE ft."id" = cfa."feeTemplateId";

ALTER TABLE "class_fee_assignments"
ALTER COLUMN "academicTermId" SET NOT NULL;

CREATE INDEX "class_fee_assignments_academicTermId_idx" ON "class_fee_assignments"("academicTermId");
CREATE INDEX "class_fee_assignments_categoryId_idx" ON "class_fee_assignments"("categoryId");
CREATE UNIQUE INDEX "class_fee_assignments_classId_academicTermId_categoryId_key"
ON "class_fee_assignments"("classId", "academicTermId", "categoryId");

ALTER TABLE "class_fee_assignments" ADD CONSTRAINT "class_fee_assignments_academicTermId_fkey"
FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_fee_assignments" ADD CONSTRAINT "class_fee_assignments_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "fee_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;