-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "TransferEntityType" AS ENUM ('STUDENT', 'USER');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'BRANCH_MANAGER';

-- AlterTable
ALTER TABLE "branches" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "parentBranchId" TEXT,
ADD COLUMN     "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "branch_transfers" (
    "id" TEXT NOT NULL,
    "entityType" "TransferEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "reason" TEXT,
    "transferredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branch_transfers_entityType_entityId_idx" ON "branch_transfers"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_parentBranchId_fkey" FOREIGN KEY ("parentBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_transfers" ADD CONSTRAINT "branch_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
