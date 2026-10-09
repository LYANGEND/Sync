-- Attendance belongs to the same academic term as its class.
ALTER TABLE "attendance" ADD COLUMN "academicTermId" TEXT;

UPDATE "attendance" AS attendance
SET "academicTermId" = class."academicTermId"
FROM "classes" AS class
WHERE class."id" = attendance."classId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "attendance"
    WHERE "academicTermId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot assign attendance terms because some attendance rows reference no valid class.';
  END IF;
END $$;

ALTER TABLE "attendance" ALTER COLUMN "academicTermId" SET NOT NULL;

CREATE INDEX "attendance_academicTermId_date_idx"
ON "attendance"("academicTermId", "date");

ALTER TABLE "attendance"
ADD CONSTRAINT "attendance_academicTermId_fkey"
FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Attendance alerts are also isolated by term.
ALTER TABLE "attendance_alerts" ADD COLUMN "academicTermId" TEXT;

UPDATE "attendance_alerts" AS alert
SET "academicTermId" = (
  SELECT term."id"
  FROM "academic_terms" AS term
  WHERE alert."createdAt"::date BETWEEN term."startDate"::date AND term."endDate"::date
  ORDER BY term."startDate" DESC
  LIMIT 1
);

UPDATE "attendance_alerts" AS alert
SET "academicTermId" = class."academicTermId"
FROM "students" AS student
JOIN "classes" AS class ON class."id" = student."classId"
WHERE student."id" = alert."studentId"
  AND alert."academicTermId" IS NULL;

UPDATE "attendance_alerts" AS alert
SET "academicTermId" = (
  SELECT term."id"
  FROM "academic_terms" AS term
  ORDER BY ABS(EXTRACT(EPOCH FROM (alert."createdAt" - term."startDate")))
  LIMIT 1
)
WHERE alert."academicTermId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "attendance_alerts"
    WHERE "academicTermId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot assign attendance alert terms because no academic term could be resolved.';
  END IF;
END $$;

ALTER TABLE "attendance_alerts" ALTER COLUMN "academicTermId" SET NOT NULL;

CREATE INDEX "attendance_alerts_academicTermId_isResolved_idx"
ON "attendance_alerts"("academicTermId", "isResolved");

ALTER TABLE "attendance_alerts"
ADD CONSTRAINT "attendance_alerts_academicTermId_fkey"
FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "attendance_alerts" AS alert
    LEFT JOIN "students" AS student ON student."id" = alert."studentId"
    WHERE student."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot enforce attendance alert ownership because some alerts reference missing students.';
  END IF;
END $$;

ALTER TABLE "attendance_alerts"
ADD CONSTRAINT "attendance_alerts_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "students"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing invoice term IDs must resolve to real academic terms before the FK is added.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "invoices" AS invoice
    LEFT JOIN "academic_terms" AS term ON term."id" = invoice."termId"
    WHERE term."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot enforce invoice term ownership because some invoices reference invalid academic terms.';
  END IF;
END $$;

CREATE INDEX "invoices_termId_idx" ON "invoices"("termId");

