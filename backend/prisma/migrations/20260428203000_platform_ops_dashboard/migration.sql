-- Allow common branch codes such as MAIN to be reused by different tenants.
DROP INDEX IF EXISTS "branches_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "branches_code_tenantId_key" ON "branches"("code", "tenantId");
