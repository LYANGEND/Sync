import { systemPrisma } from './prisma';
import { runWithTenant } from '../middleware/tenantContext';
import crypto from 'crypto';

const schedulerOwner = `${process.pid}-${crypto.randomUUID()}`;

async function acquireLease(jobName: string, tenantId: string, leaseMs: number): Promise<boolean> {
  const leaseId = crypto.randomUUID();
  const lockedUntil = new Date(Date.now() + leaseMs);
  const rows = await systemPrisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "scheduled_job_leases" ("id", "name", "tenantId", "owner", "lockedUntil", "createdAt", "updatedAt")
    VALUES (${leaseId}, ${jobName}, ${tenantId}, ${schedulerOwner}, ${lockedUntil}, NOW(), NOW())
    ON CONFLICT ("name", "tenantId") DO UPDATE
      SET "owner" = EXCLUDED."owner",
          "lockedUntil" = EXCLUDED."lockedUntil",
          "updatedAt" = NOW()
      WHERE "scheduled_job_leases"."lockedUntil" <= NOW()
    RETURNING "id"
  `;
  return rows.length === 1;
}

export async function forEachActiveTenant(
  jobName: string,
  operation: (tenantId: string) => Promise<void>,
  leaseMs = 50_000,
): Promise<void> {
  const tenants = await systemPrisma.tenant.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, slug: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const tenant of tenants) {
    try {
      if (!await acquireLease(jobName, tenant.id, leaseMs)) continue;
      await runWithTenant(tenant.id, () => operation(tenant.id));
    } catch (error) {
      console.error(`[${jobName}] Failed for tenant ${tenant.slug} (${tenant.id}):`, error);
    }
  }
}