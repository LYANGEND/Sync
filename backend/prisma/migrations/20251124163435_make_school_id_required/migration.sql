/*
  Warnings:

  - You are about to drop the `school_settings` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[admissionNumber,schoolId]` on the table `students` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[code,schoolId]` on the table `subjects` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[email,schoolId]` on the table `users` will be added. If there are existing duplicate values, this will fail.
  - Made the column `schoolId` on table `academic_terms` required. This step will fail if there are existing NULL values in that column.
  - Made the column `schoolId` on table `classes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `schoolId` on table `fee_templates` required. This step will fail if there are existing NULL values in that column.
  - Made the column `schoolId` on table `grading_scales` required. This step will fail if there are existing NULL values in that column.
  - Made the column `schoolId` on table `notifications` required. This step will fail if there are existing NULL values in that column.
  - Made the column `schoolId` on table `scholarships` required. This step will fail if there are existing NULL values in that column.
  - Made the column `schoolId` on table `students` required. This step will fail if there are existing NULL values in that column.
  - Made the column `schoolId` on table `subjects` required. This step will fail if there are existing NULL values in that column.
  - Made the column `schoolId` on table `users` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "academic_terms" DROP CONSTRAINT "academic_terms_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "classes" DROP CONSTRAINT "classes_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "fee_templates" DROP CONSTRAINT "fee_templates_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "grading_scales" DROP CONSTRAINT "grading_scales_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "scholarships" DROP CONSTRAINT "scholarships_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "school_settings" DROP CONSTRAINT "school_settings_currentTermId_fkey";

-- DropForeignKey
ALTER TABLE "students" DROP CONSTRAINT "students_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_schoolId_fkey";

-- DropIndex
DROP INDEX "students_admissionNumber_key";

-- DropIndex
DROP INDEX "subjects_code_key";

-- DropIndex
DROP INDEX "users_email_key";

-- AlterTable
ALTER TABLE "academic_terms" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "classes" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "fee_templates" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "grading_scales" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "scholarships" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "students" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "subjects" ALTER COLUMN "schoolId" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "schoolId" SET NOT NULL;

-- DropTable
DROP TABLE "school_settings";

-- CreateIndex
CREATE UNIQUE INDEX "students_admissionNumber_schoolId_key" ON "students"("admissionNumber", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_schoolId_key" ON "subjects"("code", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_schoolId_key" ON "users"("email", "schoolId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_terms" ADD CONSTRAINT "academic_terms_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_templates" ADD CONSTRAINT "fee_templates_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_scales" ADD CONSTRAINT "grading_scales_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
