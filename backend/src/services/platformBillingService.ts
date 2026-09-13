import { Prisma, TenantPlan, BillingCycle, SupportTier, PlatformInvoiceStatus } from '@prisma/client';
import { systemPrisma as prisma } from '../utils/prisma';
import { sendEmail } from './emailService';
import { generatePlatformInvoiceIssuedEmail, generatePlatformInvoicePaidEmail } from './notificationService';
import { runWithTenant } from '../middleware/tenantContext';

/**
 * Emails all active tenant admins (SUPER_ADMIN/BRANCH_MANAGER) for platform billing events.
 * Sent through the tenant's own configured SMTP settings (same as any other tenant email),
 * so it runs inside that tenant's request context. Never throws — a missing/broken SMTP
 * config just results in a logged warning, matching the behavior of every other email send.
 */
const notifyTenantAdmins = async (tenantId: string, subject: string, html: string) => {
  try {
    const admins = await prisma.user.findMany({
      where: { tenantId, role: { in: ['SUPER_ADMIN', 'BRANCH_MANAGER'] }, isActive: true },
      select: { email: true },
    });
    await runWithTenant(tenantId, async () => {
      await Promise.all(
        admins
          .filter((admin) => admin.email)
          .map((admin) => sendEmail(admin.email, subject, html, { source: 'platform_billing' }))
      );
    });
  } catch (error) {
    console.error('[PlatformBilling] Failed to notify tenant admins:', error);
  }
};

// ---------------------------------------------------------------------------
// Platform billing — SaaS billing of tenants (schools) by the Sync platform.
// This is entirely separate from a school's own fee billing of parents/students
// (Payment/Invoice models), which is scoped inside each tenant.
// ---------------------------------------------------------------------------

const DEFAULT_PLAN_PRICING: Record<TenantPlan, {
  pricePerActiveStudent: number;
  setupFeeAmount: number;
  setupFeeWaivedOnAnnual: boolean;
  aiIncludedUnits: number;
  smsIncludedUnits: number;
  minimumMonthlyBill: number;
}> = {
  FREE: {
    pricePerActiveStudent: 0,
    setupFeeAmount: 0,
    setupFeeWaivedOnAnnual: true,
    aiIncludedUnits: 200,
    smsIncludedUnits: 50,
    minimumMonthlyBill: 0,
  },
  STARTER: {
    pricePerActiveStudent: 10,
    setupFeeAmount: 500,
    setupFeeWaivedOnAnnual: false,
    aiIncludedUnits: 1000,
    smsIncludedUnits: 300,
    minimumMonthlyBill: 500,
  },
  PROFESSIONAL: {
    pricePerActiveStudent: 10,
    setupFeeAmount: 1500,
    setupFeeWaivedOnAnnual: true,
    aiIncludedUnits: 3000,
    smsIncludedUnits: 1000,
    minimumMonthlyBill: 800,
  },
  ENTERPRISE: {
    pricePerActiveStudent: 10,
    setupFeeAmount: 3000,
    setupFeeWaivedOnAnnual: true,
    aiIncludedUnits: 10000,
    smsIncludedUnits: 5000,
    minimumMonthlyBill: 1500,
  },
};

const numberValue = (value: unknown) => Number(value || 0);

/** Idempotently seeds default pricing rows/settings the first time billing is used. */
export const ensureDefaultPricing = async () => {
  await Promise.all(
    (Object.keys(DEFAULT_PLAN_PRICING) as TenantPlan[]).map((plan) =>
      prisma.platformPlanPricing.upsert({
        where: { plan },
        update: {},
        create: { plan, ...DEFAULT_PLAN_PRICING[plan] },
      })
    )
  );

  await prisma.platformBillingSettings.upsert({
    where: { singleton: true },
    update: {},
    create: { singleton: true },
  });
};

