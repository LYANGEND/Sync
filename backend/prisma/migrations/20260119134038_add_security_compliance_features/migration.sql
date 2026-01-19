/*
  Warnings:

  - You are about to drop the column `airtelMoneyApiUrl` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `airtelMoneyClientId` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `airtelMoneyClientSecret` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `airtelMoneyEnabled` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `autoConfirmThreshold` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `bankAccountName` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `bankAccountNumber` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `bankBranchCode` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `bankName` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `bankSwiftCode` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `bankTransferEnabled` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `lencoApiToken` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `lencoApiUrl` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `lencoEnabled` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `lencoWebhookSecret` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `mtnMomoApiKey` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `mtnMomoApiUrl` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `mtnMomoApiUserId` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `mtnMomoEnabled` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `mtnMomoSubscriptionKey` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `paymentCurrency` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the column `paymentWebhookUrl` on the `platform_settings` table. All the data in the column will be lost.
  - You are about to drop the `platform_audit_logs` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[tenantId,email]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LoginAttemptStatus" AS ENUM ('SUCCESS', 'FAILED_PASSWORD', 'FAILED_USER_NOT_FOUND', 'FAILED_ACCOUNT_LOCKED', 'FAILED_2FA');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('FAILED_LOGIN', 'SUCCESSFUL_LOGIN', 'PASSWORD_CHANGE', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'SUSPICIOUS_ACTIVITY', 'DATA_EXPORT', 'DATA_DELETION', 'PERMISSION_CHANGE');

-- DropForeignKey
ALTER TABLE "platform_audit_logs" DROP CONSTRAINT "platform_audit_logs_platformUserId_fkey";

-- DropIndex
DROP INDEX "users_email_key";

-- AlterTable
ALTER TABLE "platform_settings" DROP COLUMN "airtelMoneyApiUrl",
DROP COLUMN "airtelMoneyClientId",
DROP COLUMN "airtelMoneyClientSecret",
DROP COLUMN "airtelMoneyEnabled",
DROP COLUMN "autoConfirmThreshold",
DROP COLUMN "bankAccountName",
DROP COLUMN "bankAccountNumber",
DROP COLUMN "bankBranchCode",
DROP COLUMN "bankName",
DROP COLUMN "bankSwiftCode",
DROP COLUMN "bankTransferEnabled",
DROP COLUMN "lencoApiToken",
DROP COLUMN "lencoApiUrl",
DROP COLUMN "lencoEnabled",
DROP COLUMN "lencoWebhookSecret",
DROP COLUMN "mtnMomoApiKey",
DROP COLUMN "mtnMomoApiUrl",
DROP COLUMN "mtnMomoApiUserId",
DROP COLUMN "mtnMomoEnabled",
DROP COLUMN "mtnMomoSubscriptionKey",
DROP COLUMN "paymentCurrency",
DROP COLUMN "paymentWebhookUrl";

-- DropTable
DROP TABLE "platform_audit_logs";

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "eventType" "SecurityEventType" NOT NULL,
    "status" "LoginAttemptStatus",
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "location" TEXT,
    "metadata" JSONB,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_locks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "userEmail" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT true,
    "lockReason" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "unlockedAt" TIMESTAMP(3),
    "unlockedBy" TEXT,

    CONSTRAINT "account_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_auth" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "secret" TEXT,
    "backupCodes" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "two_factor_auth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_export_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedByEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "exportType" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_deletion_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedByEmail" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deletedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_retention_policies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "entityType" TEXT NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoDelete" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_logs" (
    "id" TEXT NOT NULL,
    "backupType" TEXT NOT NULL,
    "tenantId" TEXT,
    "status" TEXT NOT NULL,
    "fileSize" BIGINT,
    "fileLocation" TEXT,
    "recordCount" INTEGER,
    "duration" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "failureReason" TEXT,

    CONSTRAINT "backup_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_tenantId_eventType_createdAt_idx" ON "security_events"("tenantId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_userEmail_createdAt_idx" ON "security_events"("userEmail", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_ipAddress_createdAt_idx" ON "security_events"("ipAddress", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_riskScore_idx" ON "security_events"("riskScore");

-- CreateIndex
CREATE UNIQUE INDEX "account_locks_userEmail_key" ON "account_locks"("userEmail");

-- CreateIndex
CREATE INDEX "account_locks_userEmail_isLocked_idx" ON "account_locks"("userEmail", "isLocked");

-- CreateIndex
CREATE UNIQUE INDEX "two_factor_auth_userId_key" ON "two_factor_auth"("userId");

-- CreateIndex
CREATE INDEX "data_export_requests_tenantId_status_idx" ON "data_export_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "data_deletion_requests_tenantId_status_idx" ON "data_deletion_requests"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "data_retention_policies_tenantId_entityType_key" ON "data_retention_policies"("tenantId", "entityType");

-- CreateIndex
CREATE INDEX "backup_logs_tenantId_status_startedAt_idx" ON "backup_logs"("tenantId", "status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_locks" ADD CONSTRAINT "account_locks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_auth" ADD CONSTRAINT "two_factor_auth_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_export_requests" ADD CONSTRAINT "data_export_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_deletion_requests" ADD CONSTRAINT "data_deletion_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_retention_policies" ADD CONSTRAINT "data_retention_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
