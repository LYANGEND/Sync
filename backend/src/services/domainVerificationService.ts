import { resolveCname, resolveTxt } from 'node:dns/promises';
import { Prisma, Tenant, TenantDomainStatus } from '@prisma/client';
import { systemPrisma as prisma } from '../utils/prisma';
import { broadcastNotification } from './notificationService';
import { runWithTenant } from '../middleware/tenantContext';

type TenantDomainRecord = Pick<
  Tenant,
  'id' | 'name' | 'domain' | 'domainStatus' | 'domainDnsTarget' | 'domainVerificationToken' | 'domainVerifiedAt' | 'domainLastCheckedAt' | 'onboardingChecklist'
>;

interface DomainRecordCheck {
  host: string;
  expected: string | null;
  resolved: string[];
  matched: boolean;
  error: string | null;
}

export interface TenantDomainVerificationResult {
  status: TenantDomainStatus;
  verified: boolean;
  checkedAt: string;
  summary: string;
  cname: DomainRecordCheck;
  txt: DomainRecordCheck;
}

type TenantDomainStatusSummarySource = Pick<
  Tenant,
  'id' | 'name' | 'slug' | 'domain' | 'domainStatus' | 'domainDnsTarget' | 'domainVerificationToken' | 'domainRequestedAt' | 'domainVerifiedAt' | 'domainLastCheckedAt'
>;

const normalizeDnsValue = (value: string) => value.trim().toLowerCase().replace(/\.$/, '');

const flattenTxtRecords = (records: string[][]) => records.map((record) => normalizeDnsValue(record.join('')));

const dnsErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') return 'Unknown DNS lookup error';
  const code = 'code' in error ? String((error as { code?: string }).code) : null;
  if (code === 'ENODATA' || code === 'ENOTFOUND') return 'Record not found yet';
  if (code === 'ETIMEOUT') return 'DNS lookup timed out';
  if (code === 'ECONNREFUSED') return 'DNS resolver refused the request';
  return (error as { message?: string }).message || 'DNS lookup failed';
};

export const getPlatformCustomDomainTarget = () => process.env.PLATFORM_CUSTOM_DOMAIN_TARGET || 'cname.sync.yourdomain.com';

export const buildDomainInstructions = (domain: string, target: string | null, token: string | null) => ({
  type: 'CNAME',
  host: domain,
  target,
  txtName: `_sync-verify.${domain}`,
  txtValue: token,
});

export const buildTenantDomainStatusSummary = (
  tenant: TenantDomainStatusSummarySource,
  verification?: TenantDomainVerificationResult | null
) => ({
  tenantId: tenant.id,
  tenantName: tenant.name,
  tenantSlug: tenant.slug,
  domain: tenant.domain,
  domainStatus: tenant.domainStatus,
  domainRequestedAt: tenant.domainRequestedAt,
  domainVerifiedAt: tenant.domainVerifiedAt,
  domainLastCheckedAt: tenant.domainLastCheckedAt,
  instructions: tenant.domain ? buildDomainInstructions(tenant.domain, tenant.domainDnsTarget, tenant.domainVerificationToken) : null,
  verification: verification || null,
});

const createSystemAuditEvent = async (
  tenantId: string,
  action: string,
  entityId: string,
  details: Record<string, unknown>
) => {
  await prisma.auditLog.create({
    data: {
      tenantId: 'SYSTEM',
      action,
      entityType: 'TenantDomain',
      entityId,
      newValue: details as Prisma.InputJsonValue,
    },
  }).catch((error) => {
    console.error('[DomainVerification] Failed to write audit event:', error);
  });
};

