-- Phase 9 readiness evidence is deliberately separate from mutable rollover
-- configuration. Every acknowledgement, external backup, and approval is
-- bound to the canonical preflight fingerprint that it reviewed.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "term_rollovers"
        WHERE "preflightHash" IS NOT NULL
           OR "warningAcknowledgements" IS NOT NULL
           OR "backupReference" IS NOT NULL
           OR "backupChecksum" IS NOT NULL
           OR "backupVerifiedAt" IS NOT NULL
           OR "approvedByUserId" IS NOT NULL
           OR "approvedAt" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Cannot install Phase 9 readiness integrity over existing unbound rollover evidence.';
    END IF;
END $$;

ALTER TABLE "term_rollovers"
ADD COLUMN "preflightSnapshot" JSONB,
ADD COLUMN "preflightGeneratedAt" TIMESTAMP(3),
ADD COLUMN "warningHash" TEXT,
ADD COLUMN "warningAcknowledgementHash" TEXT,
ADD COLUMN "warningAcknowledgedFingerprint" TEXT,
ADD COLUMN "warningAcknowledgedByUserId" TEXT,
ADD COLUMN "warningAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN "backupFingerprint" TEXT,
ADD COLUMN "backupSizeBytes" DECIMAL(20, 0),
ADD COLUMN "backupManifest" JSONB,
ADD COLUMN "backupCreatedAt" TIMESTAMP(3),
ADD COLUMN "backupVerifiedByUserId" TEXT,
ADD COLUMN "approvedFingerprint" TEXT;

ALTER TABLE "term_rollovers"
ADD CONSTRAINT "term_rollovers_preflight_evidence_check"
CHECK ((
    (
        "preflightHash" IS NULL
        AND "preflightSnapshot" IS NULL
        AND "preflightGeneratedAt" IS NULL
        AND "warningHash" IS NULL
    ) OR (
        "preflightHash" ~ '^[a-f0-9]{64}$'
        AND "preflightSnapshot" IS NOT NULL
        AND "preflightSnapshot" ->> 'fingerprint' = "preflightHash"
        AND "preflightSnapshot" ->> 'warningHash' = "warningHash"
        AND "preflightGeneratedAt" IS NOT NULL
        AND "warningHash" ~ '^[a-f0-9]{64}$'
    )
) IS TRUE),
ADD CONSTRAINT "term_rollovers_warning_evidence_check"
CHECK ((
    (
        "warningAcknowledgements" IS NULL
        AND "warningAcknowledgementHash" IS NULL
        AND "warningAcknowledgedFingerprint" IS NULL
        AND "warningAcknowledgedByUserId" IS NULL
        AND "warningAcknowledgedAt" IS NULL
    ) OR (
        "warningAcknowledgements" IS NOT NULL
        AND "warningAcknowledgementHash" ~ '^[a-f0-9]{64}$'
        AND "warningAcknowledgedFingerprint" ~ '^[a-f0-9]{64}$'
        AND LENGTH(BTRIM("warningAcknowledgedByUserId")) > 0
        AND "warningAcknowledgedAt" IS NOT NULL
    )
) IS TRUE),
ADD CONSTRAINT "term_rollovers_backup_evidence_check"
CHECK ((
    (
        "backupReference" IS NULL
        AND "backupChecksum" IS NULL
        AND "backupFingerprint" IS NULL
        AND "backupSizeBytes" IS NULL
        AND "backupManifest" IS NULL
        AND "backupCreatedAt" IS NULL
        AND "backupVerifiedAt" IS NULL
        AND "backupVerifiedByUserId" IS NULL
    ) OR (
        LENGTH(BTRIM("backupReference")) > 0
        AND "backupChecksum" ~ '^[a-f0-9]{64}$'
        AND "backupFingerprint" ~ '^[a-f0-9]{64}$'
        AND "backupSizeBytes" > 0
        AND "backupManifest" IS NOT NULL
        AND "backupCreatedAt" IS NOT NULL
        AND (
            ("backupVerifiedAt" IS NULL AND "backupVerifiedByUserId" IS NULL)
            OR ("backupVerifiedAt" IS NOT NULL AND LENGTH(BTRIM("backupVerifiedByUserId")) > 0)
        )
    )
) IS TRUE),
ADD CONSTRAINT "term_rollovers_approval_evidence_check"
CHECK ((
    (
        "approvedFingerprint" IS NULL
        AND "approvedByUserId" IS NULL
        AND "approvedAt" IS NULL
    ) OR (
        "approvedFingerprint" ~ '^[a-f0-9]{64}$'
        AND LENGTH(BTRIM("approvedByUserId")) > 0
        AND "approvedAt" IS NOT NULL
    )
) IS TRUE),
ADD CONSTRAINT "term_rollovers_ready_evidence_check"
CHECK ((
    "status" <> 'READY' OR (
        "preflightHash" IS NOT NULL
        AND COALESCE(("preflightSnapshot" -> 'summary' ->> 'blockerCount')::integer, -1) = 0
        AND (
            COALESCE(("preflightSnapshot" -> 'summary' ->> 'warningCount')::integer, -1) = 0
            OR (
                "warningAcknowledgementHash" = "warningHash"
                AND "warningAcknowledgedFingerprint" = "preflightHash"
            )
        )
        AND "backupFingerprint" = "preflightHash"
        AND "backupVerifiedAt" IS NOT NULL
        AND "backupVerifiedByUserId" IS NOT NULL
        AND "approvedFingerprint" = "preflightHash"
        AND "approvedAt" IS NOT NULL
        AND "approvedByUserId" IS NOT NULL
    )
) IS TRUE);

CREATE INDEX "term_rollovers_preflightHash_idx"
ON "term_rollovers"("preflightHash");