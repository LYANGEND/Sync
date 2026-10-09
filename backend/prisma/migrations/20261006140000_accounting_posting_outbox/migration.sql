-- Durable transactional intent for operational-to-ledger postings. Finance
-- mutations enqueue one idempotent event in the same database transaction;
-- retryable workers project it into journal_entries after commit.

CREATE TYPE "AccountingPostingEventType" AS ENUM (
  'PAYMENT_RECEIVED',
  'PAYMENT_VOIDED',
  'INVOICE_ISSUED',
  'INVOICE_CANCELLED',
  'CREDIT_NOTE_ISSUED',
  'REFUND_PROCESSED'
);

CREATE TYPE "AccountingPostingStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "accounting_posting_outbox" (
  "id" TEXT NOT NULL,
  "postingKey" TEXT NOT NULL,
  "eventType" "AccountingPostingEventType" NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "userId" TEXT,
  "status" "AccountingPostingStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accounting_posting_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_posting_outbox_postingKey_key"
  ON "accounting_posting_outbox"("postingKey");
CREATE INDEX "accounting_posting_outbox_status_availableAt_idx"
  ON "accounting_posting_outbox"("status", "availableAt");
CREATE INDEX "accounting_posting_outbox_eventType_aggregateId_idx"
  ON "accounting_posting_outbox"("eventType", "aggregateId");
