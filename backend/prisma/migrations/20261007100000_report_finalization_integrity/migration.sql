-- Phase 6: immutable report snapshots and lifecycle integrity.

-- Existing lifecycle data must be internally consistent before hard enforcement.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "student_term_reports"
    WHERE ("status" = 'DRAFT' AND ("finalizedAt" IS NOT NULL OR "publishedAt" IS NOT NULL))
       OR ("status" = 'FINALIZED' AND "finalizedAt" IS NULL)
       OR ("status" = 'PUBLISHED' AND ("finalizedAt" IS NULL OR "publishedAt" IS NULL))
       OR "currentVersion" < 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce report lifecycle integrity: inconsistent student term report rows exist.';
  END IF;
END $$;

ALTER TABLE "student_term_reports"
ADD CONSTRAINT "student_term_reports_version_check"
CHECK ("currentVersion" > 0),
ADD CONSTRAINT "student_term_reports_lifecycle_check"
CHECK (
  ("status" = 'DRAFT' AND "finalizedAt" IS NULL AND "publishedAt" IS NULL)
  OR ("status" = 'FINALIZED' AND "finalizedAt" IS NOT NULL AND "publishedAt" IS NULL)
  OR ("status" = 'PUBLISHED' AND "finalizedAt" IS NOT NULL AND "publishedAt" IS NOT NULL)
);

ALTER TABLE "student_term_report_versions"
ADD CONSTRAINT "student_term_report_versions_version_check"
CHECK ("version" > 0),
ADD CONSTRAINT "student_term_report_versions_finalized_check"
CHECK ("status" IN ('FINALIZED', 'PUBLISHED'));

CREATE OR REPLACE FUNCTION "protect_student_term_report_versions"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Student term report versions are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "student_term_report_versions_immutable_update"
BEFORE UPDATE ON "student_term_report_versions"
FOR EACH ROW EXECUTE FUNCTION "protect_student_term_report_versions"();

CREATE TRIGGER "student_term_report_versions_immutable_delete"
BEFORE DELETE ON "student_term_report_versions"
FOR EACH ROW EXECUTE FUNCTION "protect_student_term_report_versions"();

