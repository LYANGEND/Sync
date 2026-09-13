-- Enforce one normalized class name per tenant, term, and branch.
-- Global classes (branchId IS NULL) are kept in a separate identity scope.
-- Fail before changing the schema when legacy conflicts require manual review.

DO $migration$
DECLARE
	conflict_groups BIGINT;
BEGIN
	SELECT COUNT(*)
	INTO conflict_groups
	FROM (
		SELECT
			"tenantId",
			"academicTermId",
			"branchId",
			LOWER(BTRIM("name")) AS normalized_name
		FROM "classes"
		GROUP BY
			"tenantId",
			"academicTermId",
			"branchId",
			LOWER(BTRIM("name"))
		HAVING COUNT(*) > 1
	) AS conflicts;

	IF conflict_groups > 0 THEN
		RAISE EXCEPTION USING
			MESSAGE = FORMAT(
				'Cannot add class identity indexes: %s duplicate group(s) require review.',
				conflict_groups
			),
			HINT = 'Run npm run preflight:class-uniqueness and resolve the reported class IDs before deploying migrations.';
	END IF;
END
$migration$;

CREATE UNIQUE INDEX "classes_tenant_term_global_normalized_name_key"
ON "classes" ("tenantId", "academicTermId", LOWER(BTRIM("name")))
WHERE "branchId" IS NULL;

CREATE UNIQUE INDEX "classes_tenant_term_branch_normalized_name_key"
ON "classes" ("tenantId", "academicTermId", "branchId", LOWER(BTRIM("name")))
WHERE "branchId" IS NOT NULL;
