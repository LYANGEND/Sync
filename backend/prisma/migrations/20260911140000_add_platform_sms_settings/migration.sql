-- CreateTable
CREATE TABLE "platform_sms_settings" (
    "id" TEXT NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "senderId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_sms_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_sms_settings_singleton_key" ON "platform_sms_settings"("singleton");
