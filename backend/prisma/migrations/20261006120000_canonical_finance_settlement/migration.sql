-- Phase 5: canonical receipt/allocation settlement.
-- Cross-term allocations are intentional: Payment.academicTermId is the receipt
-- term, while StudentFeeStructure.academicTermId remains the obligation term.

CREATE TYPE "PaymentSource" AS ENUM (
  'MANUAL',
  'INVOICE',
  'MOBILE_MONEY',
  'PUBLIC_MOBILE_MONEY',
  'AI',
  'IMPORT'
);

ALTER TABLE "payments"
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "source" "PaymentSource" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "journal_entries"
  ADD COLUMN "postingKey" TEXT;

ALTER TABLE "invoice_items"
  ADD COLUMN "studentFeeId" TEXT;

ALTER TABLE "refunds"
  ADD COLUMN "idempotencyKey" TEXT;

ALTER TABLE "term_financial_summaries"
  ADD COLUMN "totalCashReceived" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "totalRefunded" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "netCashReceived" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "unallocatedCredit" DECIMAL(12,2) NOT NULL DEFAULT 0;

CREATE TABLE "refund_allocations" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "paymentAllocationId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_allocations_pkey" PRIMARY KEY ("id")
);

-- Link only unambiguous legacy invoice items. Free-form or duplicate invoice
-- items remain unlinked and are reported by the reconciliation planner.
WITH candidates AS (
  SELECT
    ii."id" AS "invoiceItemId",
    sfs."id" AS "studentFeeId",
    COUNT(*) OVER (PARTITION BY ii."id") AS "itemCandidateCount",
    COUNT(*) OVER (PARTITION BY sfs."id") AS "feeCandidateCount"
  FROM "invoice_items" ii
  JOIN "invoices" i ON i."id" = ii."invoiceId"
  JOIN "student_fee_structures" sfs
    ON sfs."studentId" = i."studentId"
   AND sfs."academicTermId" = i."termId"
   AND sfs."feeTemplateId" = ii."feeTemplateId"
  WHERE ii."feeTemplateId" IS NOT NULL
)
UPDATE "invoice_items" ii
SET "studentFeeId" = candidates."studentFeeId"
FROM candidates
WHERE ii."id" = candidates."invoiceItemId"
  AND candidates."itemCandidateCount" = 1
  AND candidates."feeCandidateCount" = 1;

-- Existing duplicate allocation pairs are not guessed or merged. Deployment
-- stops so the Phase 5 reconciliation report can be reviewed first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payment_allocations"
    GROUP BY "paymentId", "studentFeeId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate payment/fee allocations must be reconciled before Phase 5 can be applied';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "payment_allocations" pa
    JOIN "payments" p ON p."id" = pa."paymentId"
    JOIN "student_fee_structures" sfs ON sfs."id" = pa."studentFeeId"
    WHERE p."studentId" <> sfs."studentId"
  ) THEN
    RAISE EXCEPTION 'Cross-student payment allocations must be reconciled before Phase 5 can be applied';
  END IF;
END $$;

CREATE UNIQUE INDEX "payments_idempotencyKey_key"
  ON "payments"("idempotencyKey");
CREATE UNIQUE INDEX "journal_entries_postingKey_key"
  ON "journal_entries"("postingKey");
CREATE UNIQUE INDEX "refunds_idempotencyKey_key"
  ON "refunds"("idempotencyKey");
CREATE UNIQUE INDEX "payment_allocations_paymentId_studentFeeId_key"
  ON "payment_allocations"("paymentId", "studentFeeId");
CREATE UNIQUE INDEX "invoice_items_studentFeeId_key"
  ON "invoice_items"("studentFeeId");
CREATE UNIQUE INDEX "refund_allocations_refundId_paymentAllocationId_key"
  ON "refund_allocations"("refundId", "paymentAllocationId");
CREATE INDEX "refund_allocations_refundId_idx"
  ON "refund_allocations"("refundId");
CREATE INDEX "refund_allocations_paymentAllocationId_idx"
  ON "refund_allocations"("paymentAllocationId");
CREATE INDEX "invoices_studentId_termId_status_idx"
  ON "invoices"("studentId", "termId", "status");
CREATE INDEX "invoices_termId_status_dueDate_idx"
  ON "invoices"("termId", "status", "dueDate");

ALTER TABLE "invoice_items"
  ADD CONSTRAINT "invoice_items_studentFeeId_fkey"
  FOREIGN KEY ("studentFeeId") REFERENCES "student_fee_structures"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "refund_allocations"
  ADD CONSTRAINT "refund_allocations_refundId_fkey"
  FOREIGN KEY ("refundId") REFERENCES "refunds"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "refund_allocations"
  ADD CONSTRAINT "refund_allocations_paymentAllocationId_fkey"
  FOREIGN KEY ("paymentAllocationId") REFERENCES "payment_allocations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- NOT VALID preserves legacy rows for explicit reconciliation while enforcing