const notifyTenantAdmins = async (tenantId: string, title: string, message: string, type: 'WARNING' | 'SUCCESS') => {
  const admins = await prisma.user.findMany({
    where: {
      tenantId,
      role: { in: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
      isActive: true,
    },
    select: { id: true },
  });

  if (!admins.length) return;
  await runWithTenant(tenantId, () => broadcastNotification(admins.map((admin) => admin.id), title, message, type)).catch((error) => {
    console.error('[DomainVerification] Failed to notify tenant admins:', error);
  });
};

const emitDomainTransitionAlerts = async (
  tenant: Pick<Tenant, 'id' | 'name' | 'slug' | 'domain' | 'domainStatus' | 'domainVerifiedAt'>,
  result: TenantDomainVerificationResult
) => {
  const wasVerified = tenant.domainStatus === 'VERIFIED';
  const isVerified = result.verified;

  if (wasVerified && !isVerified) {
    const title = 'Custom domain needs attention';
    const message = `${tenant.domain || tenant.slug} is no longer verifying correctly. ${result.summary}`;
    await Promise.all([
      createSystemAuditEvent('SYSTEM', 'DOMAIN_HEALTH_DEGRADED', tenant.id, {
        tenantId: tenant.id,
        tenantName: tenant.name,
        domain: tenant.domain,
        status: result.status,
        summary: result.summary,
      }),
      notifyTenantAdmins(tenant.id, title, message, 'WARNING'),
    ]);
    return;
  }

  if (!wasVerified && isVerified) {
    const title = 'Custom domain verified';
    const message = `${tenant.domain || tenant.slug} is now verified and ready to use.`;
    await Promise.all([
      createSystemAuditEvent('SYSTEM', 'DOMAIN_HEALTH_RESTORED', tenant.id, {
        tenantId: tenant.id,
        tenantName: tenant.name,
        domain: tenant.domain,
        status: result.status,
        summary: result.summary,
      }),
      notifyTenantAdmins(tenant.id, title, message, 'SUCCESS'),
    ]);
  }
};

const resolveCnameRecord = async (host: string, expected: string | null): Promise<DomainRecordCheck> => {
  try {
    const resolved = (await resolveCname(host)).map(normalizeDnsValue);
    const normalizedExpected = expected ? normalizeDnsValue(expected) : null;
    return {
      host,
      expected,
      resolved,
      matched: Boolean(normalizedExpected) && resolved.includes(normalizedExpected as string),
      error: null,
    };
  } catch (error) {
    return {
      host,
      expected,
      resolved: [],
      matched: false,
      error: dnsErrorMessage(error),
    };
  }
};

const resolveTxtRecord = async (host: string, expected: string | null): Promise<DomainRecordCheck> => {
  try {
    const resolved = flattenTxtRecords(await resolveTxt(host));
    const normalizedExpected = expected ? normalizeDnsValue(expected) : null;
    return {
      host,
      expected,
      resolved,
      matched: Boolean(normalizedExpected) && resolved.includes(normalizedExpected as string),
      error: null,
    };
  } catch (error) {
    return {
      host,
      expected,
      resolved: [],
      matched: false,
      error: dnsErrorMessage(error),
    };
  }
};

export const evaluateTenantDomainVerification = async (tenant: TenantDomainRecord): Promise<TenantDomainVerificationResult> => {
  const checkedAt = new Date().toISOString();

  if (!tenant.domain) {
    return {
      status: 'NONE',
      verified: false,
      checkedAt,
      summary: 'No custom domain is configured for this tenant yet.',
      cname: { host: '', expected: null, resolved: [], matched: false, error: null },
      txt: { host: '', expected: null, resolved: [], matched: false, error: null },
    };
  }

  const expectedTarget = tenant.domainDnsTarget ? normalizeDnsValue(tenant.domainDnsTarget) : null;
  const expectedToken = tenant.domainVerificationToken ? normalizeDnsValue(tenant.domainVerificationToken) : null;
  const txtHost = `_sync-verify.${tenant.domain}`;

  const [cname, txt] = await Promise.all([
    resolveCnameRecord(tenant.domain, expectedTarget),
    resolveTxtRecord(txtHost, expectedToken),
  ]);

  let status: TenantDomainStatus = 'FAILED';
  let summary = 'DNS records do not match the expected values yet.';

  if (cname.matched && txt.matched) {
    status = 'VERIFIED';
    summary = 'CNAME and TXT verification records match. Custom domain is ready to use.';
  } else if (!cname.resolved.length && !txt.resolved.length) {
    status = 'PENDING_DNS';
    summary = 'Waiting for DNS propagation. No matching CNAME or TXT records were found yet.';
  } else if (!cname.matched) {
    status = cname.resolved.length ? 'FAILED' : 'PENDING_DNS';
    summary = cname.resolved.length
      ? `CNAME points to ${cname.resolved.join(', ')} instead of ${expectedTarget}.`
      : 'Waiting for the custom domain CNAME record to propagate.';
  } else if (!txt.matched) {
    status = txt.resolved.length ? 'FAILED' : 'PENDING_VERIFICATION';
    summary = txt.resolved.length
      ? `TXT verification record is ${txt.resolved.join(', ')} instead of ${expectedToken}.`
      : 'CNAME is correct. Waiting for the TXT verification record to propagate.';
  }

  return {
    status,
    verified: status === 'VERIFIED',
    checkedAt,
    summary,
    cname,
    txt,
  };
};

const applyVerifiedChecklist = (checklist: Tenant['onboardingChecklist']) => {
  if (!checklist || typeof checklist !== 'object' || Array.isArray(checklist)) {
    return { customDomainConfigured: true } as Prisma.InputJsonValue;
  }

  return {
    ...(checklist as Prisma.JsonObject),
    customDomainConfigured: true,
  } as Prisma.InputJsonValue;
};

export const checkTenantDomainVerification = async (tenantId: string) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      domain: true,
      domainStatus: true,
      domainDnsTarget: true,
      domainVerificationToken: true,
      domainRequestedAt: true,
      domainVerifiedAt: true,
      domainLastCheckedAt: true,
      onboardingChecklist: true,
    },
  });

  if (!tenant) {
    const error = new Error('Tenant not found') as Error & { statusCode?: number };
    error.statusCode = 404;
    throw error;
  }

  const result = await evaluateTenantDomainVerification(tenant);
  const checkedAtDate = new Date(result.checkedAt);

  const updatedTenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      domainStatus: result.status,
      domainLastCheckedAt: checkedAtDate,
      domainVerifiedAt: result.verified ? checkedAtDate : null,
      onboardingChecklist: result.verified ? applyVerifiedChecklist(tenant.onboardingChecklist) : undefined,
    },
  });

  await emitDomainTransitionAlerts(tenant, result);

  return { tenant: updatedTenant, result };
};

