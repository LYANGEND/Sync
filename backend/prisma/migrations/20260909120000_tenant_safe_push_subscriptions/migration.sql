-- T-022 / F-010: make push subscriptions tenant-addressable while preserving
-- exclusive browser-endpoint ownership through the application claim service.

-- Repair legacy rows before enforcing the composite user/tenant relationship.
UPDATE "push_subscriptions" AS subscription
SET "tenantId" = app_user."tenantId"
FROM "users" AS app_user
WHERE subscription."userId" = app_user."id"
  AND subscription."tenantId" IS DISTINCT FROM app_user."tenantId";

-- Track claims/reassignments so operators can identify stale device bindings.
ALTER TABLE "push_subscriptions"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The tenant-aware relation prevents a subscription from pointing at a user in
-- another tenant. The additional user key is required by PostgreSQL for the
-- composite foreign key target.
CREATE UNIQUE INDEX "users_id_tenantId_key"
ON "users"("id", "tenantId");

ALTER TABLE "push_subscriptions"
DROP CONSTRAINT "push_subscriptions_userId_fkey";

ALTER TABLE "push_subscriptions"
ADD CONSTRAINT "push_subscriptions_userId_tenantId_fkey"
FOREIGN KEY ("userId", "tenantId")
REFERENCES "users"("id", "tenantId")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Replace the accidental global endpoint identity with the tenant-aware key.
-- The claim service serializes by endpoint and removes prior ownership before
-- inserting/updating, so one browser endpoint still has only one active owner.
DROP INDEX "push_subscriptions_endpoint_key";

CREATE UNIQUE INDEX "push_subscriptions_tenantId_endpoint_key"
ON "push_subscriptions"("tenantId", "endpoint");

CREATE INDEX "push_subscriptions_tenantId_userId_idx"
ON "push_subscriptions"("tenantId", "userId");
