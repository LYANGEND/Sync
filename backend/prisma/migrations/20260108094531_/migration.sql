-- AlterTable
ALTER TABLE "contact_submissions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "platform_users" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subscription_plans" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "updatedAt" DROP DEFAULT;
