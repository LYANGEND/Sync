-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SYSTEM_OWNER';

-- DropForeignKey
ALTER TABLE "users" DROP CONSTRAINT "users_schoolId_fkey";

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "schoolId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;
