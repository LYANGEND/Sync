-- Phase 8 transition decisions are the auditable source for every staged
-- rollover outcome. Refuse to install stronger constraints over ambiguous data.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "student_transition_decisions" decision
        LEFT JOIN "term_rollovers" rollover ON rollover."id" = decision."rolloverId"
        LEFT JOIN "student_term_enrollments" source_enrollment
          ON source_enrollment."id" = decision."sourceEnrollmentId"
        WHERE decision."sourceEnrollmentId" IS NULL
           OR rollover."id" IS NULL
           OR source_enrollment."id" IS NULL
           OR source_enrollment."studentId" <> decision."studentId"
           OR source_enrollment."academicTermId" <> rollover."sourceTermId"
    ) THEN
        RAISE EXCEPTION 'Cannot enforce rollover decisions: a decision has invalid source enrollment ownership.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "student_transition_decisions" decision
        LEFT JOIN "term_rollovers" rollover ON rollover."id" = decision."rolloverId"
        LEFT JOIN "classes" target_class ON target_class."id" = decision."targetClassId"
        WHERE (
            decision."action" IN ('CARRY_FORWARD', 'PROMOTE', 'RETAIN')
            AND (
                decision."targetClassId" IS NULL
                OR target_class."id" IS NULL
                OR target_class."academicTermId" <> rollover."targetTermId"
            )
        ) OR (
            decision."action" IN ('GRADUATE', 'TRANSFER', 'WITHDRAW')
            AND decision."targetClassId" IS NOT NULL
        )
    ) THEN
        RAISE EXCEPTION 'Cannot enforce rollover decisions: an existing action has an invalid target class.';
    END IF;
END $$;

ALTER TABLE "student_transition_decisions"
DROP CONSTRAINT "student_transition_decisions_sourceEnrollmentId_fkey";

ALTER TABLE "student_transition_decisions"
ALTER COLUMN "sourceEnrollmentId" SET NOT NULL;

ALTER TABLE "student_transition_decisions"
ADD CONSTRAINT "student_transition_decisions_sourceEnrollmentId_fkey"
FOREIGN KEY ("sourceEnrollmentId") REFERENCES "student_term_enrollments"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "student_transition_decisions_rolloverId_sourceEnrollmentId_key"
ON "student_transition_decisions"("rolloverId", "sourceEnrollmentId");

CREATE OR REPLACE FUNCTION "validate_student_transition_decision"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    rollover_record RECORD;
    source_record RECORD;
    target_record RECORD;
BEGIN
    SELECT "sourceTermId", "targetTermId", "transitionType"
      INTO rollover_record
      FROM "term_rollovers"
     WHERE "id" = NEW."rolloverId";

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rollover % does not exist', NEW."rolloverId"
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_rollover_check';
    END IF;

    SELECT enrollment."studentId",
           enrollment."academicTermId",
           enrollment."status",
           enrollment."classId",
           source_class."gradeLevel",
           source_class."branchId",
           source_class."classCohortId"
      INTO source_record
      FROM "student_term_enrollments" enrollment
      JOIN "classes" source_class ON source_class."id" = enrollment."classId"
     WHERE enrollment."id" = NEW."sourceEnrollmentId";

    IF NOT FOUND
       OR source_record."studentId" <> NEW."studentId"
       OR source_record."academicTermId" <> rollover_record."sourceTermId"
       OR source_record."status" <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Decision source enrollment % must be the student active enrollment in the rollover source term', NEW."sourceEnrollmentId"
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_source_check';
    END IF;

    IF rollover_record."transitionType" = 'WITHIN_YEAR'
       AND NEW."action" <> 'CARRY_FORWARD' THEN
        RAISE EXCEPTION 'Within-year rollover decisions must carry forward'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_action_check';
    END IF;

    IF rollover_record."transitionType" = 'YEAR_END'
       AND NEW."action" = 'CARRY_FORWARD' THEN
        RAISE EXCEPTION 'Year-end rollover decisions must be explicit promote, retain, or terminal outcomes'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_action_check';
    END IF;

    IF NEW."action" IN ('GRADUATE', 'TRANSFER', 'WITHDRAW') THEN
        IF NEW."targetClassId" IS NOT NULL THEN
            RAISE EXCEPTION 'Terminal rollover action % cannot have a target class', NEW."action"
                USING ERRCODE = '23514',
                      CONSTRAINT = 'student_transition_decisions_target_check';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW."targetClassId" IS NULL THEN
        RAISE EXCEPTION 'Rollover action % requires a target class', NEW."action"
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_target_check';
    END IF;

    SELECT target_class."academicTermId",
           target_class."gradeLevel",
           target_class."branchId",
           target_class."classCohortId",
           target_cohort."academicYearId" AS "cohortAcademicYearId",
           target_cohort."predecessorCohortId"
      INTO target_record
      FROM "classes" target_class
      LEFT JOIN "class_cohorts" target_cohort ON target_cohort."id" = target_class."classCohortId"
     WHERE target_class."id" = NEW."targetClassId";

    IF NOT FOUND OR target_record."academicTermId" <> rollover_record."targetTermId" THEN
        RAISE EXCEPTION 'Decision target class % must belong to the rollover target term', NEW."targetClassId"
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_target_check';
    END IF;

    IF target_record."branchId" IS DISTINCT FROM source_record."branchId" THEN
        RAISE EXCEPTION 'Decision target class must remain in the source branch'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_target_check';
    END IF;

    IF NEW."action" = 'CARRY_FORWARD' AND (
        target_record."classCohortId" IS NULL
        OR target_record."classCohortId" IS DISTINCT FROM source_record."classCohortId"
        OR target_record."gradeLevel" <> source_record."gradeLevel"
    ) THEN
        RAISE EXCEPTION 'Carry-forward target must be the same logical cohort and grade'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_target_check';
    END IF;

    IF NEW."action" = 'PROMOTE' AND (
        source_record."classCohortId" IS NULL
        OR target_record."classCohortId" IS NULL
        OR target_record."predecessorCohortId" IS DISTINCT FROM source_record."classCohortId"
        OR target_record."gradeLevel" <> source_record."gradeLevel" + 1
    ) THEN
        RAISE EXCEPTION 'Promotion target must be the approved next-grade successor cohort'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_target_check';
    END IF;

    IF NEW."action" = 'RETAIN' AND (
        target_record."classCohortId" IS NULL
        OR target_record."gradeLevel" <> source_record."gradeLevel"
    ) THEN
        RAISE EXCEPTION 'Retention target must be a target-year cohort at the same grade'
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_transition_decisions_target_check';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "student_transition_decisions_integrity_trigger"
BEFORE INSERT OR UPDATE OF "rolloverId", "studentId", "sourceEnrollmentId", "targetClassId", "action"
ON "student_transition_decisions"
FOR EACH ROW
EXECUTE FUNCTION "validate_student_transition_decision"();
