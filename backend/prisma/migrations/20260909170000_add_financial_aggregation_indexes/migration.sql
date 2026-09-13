-- T-009 / TV-014: support tenant-scoped financial aggregation paths.
CREATE INDEX "students_tenantId_branchId_status_idx"
  ON "students"("tenantId", "branchId", "status");

CREATE INDEX "student_fee_structures_tenantId_studentId_idx"
  ON "student_fee_structures"("tenantId", "studentId");

CREATE INDEX "payments_tenantId_status_studentId_idx"
  ON "payments"("tenantId", "status", "studentId");

CREATE INDEX "payments_tenantId_status_paymentDate_idx"
  ON "payments"("tenantId", "status", "paymentDate");

CREATE INDEX "journal_entries_tenantId_isPosted_date_idx"
  ON "journal_entries"("tenantId", "isPosted", "date");