-- these bounds for every new or changed row immediately.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_amount_positive" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "refunds"
  ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "refund_allocations"
  ADD CONSTRAINT "refund_allocations_amount_positive" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "student_fee_structures"
  ADD CONSTRAINT "student_fee_structures_amounts_valid"
  CHECK ("amountDue" >= 0 AND "amountPaid" >= 0 AND "amountPaid" <= "amountDue") NOT VALID;

CREATE OR REPLACE FUNCTION sync_invoice_settlement(target_invoice_id TEXT)
RETURNS VOID AS $$
DECLARE
  invoice_total DECIMAL(12,2);
  invoice_status "InvoiceStatus";
  credited DECIMAL(12,2);
  allocated DECIMAL(12,2);
  payable DECIMAL(12,2);
  paid DECIMAL(12,2);
  balance DECIMAL(12,2);
BEGIN
  SELECT i."totalAmount", i."status"
  INTO invoice_total, invoice_status
  FROM "invoices" i
  WHERE i."id" = target_invoice_id
  FOR UPDATE;

  IF NOT FOUND OR invoice_status = 'CANCELLED' THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(cn."amount"), 0)
  INTO credited
  FROM "credit_notes" cn
  WHERE cn."invoiceId" = target_invoice_id;

  SELECT COALESCE(SUM(
    pa."amount" - COALESCE((
      SELECT SUM(ra."amount")
      FROM "refund_allocations" ra
      JOIN "refunds" r ON r."id" = ra."refundId"
      WHERE ra."paymentAllocationId" = pa."id"
        AND r."status" = 'PROCESSED'
    ), 0)
  ), 0)
  INTO allocated
  FROM "invoice_items" ii
  JOIN "payment_allocations" pa ON pa."studentFeeId" = ii."studentFeeId"
  JOIN "payments" p ON p."id" = pa."paymentId" AND p."status" = 'COMPLETED'
  WHERE ii."invoiceId" = target_invoice_id
    AND ii."studentFeeId" IS NOT NULL;

  payable := GREATEST(invoice_total - credited, 0);
  paid := LEAST(GREATEST(allocated, 0), payable);
  balance := GREATEST(payable - paid, 0);

  UPDATE "invoices"
  SET
    "amountPaid" = paid,
    "balanceDue" = balance,
    "status" = CASE
      WHEN payable = 0 AND credited > 0 THEN 'CREDITED'::"InvoiceStatus"
      WHEN balance = 0 THEN 'PAID'::"InvoiceStatus"
      WHEN paid > 0 THEN 'PARTIALLY_PAID'::"InvoiceStatus"
      WHEN invoice_status IN ('PAID', 'PARTIALLY_PAID', 'CREDITED', 'OVERDUE')
        THEN 'SENT'::"InvoiceStatus"
      ELSE invoice_status
    END,
    "paidAt" = CASE WHEN balance = 0 AND payable > 0 THEN COALESCE("paidAt", CURRENT_TIMESTAMP) ELSE NULL END,
    "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = target_invoice_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_student_fee_settlement(target_fee_id TEXT)
RETURNS VOID AS $$
DECLARE
  settled DECIMAL(12,2);
  linked_invoice_id TEXT;
