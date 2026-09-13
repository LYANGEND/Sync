-- CreateTable
CREATE TABLE "platform_whatsapp_settings" (
    "id" TEXT NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT,
    "apiKey" TEXT,
    "phoneId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_whatsapp_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_whatsapp_settings_singleton_key" ON "platform_whatsapp_settings"("singleton");

-- CreateTable
CREATE TABLE "platform_lenco_settings" (
    "id" TEXT NOT NULL,
    "singleton" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apiKey" TEXT,
    "environment" TEXT DEFAULT 'sandbox',
    "defaultBearer" TEXT DEFAULT 'merchant',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_lenco_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_lenco_settings_singleton_key" ON "platform_lenco_settings"("singleton");
