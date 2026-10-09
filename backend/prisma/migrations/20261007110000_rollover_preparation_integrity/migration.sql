-- Phase 7: target-term preparation integrity.
-- Only one non-terminal rollover may prepare a given source/target pair.
CREATE UNIQUE INDEX "term_rollovers_one_open_pair_idx"
ON "term_rollovers" ("sourceTermId", "targetTermId")
WHERE "status" IN ('DRAFT', 'PREPARING', 'PREPARED', 'READY', 'EXECUTING');

-- A completed preparation task must retain the exact target mapping used by
-- later retries, validation, cancellation, and cutover phases.
ALTER TABLE "term_rollover_tasks"
ADD CONSTRAINT "term_rollover_tasks_completed_target_check"
CHECK ("status" <> 'COMPLETED' OR "targetEntityId" IS NOT NULL);

-- Rollover events are transactional evidence and must remain append-only.
CREATE OR REPLACE FUNCTION "protect_term_rollover_events"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Term rollover events are append-only and cannot be changed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "term_rollover_events_append_only"
BEFORE UPDATE OR DELETE ON "term_rollover_events"
FOR EACH ROW EXECUTE FUNCTION "protect_term_rollover_events"();