CREATE OR REPLACE FUNCTION "has_approved_report_amendment"(target_term_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  amendment_id TEXT;
BEGIN
  amendment_id := current_setting('sync.approved_report_amendment_id', true);
  IF amendment_id IS NULL OR amendment_id = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM "closed_term_amendments"
    WHERE "id" = amendment_id
      AND "academicTermId" = target_term_id
      AND "status" = 'APPROVED'
  );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION "protect_finalized_student_term_reports"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" IN ('FINALIZED', 'PUBLISHED') THEN
      RAISE EXCEPTION 'Finalized and published student term reports are immutable';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."status" IN ('FINALIZED', 'PUBLISHED')
     AND "has_approved_report_amendment"(OLD."termId")
  THEN
    IF NEW."status" IS DISTINCT FROM OLD."status"
       OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
       OR NEW."termId" IS DISTINCT FROM OLD."termId"
       OR NEW."classId" IS DISTINCT FROM OLD."classId"
       OR NEW."finalizedAt" IS DISTINCT FROM OLD."finalizedAt"
       OR NEW."finalizedByUserId" IS DISTINCT FROM OLD."finalizedByUserId"
       OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
       OR NEW."publishedByUserId" IS DISTINCT FROM OLD."publishedByUserId"
       OR NEW."currentVersion" <> OLD."currentVersion" + 1
    THEN
      RAISE EXCEPTION 'Approved amendments must preserve report ownership, lifecycle, and increment one version';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'PUBLISHED' THEN
    IF NEW."status" <> 'PUBLISHED'
       OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
       OR NEW."termId" IS DISTINCT FROM OLD."termId"
       OR NEW."classId" IS DISTINCT FROM OLD."classId"
       OR NEW."classTeacherRemark" IS DISTINCT FROM OLD."classTeacherRemark"
       OR NEW."principalRemark" IS DISTINCT FROM OLD."principalRemark"
       OR NEW."totalAttendance" IS DISTINCT FROM OLD."totalAttendance"
       OR NEW."totalDays" IS DISTINCT FROM OLD."totalDays"
       OR NEW."finalizedAt" IS DISTINCT FROM OLD."finalizedAt"
       OR NEW."finalizedByUserId" IS DISTINCT FROM OLD."finalizedByUserId"
       OR NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
       OR NEW."publishedByUserId" IS DISTINCT FROM OLD."publishedByUserId"
       OR NEW."currentVersion" IS DISTINCT FROM OLD."currentVersion"
    THEN
      RAISE EXCEPTION 'Published student term reports are immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'FINALIZED' THEN
    IF NEW."status" NOT IN ('FINALIZED', 'PUBLISHED')
       OR NEW."studentId" IS DISTINCT FROM OLD."studentId"
       OR NEW."termId" IS DISTINCT FROM OLD."termId"
       OR NEW."classId" IS DISTINCT FROM OLD."classId"
       OR NEW."classTeacherRemark" IS DISTINCT FROM OLD."classTeacherRemark"
       OR NEW."principalRemark" IS DISTINCT FROM OLD."principalRemark"
       OR NEW."totalAttendance" IS DISTINCT FROM OLD."totalAttendance"
       OR NEW."totalDays" IS DISTINCT FROM OLD."totalDays"
       OR NEW."finalizedAt" IS DISTINCT FROM OLD."finalizedAt"
       OR NEW."finalizedByUserId" IS DISTINCT FROM OLD."finalizedByUserId"
       OR (
         NEW."status" = 'FINALIZED'
         AND NEW."currentVersion" IS DISTINCT FROM OLD."currentVersion"
       )
       OR (
         NEW."status" = 'PUBLISHED'
         AND NEW."currentVersion" IS DISTINCT FROM OLD."currentVersion" + 1
       )
    THEN
      RAISE EXCEPTION 'Finalized student term reports are immutable outside the amendment workflow';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "student_term_reports_finalized_immutable"
BEFORE UPDATE OR DELETE ON "student_term_reports"
FOR EACH ROW EXECUTE FUNCTION "protect_finalized_student_term_reports"();

CREATE OR REPLACE FUNCTION "protect_finalized_term_results"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND EXISTS (
       SELECT 1
       FROM "student_term_reports"
       WHERE "studentId" = OLD."studentId"
         AND "termId" = OLD."termId"
         AND "status" IN ('FINALIZED', 'PUBLISHED')
     )
     AND NOT "has_approved_report_amendment"(OLD."termId")
  THEN
    RAISE EXCEPTION 'Term results for a finalized report are immutable';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND EXISTS (
       SELECT 1
       FROM "student_term_reports"
       WHERE "studentId" = NEW."studentId"
         AND "termId" = NEW."termId"
         AND "status" IN ('FINALIZED', 'PUBLISHED')
     )
     AND NOT "has_approved_report_amendment"(NEW."termId")
  THEN
      RAISE EXCEPTION 'Term results for a finalized report are immutable';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "term_results_finalized_report_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "term_results"
FOR EACH ROW EXECUTE FUNCTION "protect_finalized_term_results"();