export const getPricingConfigs = async () => {
  await ensureDefaultPricing();
  const [plans, settings] = await Promise.all([
    prisma.platformPlanPricing.findMany({ orderBy: { plan: 'asc' } }),
    prisma.platformBillingSettings.findUnique({ where: { singleton: true } }),
  ]);
  return { plans, settings };
};

export const updatePlanPricing = async (plan: TenantPlan, data: Partial<{
  pricePerActiveStudent: number;
  setupFeeAmount: number;
  setupFeeWaivedOnAnnual: boolean;
  aiIncludedUnits: number;
  smsIncludedUnits: number;
  minimumMonthlyBill: number;
}>) => {
  await ensureDefaultPricing();
  return prisma.platformPlanPricing.update({ where: { plan }, data });
};

export const updateBillingSettings = async (data: Partial<{
  supportFeeBasic: number;
  supportFeePriority: number;
  supportFeeDedicated: number;
  aiOverageRatePerUnit: number;
  smsOverageRatePerUnit: number;
  annualDiscountPercent: number;
  trialAiIncludedUnits: number;
  trialSmsIncludedUnits: number;
}>) => {
  await ensureDefaultPricing();
  return prisma.platformBillingSettings.update({ where: { singleton: true }, data });
};

export const getOrCreateTenantBillingProfile = async (tenantId: string) => {
  return prisma.tenantBillingProfile.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId },
  });
};

export const updateTenantBillingProfile = async (tenantId: string, data: Partial<{
  billingCycle: BillingCycle;
  supportTier: SupportTier;
  customPricePerStudent: number | null;
  notes: string | null;
}>) => {
  await getOrCreateTenantBillingProfile(tenantId);
  return prisma.tenantBillingProfile.update({ where: { tenantId }, data });
};

const supportFeeForTier = (settings: { supportFeeBasic: Prisma.Decimal; supportFeePriority: Prisma.Decimal; supportFeeDedicated: Prisma.Decimal }, tier: SupportTier) => {
  if (tier === 'PRIORITY') return numberValue(settings.supportFeePriority);
  if (tier === 'DEDICATED') return numberValue(settings.supportFeeDedicated);
  return numberValue(settings.supportFeeBasic);
};

interface InvoiceBreakdown {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
  billingCycle: BillingCycle;
  activeStudentCount: number;
  studentCharge: number;
  setupFeeCharge: number;
  supportFeeCharge: number;
  aiIncludedUnits: number;
  aiUsedUnits: number;
  aiOverageUnits: number;
  aiOverageCharge: number;
  smsIncludedUnits: number;
  smsUsedUnits: number;
  smsOverageUnits: number;
  smsOverageCharge: number;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
}

/**
 * Computes what a tenant would be billed for a given period without persisting anything.
 * Billing basis is ACTIVE students only — GRADUATED/TRANSFERRED/DROPPED_OUT/ARCHIVED students
 * are excluded automatically once staff update the student's status.
 */
