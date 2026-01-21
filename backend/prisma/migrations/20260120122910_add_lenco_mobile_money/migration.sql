-- CreateEnum
CREATE TYPE "MobileMoneyStatus" AS ENUM ('PENDING', 'PAY_OFFLINE', 'SUCCESSFUL', 'FAILED');

-- AlterTable
ALTER TABLE "school_settings" ADD COLUMN     "lencoApiKey" TEXT,
ADD COLUMN     "lencoDefaultBearer" TEXT DEFAULT 'merchant',
ADD COLUMN     "lencoEnvironment" TEXT DEFAULT 'sandbox';

-- CreateTable
CREATE TABLE "mobile_money_collections" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "lencoReference" TEXT,
    "lencoCollectionId" TEXT,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "phone" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "accountName" TEXT,
    "operatorTransactionId" TEXT,
    "fee" DECIMAL(10,2),
    "bearer" TEXT NOT NULL DEFAULT 'merchant',
    "status" "MobileMoneyStatus" NOT NULL DEFAULT 'PENDING',
    "reasonForFailure" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "initiatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_money_collections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_money_collections_reference_key" ON "mobile_money_collections"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_money_collections_paymentId_key" ON "mobile_money_collections"("paymentId");

-- CreateIndex
CREATE INDEX "mobile_money_collections_reference_idx" ON "mobile_money_collections"("reference");

-- CreateIndex
CREATE INDEX "mobile_money_collections_lencoReference_idx" ON "mobile_money_collections"("lencoReference");

-- CreateIndex
CREATE INDEX "mobile_money_collections_studentId_status_idx" ON "mobile_money_collections"("studentId", "status");

-- CreateIndex
CREATE INDEX "mobile_money_collections_status_idx" ON "mobile_money_collections"("status");

-- AddForeignKey
ALTER TABLE "mobile_money_collections" ADD CONSTRAINT "mobile_money_collections_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_money_collections" ADD CONSTRAINT "mobile_money_collections_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