let isDomainVerificationRunning = false;

export const runPendingTenantDomainChecks = async (limit = Number(process.env.DOMAIN_VERIFICATION_BATCH_SIZE || 20)) => {
  if (isDomainVerificationRunning) {
    console.log('[DomainVerification] Previous check still running, skipping...');
    return;
  }

  isDomainVerificationRunning = true;
  try {
    const tenants = await prisma.tenant.findMany({
      where: {
        domain: { not: null },
        domainStatus: { in: ['PENDING_DNS', 'PENDING_VERIFICATION', 'FAILED'] },
      },
      orderBy: [
        { domainLastCheckedAt: 'asc' },
        { updatedAt: 'asc' },
      ],
      take: limit,
      select: { id: true, name: true },
    });

    if (!tenants.length) {
      return;
    }

    console.log(`[DomainVerification] Checking ${tenants.length} tenant domain(s)`);
    for (const tenant of tenants) {
      const outcome = await checkTenantDomainVerification(tenant.id);
      console.log(`[DomainVerification] ${tenant.name}: ${outcome.result.status} — ${outcome.result.summary}`);
    }
  } catch (error) {
    console.error('[DomainVerification] Batch verification failed:', error);
  } finally {
    isDomainVerificationRunning = false;
  }
};

export const initDomainVerificationScheduler = () => {
  const intervalMs = Number(process.env.DOMAIN_VERIFICATION_INTERVAL_MS || 10 * 60 * 1000);

  setInterval(() => {
    runPendingTenantDomainChecks().catch((error) => {
      console.error('[DomainVerification] Scheduled verification failed:', error);
    });
  }, intervalMs);

  setTimeout(() => {
    runPendingTenantDomainChecks().catch((error) => {
      console.error('[DomainVerification] Initial verification failed:', error);
    });
  }, 15 * 1000);

  console.log(`[DomainVerification] Initialized — pending domains checked every ${Math.round(intervalMs / 1000)}s`);
};