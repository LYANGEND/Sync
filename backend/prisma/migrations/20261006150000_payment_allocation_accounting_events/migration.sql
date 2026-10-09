-- A receipt initially creates source account credit. Each allocation then
-- reclassifies an immutable delta from account credit to receivable/revenue,
-- allowing later allocations to remain correct and auditable.

ALTER TYPE "AccountingPostingEventType" ADD VALUE 'PAYMENT_ALLOCATED' AFTER 'PAYMENT_RECEIVED';
ALTER TABLE "accounting_posting_outbox" ADD COLUMN "payload" JSONB;
