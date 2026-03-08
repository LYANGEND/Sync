-- CreateEnum
CREATE TYPE "FinancialReportType" AS ENUM ('AUDIT_REPORT', 'INCOME_STATEMENT', 'FEE_STATEMENT', 'AGED_RECEIVABLES', 'CASH_FLOW', 'COMPLIANCE', 'CUSTOM');

-- CreateTable
CREATE TABLE "financial_reports" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reportType" "FinancialReportType" NOT NULL DEFAULT 'CUSTOM',
    "termId" TEXT,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB NOT NULL,
    "summary" TEXT,
    "generatedBy" TEXT NOT NULL,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_reports_branchId_reportDate_idx" ON "financial_reports"("branchId", "reportDate");

-- CreateIndex
CREATE INDEX "financial_reports_termId_idx" ON "financial_reports"("termId");

-- AddForeignKey
ALTER TABLE "financial_reports" ADD CONSTRAINT "financial_reports_termId_fkey" FOREIGN KEY ("termId") REFERENCES "academic_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_reports" ADD CONSTRAINT "financial_reports_generatedBy_fkey" FOREIGN KEY ("generatedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_reports" ADD CONSTRAINT "financial_reports_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