ALTER TABLE "invoices"
ADD CONSTRAINT "invoices_termId_fkey"
FOREIGN KEY ("termId") REFERENCES "academic_terms"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- A payment can only be allocated to fees from one term.
DO $$
BEGIN
  IF EXISTS (
    SELECT allocation."paymentId"
    FROM "payment_allocations" AS allocation
    JOIN "student_fee_structures" AS fee ON fee."id" = allocation."studentFeeId"
    GROUP BY allocation."paymentId"
    HAVING COUNT(DISTINCT fee."academicTermId") > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce payment term ownership because some payments are allocated across multiple academic terms.';
  END IF;
END $$;

-- Allocations are the authoritative source for already allocated payments.
UPDATE "payments" AS payment
SET "academicTermId" = allocation_term."academicTermId"
FROM (
  SELECT allocation."paymentId", MIN(fee."academicTermId") AS "academicTermId"
  FROM "payment_allocations" AS allocation
  JOIN "student_fee_structures" AS fee ON fee."id" = allocation."studentFeeId"
  GROUP BY allocation."paymentId"
) AS allocation_term
WHERE payment."id" = allocation_term."paymentId";

-- Otherwise, use the term whose date range contains the payment date.
UPDATE "payments" AS payment
SET "academicTermId" = (
  SELECT term."id"
  FROM "academic_terms" AS term
  WHERE payment."paymentDate"::date BETWEEN term."startDate"::date AND term."endDate"::date
  ORDER BY term."startDate" DESC
  LIMIT 1
)
WHERE payment."academicTermId" IS NULL;

-- Legacy out-of-calendar payments are attached to the nearest term so none remain unscoped.
UPDATE "payments" AS payment
SET "academicTermId" = (
  SELECT term."id"
  FROM "academic_terms" AS term
  ORDER BY LEAST(
    ABS(EXTRACT(EPOCH FROM (payment."paymentDate" - term."startDate"))),
    ABS(EXTRACT(EPOCH FROM (payment."paymentDate" - term."endDate")))
  )
  LIMIT 1
)
WHERE payment."academicTermId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payments"
    WHERE "academicTermId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot require payment terms because no academic term could be resolved for some payments.';
  END IF;
END $$;

ALTER TABLE "payments"
DROP CONSTRAINT "payments_academicTermId_fkey";

ALTER TABLE "payments" ALTER COLUMN "academicTermId" SET NOT NULL;

ALTER TABLE "payments"
ADD CONSTRAINT "payments_academicTermId_fkey"
FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Debt collection campaigns and messages retain explicit term ownership.
ALTER TABLE "debt_collection_campaigns" ADD COLUMN "academicTermId" TEXT;

UPDATE "debt_collection_campaigns" AS campaign
SET "academicTermId" = (
  SELECT term."id"
  FROM "academic_terms" AS term
  ORDER BY
    CASE WHEN campaign."createdAt"::date BETWEEN term."startDate"::date AND term."endDate"::date THEN 0 ELSE 1 END,
    LEAST(
      ABS(EXTRACT(EPOCH FROM (campaign."createdAt" - term."startDate"))),
      ABS(EXTRACT(EPOCH FROM (campaign."createdAt" - term."endDate")))
    )
  LIMIT 1
);

ALTER TABLE "campaign_messages" ADD COLUMN "academicTermId" TEXT;

UPDATE "campaign_messages" AS message
SET "academicTermId" = campaign."academicTermId"
FROM "debt_collection_campaigns" AS campaign
WHERE campaign."id" = message."campaignId";

UPDATE "campaign_messages" AS message
SET "academicTermId" = (
  SELECT term."id"
  FROM "academic_terms" AS term
  ORDER BY
    CASE WHEN message."sentAt"::date BETWEEN term."startDate"::date AND term."endDate"::date THEN 0 ELSE 1 END,
    LEAST(
      ABS(EXTRACT(EPOCH FROM (message."sentAt" - term."startDate"))),
      ABS(EXTRACT(EPOCH FROM (message."sentAt" - term."endDate")))
    )
  LIMIT 1
)
WHERE message."academicTermId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "debt_collection_campaigns" WHERE "academicTermId" IS NULL)
     OR EXISTS (SELECT 1 FROM "campaign_messages" WHERE "academicTermId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot assign debt collection records because no academic term could be resolved.';
  END IF;
END $$;

ALTER TABLE "debt_collection_campaigns" ALTER COLUMN "academicTermId" SET NOT NULL;
ALTER TABLE "campaign_messages" ALTER COLUMN "academicTermId" SET NOT NULL;
ALTER TABLE "campaign_messages" ALTER COLUMN "campaignId" DROP NOT NULL;

CREATE INDEX "debt_collection_campaigns_academicTermId_status_idx"
ON "debt_collection_campaigns"("academicTermId", "status");
CREATE INDEX "campaign_messages_academicTermId_status_idx"
ON "campaign_messages"("academicTermId", "status");

ALTER TABLE "debt_collection_campaigns"
ADD CONSTRAINT "debt_collection_campaigns_academicTermId_fkey"
FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "campaign_messages"
ADD CONSTRAINT "campaign_messages_academicTermId_fkey"
FOREIGN KEY ("academicTermId") REFERENCES "academic_terms"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;