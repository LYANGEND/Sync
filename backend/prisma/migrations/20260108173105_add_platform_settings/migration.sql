-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "smsProvider" TEXT NOT NULL DEFAULT 'zamtel',
    "smsApiUrl" TEXT,
    "smsApiKey" TEXT,
    "smsApiSecret" TEXT,
    "smsDefaultSenderId" TEXT DEFAULT 'SYNC',
    "smsBalanceUnits" INTEGER NOT NULL DEFAULT 0,
    "smsCostPerUnit" DECIMAL(10,4) NOT NULL DEFAULT 0.15,
    "emailProvider" TEXT NOT NULL DEFAULT 'smtp',
    "emailApiKey" TEXT,
    "emailFromAddress" TEXT,
    "emailFromName" TEXT DEFAULT 'Sync School Management',
    "platformName" TEXT NOT NULL DEFAULT 'Sync School Management',
    "platformLogoUrl" TEXT,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "allowTenantCustomSms" BOOLEAN NOT NULL DEFAULT false,
    "allowTenantCustomEmail" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);
