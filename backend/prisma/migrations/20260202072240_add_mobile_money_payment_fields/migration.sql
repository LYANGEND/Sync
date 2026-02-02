-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "mobileMoneyConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "mobileMoneyFee" DECIMAL(10,2),
ADD COLUMN     "mobileMoneyOperator" TEXT,
ADD COLUMN     "mobileMoneyPhone" TEXT,
ADD COLUMN     "mobileMoneyRef" TEXT,
ADD COLUMN     "mobileMoneyStatus" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "aiAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiAssessmentsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiLessonPlanEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiReportCardsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiTutorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "payments_mobileMoneyRef_idx" ON "payments"("mobileMoneyRef");
