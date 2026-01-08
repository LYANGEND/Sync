/*
  Warnings:

  - You are about to drop the column `currency` on the `subscription_plans` table. All the data in the column will be lost.
  - You are about to drop the column `monthlyPrice` on the `subscription_plans` table. All the data in the column will be lost.
  - You are about to drop the column `yearlyPrice` on the `subscription_plans` table. All the data in the column will be lost.
  - Added the required column `includedStudents` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monthlyPriceUSD` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monthlyPriceZMW` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `yearlyPriceUSD` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.
  - Added the required column `yearlyPriceZMW` to the `subscription_plans` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- AlterTable
ALTER TABLE "subscription_plans" DROP COLUMN "currency",
DROP COLUMN "monthlyPrice",
DROP COLUMN "yearlyPrice",
ADD COLUMN     "includedEmailsPerMonth" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "includedSmsPerMonth" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "includedStudents" INTEGER NOT NULL,
ADD COLUMN     "monthlyPriceUSD" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "monthlyPriceZMW" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "pricePerStudentUSD" DECIMAL(10,2) NOT NULL DEFAULT 0.74,
ADD COLUMN     "pricePerStudentZMW" DECIMAL(10,2) NOT NULL DEFAULT 20,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "yearlyPriceUSD" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "yearlyPriceZMW" DECIMAL(10,2) NOT NULL;

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "baseAmount" DECIMAL(10,2) NOT NULL,
    "studentCount" INTEGER NOT NULL,
    "overageStudents" INTEGER NOT NULL DEFAULT 0,
    "overageAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "paymentMethod" TEXT NOT NULL,
    "externalRef" TEXT,
    "receiptNumber" TEXT,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "invoiceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_receiptNumber_key" ON "subscription_payments"("receiptNumber");

-- CreateIndex
CREATE INDEX "subscription_payments_tenantId_idx" ON "subscription_payments"("tenantId");

-- CreateIndex
CREATE INDEX "subscription_payments_status_idx" ON "subscription_payments"("status");

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
