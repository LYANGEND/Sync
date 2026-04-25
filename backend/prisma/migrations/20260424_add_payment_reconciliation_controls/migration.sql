-- Add lightweight reconciliation tracking directly to payments
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "isReconciled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reconciledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reconciledByUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciledByName" TEXT,
  ADD COLUMN IF NOT EXISTS "settlementDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "bankReference" TEXT,
  ADD COLUMN IF NOT EXISTS "reconciliationNote" TEXT;

CREATE INDEX IF NOT EXISTS "payments_isReconciled_paymentDate_idx"
  ON "payments"("isReconciled", "paymentDate");
