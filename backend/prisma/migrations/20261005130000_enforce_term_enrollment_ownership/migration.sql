-- Phase 4 requires StudentTermEnrollment to be the authoritative placement
-- record. Refuse to install the constraints if legacy rows already violate
-- class-term ownership or student lineage rather than silently rewriting them.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "student_term_enrollments" enrollment
        JOIN "classes" class_record ON class_record."id" = enrollment."classId"
        WHERE class_record."academicTermId" <> enrollment."academicTermId"
    ) THEN
        RAISE EXCEPTION 'Cannot enforce enrollment ownership: at least one enrollment references a class from another academic term.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "student_term_enrollments" enrollment
        JOIN "student_term_enrollments" source ON source."id" = enrollment."sourceEnrollmentId"
        WHERE source."studentId" <> enrollment."studentId"
           OR source."academicTermId" = enrollment."academicTermId"
    ) THEN
        RAISE EXCEPTION 'Cannot enforce enrollment lineage: source enrollment ownership is invalid.';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION "validate_student_term_enrollment_ownership"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM "classes"
        WHERE "id" = NEW."classId"
          AND "academicTermId" = NEW."academicTermId"
    ) THEN
        RAISE EXCEPTION 'Enrollment class % does not belong to academic term %', NEW."classId", NEW."academicTermId"
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_term_enrollments_class_term_check';
    END IF;

    IF NEW."sourceEnrollmentId" IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM "student_term_enrollments"
        WHERE "id" = NEW."sourceEnrollmentId"
          AND "studentId" = NEW."studentId"
          AND "academicTermId" <> NEW."academicTermId"
    ) THEN
        RAISE EXCEPTION 'Source enrollment % must belong to the same student in another academic term', NEW."sourceEnrollmentId"
            USING ERRCODE = '23514',
                  CONSTRAINT = 'student_term_enrollments_lineage_check';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "student_term_enrollments_ownership_trigger"
BEFORE INSERT OR UPDATE OF "studentId", "academicTermId", "classId", "sourceEnrollmentId"
ON "student_term_enrollments"
FOR EACH ROW
EXECUTE FUNCTION "validate_student_term_enrollment_ownership"();
