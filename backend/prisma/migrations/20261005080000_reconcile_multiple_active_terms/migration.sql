-- Legacy data can have several terms flagged isActive. The term lifecycle
-- migration that follows requires at most one, so keep the term the school
-- settings point to (or else the latest-starting active term) and deactivate
-- the rest. No-op when zero or one term is active.
WITH keeper AS (
    SELECT t."id"
    FROM "academic_terms" t
    WHERE t."isActive"
    ORDER BY
        (t."id" = (SELECT s."currentTermId" FROM "school_settings" s LIMIT 1)) DESC NULLS LAST,
        t."startDate" DESC,
        t."id" DESC
    LIMIT 1
)
UPDATE "academic_terms"
SET "isActive" = false
WHERE "isActive"
  AND "id" NOT IN (SELECT "id" FROM keeper);
