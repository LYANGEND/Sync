-- T-009 / TV-014: support branch-scoped posted-entry lookup and line reduction.
CREATE INDEX "journal_entries_tenantId_branchId_isPosted_date_idx"
  ON "journal_entries"("tenantId", "branchId", "isPosted", "date");

CREATE INDEX "journal_entry_lines_tenantId_journalId_accountId_idx"
  ON "journal_entry_lines"("tenantId", "journalId", "accountId");