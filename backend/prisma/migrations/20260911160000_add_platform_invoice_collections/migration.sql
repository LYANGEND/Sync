-- CreateTable
CREATE TABLE "platform_invoice_collections" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "lencoReference" TEXT,
    "lencoCollectionId" TEXT,
    "invoiceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "accountName" TEXT,
    "operatorTransactionId" TEXT,
    "fee" DECIMAL(12,2),
    "bearer" TEXT NOT NULL DEFAULT 'merchant',
    "status" "MobileMoneyStatus" NOT NULL DEFAULT 'PENDING',
    "reasonForFailure" TEXT,
    "initiatedByUserId" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_invoice_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_invoice_collections_reference_key" ON "platform_invoice_collections"("reference");

-- CreateIndex
CREATE INDEX "platform_invoice_collections_invoiceId_idx" ON "platform_invoice_collections"("invoiceId");

-- CreateIndex
CREATE INDEX "platform_invoice_collections_tenantId_idx" ON "platform_invoice_collections"("tenantId");

-- CreateIndex
CREATE INDEX "platform_invoice_collections_status_idx" ON "platform_invoice_collections"("status");
