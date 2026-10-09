-- SQL NULL and JSON null are distinct: readiness evidence must have the
-- expected structured type. Apply forward without rewriting migration 52.
ALTER TABLE "term_rollovers"
ADD CONSTRAINT "term_rollovers_preflight_json_check"
CHECK (("preflightSnapshot" IS NULL OR (
    jsonb_typeof("preflightSnapshot") = 'object'
    AND jsonb_typeof("preflightSnapshot" -> 'summary') = 'object'
    AND jsonb_typeof("preflightSnapshot" -> 'issues') = 'array'
    AND "preflightSnapshot" ->> 'rolloverId' = "id"
)) IS TRUE),
ADD CONSTRAINT "term_rollovers_warning_json_check"
CHECK (("warningAcknowledgements" IS NULL OR
    jsonb_typeof("warningAcknowledgements") = 'array') IS TRUE),
ADD CONSTRAINT "term_rollovers_backup_json_check"
CHECK (("backupManifest" IS NULL OR (
    jsonb_typeof("backupManifest") = 'object'
    AND "backupManifest" ->> 'rolloverId' = "id"
    AND "backupManifest" ->> 'fingerprint' = "backupFingerprint"
    AND jsonb_typeof("backupManifest" -> 'tables') = 'array'
    AND "backupManifest" ->> 'tablesSha256' ~ '^[a-f0-9]{64}$'
    AND "backupManifest" ->> 'domainFingerprint' ~ '^[a-f0-9]{64}$'
    AND "backupManifest" ->> 'schemaManifestHash' ~ '^[a-f0-9]{64}$'
)) IS TRUE);