BEGIN
  SELECT COALESCE(SUM(
    pa."amount" - COALESCE((
      SELECT SUM(ra."amount")
      FROM "refund_allocations" ra
      JOIN "refunds" r ON r."id" = ra."refundId"
      WHERE ra."paymentAllocationId" = pa."id"
        AND r."status" = 'PROCESSED'
    ), 0)
  ), 0)
  INTO settled
  FROM "payment_allocations" pa
  JOIN "payments" p ON p."id" = pa."paymentId" AND p."status" = 'COMPLETED'
  WHERE pa."studentFeeId" = target_fee_id;

  UPDATE "student_fee_structures"
  SET "amountPaid" = GREATEST(settled, 0), "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = target_fee_id;

  FOR linked_invoice_id IN
    SELECT DISTINCT ii."invoiceId"
    FROM "invoice_items" ii
    WHERE ii."studentFeeId" = target_fee_id
  LOOP
    PERFORM sync_invoice_settlement(linked_invoice_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION validate_payment_allocation_ownership_and_limits()
RETURNS TRIGGER AS $$
DECLARE
  payment_student_id TEXT;
  payment_status "PaymentStatus";
  payment_amount DECIMAL(12,2);
  fee_student_id TEXT;
  fee_amount_due DECIMAL(12,2);
  receipt_refunds DECIMAL(12,2);
  other_payment_allocations DECIMAL(12,2);
  other_fee_allocations DECIMAL(12,2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('sync:payment-settlement:' || NEW."paymentId"));
  PERFORM pg_advisory_xact_lock(hashtext('sync:fee-settlement:' || NEW."studentFeeId"));

  SELECT p."studentId", p."status", p."amount"
  INTO payment_student_id, payment_status, payment_amount
  FROM "payments" p
  WHERE p."id" = NEW."paymentId"
  FOR UPDATE;

  SELECT sfs."studentId", sfs."amountDue"
  INTO fee_student_id, fee_amount_due
  FROM "student_fee_structures" sfs
  WHERE sfs."id" = NEW."studentFeeId"
  FOR UPDATE;

  IF payment_status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Only completed payments can be allocated';
  END IF;
  IF payment_student_id <> fee_student_id THEN
    RAISE EXCEPTION 'Payment and fee obligation must belong to the same student';
  END IF;

  SELECT COALESCE(SUM(r."amount"), 0)
  INTO receipt_refunds
  FROM "refunds" r
  WHERE r."paymentId" = NEW."paymentId" AND r."status" = 'PROCESSED';

  SELECT COALESCE(SUM(
    pa."amount" - COALESCE((
      SELECT SUM(ra."amount")
      FROM "refund_allocations" ra
      JOIN "refunds" r ON r."id" = ra."refundId"
      WHERE ra."paymentAllocationId" = pa."id" AND r."status" = 'PROCESSED'
    ), 0)
  ), 0)
  INTO other_payment_allocations
  FROM "payment_allocations" pa
  WHERE pa."paymentId" = NEW."paymentId"
    AND (TG_OP = 'INSERT' OR pa."id" <> OLD."id");

  IF other_payment_allocations + NEW."amount" > payment_amount - receipt_refunds + 0.005 THEN
    RAISE EXCEPTION 'Payment allocations cannot exceed the net receipt amount';
  END IF;

  SELECT COALESCE(SUM(
    pa."amount" - COALESCE((
      SELECT SUM(ra."amount")
      FROM "refund_allocations" ra
      JOIN "refunds" r ON r."id" = ra."refundId"
      WHERE ra."paymentAllocationId" = pa."id" AND r."status" = 'PROCESSED'
    ), 0)
  ), 0)
  INTO other_fee_allocations
  FROM "payment_allocations" pa
  JOIN "payments" p ON p."id" = pa."paymentId" AND p."status" = 'COMPLETED'
  WHERE pa."studentFeeId" = NEW."studentFeeId"
    AND (TG_OP = 'INSERT' OR pa."id" <> OLD."id");

  IF other_fee_allocations + NEW."amount" > fee_amount_due + 0.005 THEN
    RAISE EXCEPTION 'Payment allocations cannot exceed the fee obligation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sync_payment_allocation_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM sync_student_fee_settlement(OLD."studentFeeId");
    RETURN OLD;
  END IF;

  PERFORM sync_student_fee_settlement(NEW."studentFeeId");
  IF TG_OP = 'UPDATE' AND OLD."studentFeeId" <> NEW."studentFeeId" THEN
    PERFORM sync_student_fee_settlement(OLD."studentFeeId");
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payment_allocations_validate"
BEFORE INSERT OR UPDATE ON "payment_allocations"
FOR EACH ROW EXECUTE FUNCTION validate_payment_allocation_ownership_and_limits();

CREATE TRIGGER "payment_allocations_sync"
AFTER INSERT OR UPDATE OR DELETE ON "payment_allocations"
FOR EACH ROW EXECUTE FUNCTION sync_payment_allocation_change();

CREATE OR REPLACE FUNCTION validate_refund_total()
RETURNS TRIGGER AS $$
DECLARE
  payment_student_id TEXT;
  payment_amount DECIMAL(12,2);
  other_refunds DECIMAL(12,2);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('sync:payment-settlement:' || NEW."paymentId"));
  SELECT p."studentId", p."amount"
  INTO payment_student_id, payment_amount
  FROM "payments" p
  WHERE p."id" = NEW."paymentId"
  FOR UPDATE;

  IF NEW."studentId" <> payment_student_id THEN
    RAISE EXCEPTION 'Refund and payment must belong to the same student';
  END IF;

  SELECT COALESCE(SUM(r."amount"), 0)
  INTO other_refunds
  FROM "refunds" r
  WHERE r."paymentId" = NEW."paymentId"
    AND r."status" <> 'REJECTED'
    AND (TG_OP = 'INSERT' OR r."id" <> OLD."id");

  IF other_refunds + NEW."amount" > payment_amount + 0.005 THEN
    RAISE EXCEPTION 'Refunds cannot exceed the payment amount';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "refunds_validate_total"
