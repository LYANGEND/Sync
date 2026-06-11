/*
  Warnings:

  - A unique constraint covering the columns `[studentId,feeTemplateId,academicTermId]` on the table `student_fee_structures` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `academicTermId` to the `student_fee_structures` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "student_fee_structures_studentId_feeTemplateId_key";

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "academicTermId" TEXT;

-- AlterTable
ALTER TABLE "student_fee_structures" ADD COLUMN     "academicTermId" TEXT;

-- Backfill term from linked fee template to avoid hardcoded/nonexistent IDs
UPDATE "student_fee_structures" sfs
SET "academicTermId" = ft."academicTermId"
FROM "fee_templates" ft
WHERE ft."id" = sfs."feeTemplateId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "student_fee_structures"
    WHERE "academicTermId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot set student_fee_structures.academicTermId because some rows are missing linked fee_templates.';
  END IF;
END $$;

-- AlterTable
ALTER TABLE "student_fee_structures" ALTER COLUMN "academicTermId" SET NOT NULL;

-- CreateTable
CREATE TABLE "term_financial_summaries" (
    "id" TEXT NOT NULL,
    "academicTermId" TEXT NOT NULL,
    "branchId" TEXT,
    "totalFeesExpected" DECIMAL(12,2) NOT NULL,
    "totalFeesCollected" DECIMAL(12,2) NOT NULL,
    "totalOutstanding" DECIMAL(12,2) NOT NULL,
    "collectionRate" DECIMAL(5,2) NOT NULL,
    "cashCollected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mobileMoneyCollected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bankCollected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalStudents" INTEGER NOT NULL,
    "studentsFullyPaid" INTEGER NOT NULL,
    "studentsPartiallyPaid" INTEGER NOT NULL,
    "studentsNotPaid" INTEGER NOT NULL,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_financial_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "term_financial_summaries_academicTermId_idx" ON "term_financial_summaries"("academicTermId");

-- CreateIndex
CREATE UNIQUE INDEX "term_financial_summaries_academicTermId_branchId_key" ON "term_financial_summaries"("academicTermId", "branchId");

-- CreateIndex
CREATE INDEX "payments_studentId_academicTermId_idx" ON "payments"("studentId", "academicTermId");

-- CreateIndex
CREATE INDEX "payments_academicTermId_paymentDate_idx" ON "payments"("academicTermId", "paymentDate");

-- CreateIndex
CREATE INDEX "student_fee_structures_academicTermId_idx" ON "student_fee_structures"("academicTermId");

-- CreateIndex
CREATE INDEX "student_fee_structures_studentId_academicTermId_idx" ON "student_fee_structures"("studentId", "academicTermId");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_structures_studentId_feeTemplateId_academicTerm_key" ON "student_fee_structures"("studentId", "feeTemplateId", "academicTermId");

-- AddForeignKey
ALTER TABLE "student_fee_structures" ADD CONSTRAINT "student_fee_structures_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_financial_summaries" ADD CONSTRAINT "term_financial_summaries_academicTermId_fkey" FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_financial_summaries" ADD CONSTRAINT "term_financial_summaries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
