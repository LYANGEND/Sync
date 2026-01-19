-- AlterTable
ALTER TABLE "platform_settings" 
ADD COLUMN IF NOT EXISTS "azureEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "azureEmailConnectionString" TEXT,
ADD COLUMN IF NOT EXISTS "azureEmailFromAddress" TEXT,
ADD COLUMN IF NOT EXISTS "azureEmailEndpoint" TEXT,
ADD COLUMN IF NOT EXISTS "azureEmailAccessKey" TEXT;

-- Update emailProvider enum to include azure
-- Note: This is safe as it just adds a new option
