-- Webhook correlation must identify exactly one tenant without trusting caller-supplied tenant data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "mobile_money_collections"
    GROUP BY "reference"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot secure mobile money references: duplicate references exist across tenants';
  END IF;
END $$;

DROP INDEX IF EXISTS "mobile_money_collections_reference_tenantId_key";
DROP INDEX IF EXISTS "mobile_money_collections_reference_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "mobile_money_collections_reference_key"
  ON "mobile_money_collections"("reference");

CREATE TABLE IF NOT EXISTS "scheduled_job_leases" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "owner" TEXT NOT NULL,
  "lockedUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheduled_job_leases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_job_leases_name_tenantId_key"
  ON "scheduled_job_leases"("name", "tenantId");
CREATE INDEX IF NOT EXISTS "scheduled_job_leases_lockedUntil_idx"
  ON "scheduled_job_leases"("lockedUntil");
CREATE INDEX IF NOT EXISTS "scheduled_job_leases_tenantId_idx"
  ON "scheduled_job_leases"("tenantId");
