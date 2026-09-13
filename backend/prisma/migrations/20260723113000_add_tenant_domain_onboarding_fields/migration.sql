-- Add tenant domain verification and onboarding fields that existed in the Prisma
-- model but were missing from the historical migration chain.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantDomainStatus') THEN
    CREATE TYPE "TenantDomainStatus" AS ENUM ('NONE', 'PENDING_DNS', 'PENDING_VERIFICATION', 'VERIFIED', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TenantOnboardingStatus') THEN
    CREATE TYPE "TenantOnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'READY_TO_LAUNCH', 'LIVE', 'BLOCKED');
  END IF;
END $$;

ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "domainStatus" "TenantDomainStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "domainDnsTarget" TEXT,
  ADD COLUMN IF NOT EXISTS "domainVerificationToken" TEXT,
  ADD COLUMN IF NOT EXISTS "domainRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "domainVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "domainLastCheckedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingStatus" "TenantOnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN IF NOT EXISTS "onboardingChecklist" JSONB,
  ADD COLUMN IF NOT EXISTS "onboardingOwner" TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "onboardingStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "tenants_domain_key" ON "tenants"("domain");