CREATE OR REPLACE FUNCTION "protect_finalized_assessment_results"()
RETURNS TRIGGER AS $$
DECLARE
  old_term_id TEXT;
  new_term_id TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT "termId" INTO old_term_id
    FROM "assessments"
    WHERE "id" = OLD."assessmentId";

    IF EXISTS (
      SELECT 1
      FROM "student_term_reports"
      WHERE "studentId" = OLD."studentId"
        AND "termId" = old_term_id
        AND "status" IN ('FINALIZED', 'PUBLISHED')
    ) THEN
      RAISE EXCEPTION 'Assessment results for a finalized report are immutable';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT "termId" INTO new_term_id
    FROM "assessments"
    WHERE "id" = NEW."assessmentId";

    IF EXISTS (
      SELECT 1
      FROM "student_term_reports"
      WHERE "studentId" = NEW."studentId"
        AND "termId" = new_term_id
        AND "status" IN ('FINALIZED', 'PUBLISHED')
    ) THEN
      RAISE EXCEPTION 'Assessment results for a finalized report are immutable';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "assessment_results_finalized_report_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "assessment_results"
FOR EACH ROW EXECUTE FUNCTION "protect_finalized_assessment_results"();

CREATE OR REPLACE FUNCTION "validate_term_instructional_day"()
RETURNS TRIGGER AS $$
DECLARE
  term_start DATE;
  term_end DATE;
BEGIN
  SELECT "startDate"::date, "endDate"::date
  INTO term_start, term_end
  FROM "academic_terms"
  WHERE "id" = NEW."academicTermId";

  IF NEW."date"::date < term_start OR NEW."date"::date > term_end THEN
    RAISE EXCEPTION 'Instructional day must fall within its academic term';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "student_term_reports"
    WHERE "termId" = NEW."academicTermId"
      AND "status" IN ('FINALIZED', 'PUBLISHED')
  ) THEN
    RAISE EXCEPTION 'Instructional calendar is immutable after report finalization';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "term_instructional_days_within_term"
BEFORE INSERT OR UPDATE ON "term_instructional_days"
FOR EACH ROW EXECUTE FUNCTION "validate_term_instructional_day"();

CREATE OR REPLACE FUNCTION "protect_used_term_instructional_day"()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "student_term_reports"
    WHERE "termId" = OLD."academicTermId"
      AND "status" IN ('FINALIZED', 'PUBLISHED')
  ) THEN
    RAISE EXCEPTION 'Instructional calendar is immutable after report finalization';
  END IF;

  IF OLD."isInstructional" = true AND EXISTS (
    SELECT 1
    FROM "attendance"
    WHERE "academicTermId" = OLD."academicTermId"
      AND "date"::date = OLD."date"::date
  ) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'An instructional day with attendance cannot be removed or disabled';
    END IF;
    IF NEW."isInstructional" = false OR NEW."date"::date <> OLD."date"::date THEN
      RAISE EXCEPTION 'An instructional day with attendance cannot be removed or disabled';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "term_instructional_days_protect_usage"
BEFORE UPDATE OR DELETE ON "term_instructional_days"
FOR EACH ROW EXECUTE FUNCTION "protect_used_term_instructional_day"();

CREATE OR REPLACE FUNCTION "validate_attendance_instructional_day"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND EXISTS (
    SELECT 1
    FROM "student_term_reports"
    WHERE "studentId" = OLD."studentId"
      AND "termId" = OLD."academicTermId"
      AND "status" IN ('FINALIZED', 'PUBLISHED')
  ) THEN
    RAISE EXCEPTION 'Attendance for a finalized report is immutable';
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF EXISTS (
      SELECT 1
      FROM "student_term_reports"
      WHERE "studentId" = NEW."studentId"
        AND "termId" = NEW."academicTermId"
        AND "status" IN ('FINALIZED', 'PUBLISHED')
    ) THEN
      RAISE EXCEPTION 'Attendance for a finalized report is immutable';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM "term_instructional_days"
      WHERE "academicTermId" = NEW."academicTermId"
        AND "date"::date = NEW."date"::date
        AND "isInstructional" = true
    ) THEN
      RAISE EXCEPTION 'Attendance can only be recorded on an instructional day';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "attendance_requires_instructional_day"
BEFORE INSERT OR UPDATE OR DELETE ON "attendance"
FOR EACH ROW EXECUTE FUNCTION "validate_attendance_instructional_day"();
