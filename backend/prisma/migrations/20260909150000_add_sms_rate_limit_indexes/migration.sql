-- Support tenant/day and tenant/user/day SMS quota seed and reconciliation queries.
CREATE INDEX "communication_logs_tenantId_channel_createdAt_idx"
ON "communication_logs"("tenantId", "channel", "createdAt");

CREATE INDEX "communication_logs_tenantId_channel_sentById_createdAt_idx"
ON "communication_logs"("tenantId", "channel", "sentById", "createdAt");

CREATE INDEX "communication_logs_channel_createdAt_tenantId_sentById_idx"
ON "communication_logs"("channel", "createdAt", "tenantId", "sentById");