BEFORE INSERT OR UPDATE OF "amount", "paymentId", "studentId", "status" ON "refunds"
FOR EACH ROW EXECUTE FUNCTION validate_refund_total();

CREATE OR REPLACE FUNCTION validate_refund_allocation()
RETURNS TRIGGER AS $$
DECLARE
  refund_payment_id TEXT;
  allocation_payment_id TEXT;
  allocation_amount DECIMAL(12,2);
  already_reversed DECIMAL(12,2);
BEGIN
  SELECT r."paymentId" INTO refund_payment_id
  FROM "refunds" r WHERE r."id" = NEW."refundId" FOR UPDATE;

  SELECT pa."paymentId", pa."amount"
  INTO allocation_payment_id, allocation_amount
  FROM "payment_allocations" pa
  WHERE pa."id" = NEW."paymentAllocationId"
  FOR UPDATE;

  IF refund_payment_id <> allocation_payment_id THEN
    RAISE EXCEPTION 'Refund reversal must reference an allocation from the same payment';
  END IF;

  SELECT COALESCE(SUM(ra."amount"), 0)
  INTO already_reversed
  FROM "refund_allocations" ra
  JOIN "refunds" r ON r."id" = ra."refundId"
  WHERE ra."paymentAllocationId" = NEW."paymentAllocationId"
    AND r."status" IN ('APPROVED', 'PROCESSED')
    AND (TG_OP = 'INSERT' OR ra."id" <> OLD."id");

  IF already_reversed + NEW."amount" > allocation_amount + 0.005 THEN
    RAISE EXCEPTION 'Refund reversals cannot exceed the payment allocation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "refund_allocations_validate"
BEFORE INSERT OR UPDATE ON "refund_allocations"
FOR EACH ROW EXECUTE FUNCTION validate_refund_allocation();

CREATE OR REPLACE FUNCTION sync_refund_settlement_change()
RETURNS TRIGGER AS $$
DECLARE
  allocation_id TEXT;
  fee_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'refund_allocations' THEN
    allocation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."paymentAllocationId" ELSE NEW."paymentAllocationId" END;
    SELECT pa."studentFeeId" INTO fee_id FROM "payment_allocations" pa WHERE pa."id" = allocation_id;
    IF fee_id IS NOT NULL THEN
      PERFORM sync_student_fee_settlement(fee_id);
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  FOR fee_id IN
    SELECT DISTINCT pa."studentFeeId"
    FROM "refund_allocations" ra
    JOIN "payment_allocations" pa ON pa."id" = ra."paymentAllocationId"
    WHERE ra."refundId" = NEW."id"
  LOOP
    PERFORM sync_student_fee_settlement(fee_id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "refund_allocations_sync"
AFTER INSERT OR UPDATE OR DELETE ON "refund_allocations"
FOR EACH ROW EXECUTE FUNCTION sync_refund_settlement_change();

CREATE TRIGGER "refunds_status_sync"
AFTER UPDATE OF "status" ON "refunds"
FOR EACH ROW EXECUTE FUNCTION sync_refund_settlement_change();

CREATE OR REPLACE FUNCTION sync_payment_status_change()
RETURNS TRIGGER AS $$
DECLARE
  fee_id TEXT;
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status" THEN
    FOR fee_id IN
      SELECT DISTINCT pa."studentFeeId"
      FROM "payment_allocations" pa
      WHERE pa."paymentId" = NEW."id"
    LOOP
      PERFORM sync_student_fee_settlement(fee_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payments_status_sync"
AFTER UPDATE OF "status" ON "payments"
FOR EACH ROW EXECUTE FUNCTION sync_payment_status_change();

CREATE OR REPLACE FUNCTION sync_invoice_item_link_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_invoice_settlement(CASE WHEN TG_OP = 'DELETE' THEN OLD."invoiceId" ELSE NEW."invoiceId" END);
  IF TG_OP = 'UPDATE' AND OLD."invoiceId" <> NEW."invoiceId" THEN
    PERFORM sync_invoice_settlement(OLD."invoiceId");
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_items_settlement_sync"
AFTER INSERT OR UPDATE OF "studentFeeId" OR DELETE ON "invoice_items"
FOR EACH ROW EXECUTE FUNCTION sync_invoice_item_link_change();

CREATE OR REPLACE FUNCTION sync_credit_note_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_invoice_settlement(CASE WHEN TG_OP = 'DELETE' THEN OLD."invoiceId" ELSE NEW."invoiceId" END);
  IF TG_OP = 'UPDATE' AND OLD."invoiceId" <> NEW."invoiceId" THEN
    PERFORM sync_invoice_settlement(OLD."invoiceId");
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "credit_notes_settlement_sync"
AFTER INSERT OR UPDATE OR DELETE ON "credit_notes"
FOR EACH ROW EXECUTE FUNCTION sync_credit_note_change();