export const computeTenantInvoicePreview = async (tenantId: string, periodStart: Date, periodEnd: Date): Promise<InvoiceBreakdown> => {
  await ensureDefaultPricing();

  const [tenant, profile, settings, activeStudentCount, aiUsedUnits, smsUsedUnits] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    getOrCreateTenantBillingProfile(tenantId),
    prisma.platformBillingSettings.findUniqueOrThrow({ where: { singleton: true } }),
    prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.aIUsageLog.count({ where: { tenantId, createdAt: { gte: periodStart, lt: periodEnd } } }),
    prisma.communicationLog.count({
      where: {
        tenantId,
        channel: { in: ['SMS', 'WHATSAPP'] },
        status: 'SENT',
        createdAt: { gte: periodStart, lt: periodEnd },
      },
    }),
  ]);

  const planPricing = await prisma.platformPlanPricing.findUniqueOrThrow({ where: { plan: tenant.plan } });
  const isFreeOrTrial = tenant.status === 'TRIAL' || tenant.plan === 'FREE';

  const pricePerStudent = profile.customPricePerStudent != null
    ? numberValue(profile.customPricePerStudent)
    : numberValue(planPricing.pricePerActiveStudent);

  const studentCharge = isFreeOrTrial ? 0 : activeStudentCount * pricePerStudent;
  const supportFeeCharge = isFreeOrTrial ? 0 : supportFeeForTier(settings, profile.supportTier);

  const setupFeeWaived = isFreeOrTrial || (planPricing.setupFeeWaivedOnAnnual && profile.billingCycle === 'ANNUAL');
  const setupFeeCharge = !profile.setupFeeInvoiced && !setupFeeWaived ? numberValue(planPricing.setupFeeAmount) : 0;

  const aiIncludedUnits = isFreeOrTrial ? settings.trialAiIncludedUnits : planPricing.aiIncludedUnits;
  const aiOverageUnits = Math.max(0, aiUsedUnits - aiIncludedUnits);
  const aiOverageCharge = aiOverageUnits * numberValue(settings.aiOverageRatePerUnit);

  const smsIncludedUnits = isFreeOrTrial ? settings.trialSmsIncludedUnits : planPricing.smsIncludedUnits;
  const smsOverageUnits = Math.max(0, smsUsedUnits - smsIncludedUnits);
  const smsOverageCharge = smsOverageUnits * numberValue(settings.smsOverageRatePerUnit);

  const recurringSubtotal = studentCharge + supportFeeCharge;
  const subtotal = recurringSubtotal + setupFeeCharge + aiOverageCharge + smsOverageCharge;

  const discountAmount = !isFreeOrTrial && profile.billingCycle === 'ANNUAL'
    ? recurringSubtotal * (numberValue(settings.annualDiscountPercent) / 100)
    : 0;

  // Revenue floor applies to recurring + overage charges only, never to the one-time setup fee.
  const floor = isFreeOrTrial ? 0 : numberValue(planPricing.minimumMonthlyBill);
  const recurringAndOverage = subtotal - setupFeeCharge - discountAmount;
  const flooredRecurring = Math.max(recurringAndOverage, floor);
  const finalTotal = flooredRecurring + setupFeeCharge;

  return {
    tenantId,
    periodStart,
    periodEnd,
    billingCycle: profile.billingCycle,
    activeStudentCount,
    studentCharge,
    setupFeeCharge,
    supportFeeCharge,
    aiIncludedUnits,
    aiUsedUnits,
    aiOverageUnits,
    aiOverageCharge,
    smsIncludedUnits,
    smsUsedUnits,
    smsOverageUnits,
    smsOverageCharge,
    subtotal,
    discountAmount,
    totalAmount: finalTotal,
  };
};

