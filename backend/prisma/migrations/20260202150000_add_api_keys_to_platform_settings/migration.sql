-- Add Lenco Payment Gateway API Keys
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "lencoApiKey" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "lencoApiToken" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "lencoWebhookSecret" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "lencoApiUrl" TEXT DEFAULT 'https://api.lenco.co/access/v2/collections/mobile-money';
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "lencoTestMode" BOOLEAN DEFAULT false;

-- Add Azure OpenAI API Keys
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "azureOpenaiEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "azureOpenaiApiKey" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "azureOpenaiEndpoint" TEXT;
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "azureOpenaiApiVersion" TEXT DEFAULT '2024-12-01-preview';
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "azureOpenaiDeployment" TEXT DEFAULT 'gpt-4o';
