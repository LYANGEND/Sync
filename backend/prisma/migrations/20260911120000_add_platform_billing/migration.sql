-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SupportTier" AS ENUM ('BASIC', 'PRIORITY', 'DEDICATED');

-- CreateEnum
CREATE TYPE "PlatformInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'OVERDUE', 'VOID');

-- CreateTable
CREATE TABLE "platform_plan_pricing" (
    "id" TEXT NOT NULL,
    "plan" "TenantPlan" NOT NULL,
    "pricePerActiveStudent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "setupFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "setupFeeWaivedOnAnnual" BOOLEAN NOT NULL DEFAULT false,
    "aiIncludedUnits" INTEGER NOT NULL DEFAULT 0,
    "smsIncludedUnits" INTEGER NOT NULL DEFAULT 0,
    "minimumMonthlyBill" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_plan_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_billing_settings" (
    "id" TEXT NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "supportFeeBasic" DECIMAL(12,2) NOT NULL DEFAULT 150,
    "supportFeePriority" DECIMAL(12,2) NOT NULL DEFAULT 400,
    "supportFeeDedicated" DECIMAL(12,2) NOT NULL DEFAULT 900,
    "aiOverageRatePerUnit" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "smsOverageRatePerUnit" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "annualDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 16.67,
    "trialAiIncludedUnits" INTEGER NOT NULL DEFAULT 200,
    "trialSmsIncludedUnits" INTEGER NOT NULL DEFAULT 50,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_billing_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "supportTier" "SupportTier" NOT NULL DEFAULT 'BASIC',
    "setupFeeInvoiced" BOOLEAN NOT NULL DEFAULT false,
    "customPricePerStudent" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_billing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "activeStudentCount" INTEGER NOT NULL,
    "studentCharge" DECIMAL(12,2) NOT NULL,
    "setupFeeCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "supportFeeCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "aiIncludedUnits" INTEGER NOT NULL DEFAULT 0,
    "aiUsedUnits" INTEGER NOT NULL DEFAULT 0,
    "aiOverageUnits" INTEGER NOT NULL DEFAULT 0,
    "aiOverageCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "smsIncludedUnits" INTEGER NOT NULL DEFAULT 0,
    "smsUsedUnits" INTEGER NOT NULL DEFAULT 0,
    "smsOverageUnits" INTEGER NOT NULL DEFAULT 0,
    "smsOverageCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "PlatformInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_plan_pricing_plan_key" ON "platform_plan_pricing"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "platform_billing_settings_singleton_key" ON "platform_billing_settings"("singleton");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_profiles_tenantId_key" ON "tenant_billing_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "platform_invoices_tenantId_idx" ON "platform_invoices"("tenantId");

-- CreateIndex
CREATE INDEX "platform_invoices_status_idx" ON "platform_invoices"("status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoices_tenantId_periodStart_periodEnd_key" ON "platform_invoices"("tenantId", "periodStart", "periodEnd");
