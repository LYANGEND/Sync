-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'FAILED';

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_recordedByUserId_fkey";

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "mobile_money_collections" ADD COLUMN     "branchId" TEXT,
ALTER COLUMN "initiatedByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "branchId" TEXT,
ALTER COLUMN "recordedByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_money_collections" ADD CONSTRAINT "mobile_money_collections_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