/** Generates (or refreshes existing DRAFT) invoices for every non-suspended tenant for the given period. */
export const generateInvoicesForPeriod = async (periodStart: Date, periodEnd: Date) => {
  await ensureDefaultPricing();

  const tenants = await prisma.tenant.findMany({
    where: { status: { not: 'SUSPENDED' } },
    select: { id: true },
  });

  const results = [];
  for (const tenant of tenants) {
    const existing = await prisma.platformInvoice.findUnique({
      where: { tenantId_periodStart_periodEnd: { tenantId: tenant.id, periodStart, periodEnd } },
    });

    // Never overwrite an invoice that has already been issued/paid.
    if (existing && existing.status !== 'DRAFT') {
      results.push(existing);
      continue;
    }

    const breakdown = await computeTenantInvoicePreview(tenant.id, periodStart, periodEnd);

    const invoice = await prisma.platformInvoice.upsert({
      where: { tenantId_periodStart_periodEnd: { tenantId: tenant.id, periodStart, periodEnd } },
      update: {
        billingCycle: breakdown.billingCycle,
        activeStudentCount: breakdown.activeStudentCount,
        studentCharge: breakdown.studentCharge,
        setupFeeCharge: breakdown.setupFeeCharge,
        supportFeeCharge: breakdown.supportFeeCharge,
        aiIncludedUnits: breakdown.aiIncludedUnits,
        aiUsedUnits: breakdown.aiUsedUnits,
        aiOverageUnits: breakdown.aiOverageUnits,
        aiOverageCharge: breakdown.aiOverageCharge,
        smsIncludedUnits: breakdown.smsIncludedUnits,
        smsUsedUnits: breakdown.smsUsedUnits,
        smsOverageUnits: breakdown.smsOverageUnits,
        smsOverageCharge: breakdown.smsOverageCharge,
        subtotal: breakdown.subtotal,
        discountAmount: breakdown.discountAmount,
        totalAmount: breakdown.totalAmount,
      },
      create: {
        tenantId: tenant.id,
        periodStart,
        periodEnd,
        billingCycle: breakdown.billingCycle,
        activeStudentCount: breakdown.activeStudentCount,
        studentCharge: breakdown.studentCharge,
        setupFeeCharge: breakdown.setupFeeCharge,
        supportFeeCharge: breakdown.supportFeeCharge,
        aiIncludedUnits: breakdown.aiIncludedUnits,
        aiUsedUnits: breakdown.aiUsedUnits,
        aiOverageUnits: breakdown.aiOverageUnits,
        aiOverageCharge: breakdown.aiOverageCharge,
        smsIncludedUnits: breakdown.smsIncludedUnits,
        smsUsedUnits: breakdown.smsUsedUnits,
        smsOverageUnits: breakdown.smsOverageUnits,
        smsOverageCharge: breakdown.smsOverageCharge,
        subtotal: breakdown.subtotal,
        discountAmount: breakdown.discountAmount,
        totalAmount: breakdown.totalAmount,
      },
    });

    results.push(invoice);
  }

  return results;
};

export const listInvoices = async (filters: { tenantId?: string; status?: PlatformInvoiceStatus; take?: number }) => {
  return prisma.platformInvoice.findMany({
    where: {
      tenantId: filters.tenantId || undefined,
      status: filters.status || undefined,
    },
    orderBy: { periodStart: 'desc' },
    take: filters.take || 100,
  });
};

export const issueInvoice = async (id: string) => {
  const invoice = await prisma.platformInvoice.update({
    where: { id },
    data: { status: 'ISSUED', issuedAt: new Date(), dueAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
  });

  if (numberValue(invoice.setupFeeCharge) > 0) {
    await prisma.tenantBillingProfile.updateMany({
      where: { tenantId: invoice.tenantId },
      data: { setupFeeInvoiced: true },
    });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: invoice.tenantId }, select: { name: true, currency: true } });
  if (tenant && invoice.dueAt) {
    const { subject, html } = generatePlatformInvoiceIssuedEmail(
      tenant.name,
      invoice.periodStart,
      invoice.periodEnd,
      invoice.activeStudentCount,
      numberValue(invoice.totalAmount),
      invoice.dueAt,
      tenant.currency
    );
    notifyTenantAdmins(invoice.tenantId, subject, html).catch((err) => console.error('[PlatformBilling] Issue notification failed:', err));
  }

  return invoice;
};

export const markInvoicePaid = async (id: string) => {
  const invoice = await prisma.platformInvoice.update({
    where: { id },
    data: { status: 'PAID', paidAt: new Date() },
  });

  const tenant = await prisma.tenant.findUnique({ where: { id: invoice.tenantId }, select: { name: true, currency: true } });
  if (tenant) {
    const { subject, html } = generatePlatformInvoicePaidEmail(
      tenant.name,
      invoice.periodStart,
      invoice.periodEnd,
      numberValue(invoice.totalAmount),
      tenant.currency
    );
    notifyTenantAdmins(invoice.tenantId, subject, html).catch((err) => console.error('[PlatformBilling] Paid notification failed:', err));
  }

  return invoice;
};

export const voidInvoice = async (id: string) => {
  return prisma.platformInvoice.update({ where: { id }, data: { status: 'VOID' } });
};
