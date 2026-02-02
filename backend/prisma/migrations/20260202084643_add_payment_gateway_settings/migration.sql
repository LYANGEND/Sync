-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "allowedOrigins" JSONB NOT NULL DEFAULT '["http://localhost:5173", "http://localhost:3000"]',
ADD COLUMN     "allowedPaymentMethods" JSONB NOT NULL DEFAULT '["CASH", "MOBILE_MONEY", "BANK_DEPOSIT"]',
ADD COLUMN     "mobileMoneyEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mobileMoneyFeeCap" DECIMAL(10,2),
ADD COLUMN     "mobileMoneyFeePercent" DECIMAL(5,4) NOT NULL DEFAULT 0.025,
ADD COLUMN     "paymentApiRateLimitPerMinute" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "paymentGatewayProvider" TEXT NOT NULL DEFAULT 'lenco',
ADD COLUMN     "publicApiRateLimitPerMinute" INTEGER NOT NULL DEFAULT 30;
