import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { comparePassword, generateToken, hashPassword } from '../utils/auth';
import { AuthRequest } from '../middleware/authMiddleware';
import { AVAILABLE_FEATURES, getEnabledFeatures } from '../services/tenantFeatureService';
import {
  buildDomainInstructions,
  checkTenantDomainVerification,
  getPlatformCustomDomainTarget,
} from '../services/domainVerificationService';

const tenantPlanSchema = z.enum(['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE']);
const tenantStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'TRIAL']);
const onboardingStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'READY_TO_LAUNCH', 'LIVE', 'BLOCKED']);
const domainStatusSchema = z.enum(['NONE', 'PENDING_DNS', 'PENDING_VERIFICATION', 'VERIFIED', 'FAILED']);

const provisionTenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  plan: tenantPlanSchema.default('FREE'),
  status: tenantStatusSchema.default('ACTIVE'),
  domain: z.string().optional().nullable(),
  locale: z.string().default('en'),
  timezone: z.string().default('Africa/Lusaka'),
  currency: z.string().default('ZMW'),
  maxUsers: z.number().int().min(1).default(50),
  maxStudents: z.number().int().min(1).default(500),
  trialEndsAt: z.string().datetime().optional().nullable(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(6),
  adminFullName: z.string().min(2),
  branchName: z.string().min(2).default('Main Campus'),
  branchCode: z.string().min(2).default('MAIN'),
  enabledFeatures: z.array(z.string()).optional(),
});

const updateTenantSchema = z.object({
  name: z.string().min(2).optional(),
  status: tenantStatusSchema.optional(),
  plan: tenantPlanSchema.optional(),
  domain: z.string().optional().nullable(),
  domainStatus: domainStatusSchema.optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  currency: z.string().optional(),
  maxUsers: z.number().int().min(1).optional(),
  maxStudents: z.number().int().min(1).optional(),
  onboardingStatus: onboardingStatusSchema.optional(),
  onboardingOwner: z.string().max(120).optional().nullable(),
  onboardingNotes: z.string().max(2000).optional().nullable(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional().nullable(),
  trialEndsAt: z.string().datetime().optional().nullable(),
});

const featureUpdateSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.any()).optional().nullable(),
});

const maintenanceSchema = z.object({
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().max(500).optional().nullable(),
});

const onboardingUpdateSchema = z.object({
  onboardingStatus: onboardingStatusSchema,
  onboardingOwner: z.string().max(120).optional().nullable(),
  onboardingNotes: z.string().max(2000).optional().nullable(),
  onboardingChecklist: z.record(z.boolean()).optional().nullable(),
  onboardingStartedAt: z.string().datetime().optional().nullable(),
  onboardingCompletedAt: z.string().datetime().optional().nullable(),
});

const domainSetupSchema = z.object({
  domain: z.string().min(3).max(255),
});

const domainVerificationSchema = z.object({
  status: z.enum(['PENDING_VERIFICATION', 'VERIFIED', 'FAILED']).default('VERIFIED'),
  notes: z.string().max(500).optional().nullable(),
});

const impersonationSchema = z.object({
  reason: z.string().max(240).optional(),
});

const userStatusSchema = z.object({
  isActive: z.boolean(),
});

const resetPasswordSchema = z.object({
  password: z.string().min(6).optional(),
});

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const randomPassword = () => {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `Sync-${suffix}`;
};

const defaultOnboardingChecklist = {
  tenantProvisioned: true,
  schoolProfileConfigured: false,
  adminTrained: false,
  classesConfigured: false,
  usersImported: false,
  studentsImported: false,
  feesConfigured: false,
  communicationsConfigured: false,
  customDomainConfigured: false,
  goLiveApproved: false,
};

const normalizeDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

const generateDomainVerificationToken = () => `sync-verify-${Math.random().toString(36).slice(2, 10)}`;

const getActor = (req: AuthRequest) => ({
  userId: req.user?.userId || null,
  ipAddress: req.ip || req.socket.remoteAddress || null,
  userAgent: req.get('User-Agent') || null,
});

const logPlatformEvent = async (
  req: AuthRequest,
  action: string,
  entityType: string,
  entityId?: string | null,
  newValue?: unknown
) => {
  const actor = getActor(req);
  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      tenantId: 'SYSTEM',
      action,
      entityType,
      entityId: entityId || null,
      newValue: newValue as any,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    },
  }).catch((error) => {
    console.error('Platform audit log error:', error.message);
  });
};

const tenantCounts = async (tenantId: string) => {
  const [
    users,
    activeUsers,
    students,
    activeStudents,
    branches,
    classes,
    payments,
    aiUsage,
    aiFailures,
    auditEvents,
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId } }),
    prisma.user.count({ where: { tenantId, isActive: true } }),
    prisma.student.count({ where: { tenantId } }),
    prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
    prisma.branch.count({ where: { tenantId } }),
    prisma.class.count({ where: { tenantId } }),
    prisma.payment.count({ where: { tenantId } }),
    prisma.aIUsageLog.count({ where: { tenantId } }),
    prisma.aIUsageLog.count({ where: { tenantId, success: false } }),
    prisma.auditLog.count({ where: { tenantId } }),
  ]);

  return {
    users,
    activeUsers,
    students,
    activeStudents,
    branches,
    classes,
    payments,
    aiUsage,
    aiFailures,
    auditEvents,
  };
};

const numberValue = (value: unknown) => Number(value || 0);

const tenantUsageSnapshot = async (tenant: {
  id: string;
  maxUsers: number;
  maxStudents: number;
}) => {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [
    counts,
    aiUsage30d,
    aiFailures30d,
    aiTokens30d,
    aiByFeature,
    payments30d,
    overdueInvoices,
  ] = await Promise.all([
    tenantCounts(tenant.id),
    prisma.aIUsageLog.count({ where: { tenantId: tenant.id, createdAt: { gte: since30d } } }),
    prisma.aIUsageLog.count({ where: { tenantId: tenant.id, success: false, createdAt: { gte: since30d } } }),
    prisma.aIUsageLog.aggregate({
      where: { tenantId: tenant.id, createdAt: { gte: since30d } },
      _sum: { tokensUsed: true },
    }),
    prisma.aIUsageLog.groupBy({
      by: ['feature'],
      where: { tenantId: tenant.id, createdAt: { gte: since30d } },
      _count: { feature: true },
      orderBy: { _count: { feature: 'desc' } },
      take: 8,
    }),
    prisma.payment.aggregate({
      where: {
        tenantId: tenant.id,
        status: 'COMPLETED',
        paymentDate: { gte: since30d },
      },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.invoice.aggregate({
      where: {
        tenantId: tenant.id,
        dueDate: { lt: now },
        balanceDue: { gt: 0 },
      },
      _sum: { balanceDue: true },
      _count: { id: true },
    }),
  ]);

  return {
    counts,
    limits: {
      maxUsers: tenant.maxUsers,
      maxStudents: tenant.maxStudents,
      usersPercent: tenant.maxUsers ? Math.min(100, Math.round((counts.users / tenant.maxUsers) * 100)) : 0,
      studentsPercent: tenant.maxStudents ? Math.min(100, Math.round((counts.students / tenant.maxStudents) * 100)) : 0,
    },
    ai30d: {
      requests: aiUsage30d,
      failures: aiFailures30d,
      tokens: numberValue(aiTokens30d._sum.tokensUsed),
      byFeature: aiByFeature.map((item: { feature: string; _count: { feature: number } }) => ({
        feature: item.feature,
        count: item._count.feature,
      })),
    },
    billing30d: {
      paymentCount: numberValue(payments30d._count.id),
      paymentAmount: numberValue(payments30d._sum.amount),
      overdueInvoiceCount: numberValue(overdueInvoices._count.id),
      overdueBalance: numberValue(overdueInvoices._sum.balanceDue),
    },
  };
};

const logPlatformAuthEvent = async (
  req: Request,
  action: 'LOGIN' | 'LOGIN_FAILED',
  userId?: string | null,
  details?: Record<string, unknown>
) => {
  await prisma.auditLog.create({
    data: {
      userId: userId || null,
      tenantId: 'SYSTEM',
      action,
      entityType: 'Platform',
      entityId: userId || null,
      newValue: details as any,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.get('User-Agent') || null,
    },
  }).catch(() => undefined);
};

export const platformLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        role: 'PLATFORM_ADMIN',
      },
    });

    if (!user || !user.isActive) {
      await logPlatformAuthEvent(req, 'LOGIN_FAILED', user?.id, {
        email: normalizedEmail,
        reason: user ? 'inactive_account' : 'unknown_user',
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      await logPlatformAuthEvent(req, 'LOGIN_FAILED', user.id, {
        email: normalizedEmail,
        reason: 'bad_password',
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.role, '', null);

    await logPlatformAuthEvent(req, 'LOGIN', user.id, { email: normalizedEmail });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Failed to sign in' });
  }
};

export const getPlatformOverview = async (_req: AuthRequest, res: Response) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalTenants,
      activeTenants,
      suspendedTenants,
      trialTenants,
      maintenanceTenants,
      totalUsers,
      totalStudents,
      totalBranches,
      aiUsage7d,
      aiFailures7d,
      audit7d,
      failedLogins24h,
      overdueInvoices,
      recentTenants,
      tenantsByPlan,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      prisma.tenant.count({ where: { status: 'TRIAL' } }),
      prisma.tenant.count({ where: { maintenanceMode: true } }),
      prisma.user.count({ where: { role: { not: 'PLATFORM_ADMIN' } } }),
      prisma.student.count(),
      prisma.branch.count(),
      prisma.aIUsageLog.count({ where: { createdAt: { gte: since } } }),
      prisma.aIUsageLog.count({ where: { createdAt: { gte: since }, success: false } }),
      prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      prisma.auditLog.count({ where: { action: 'LOGIN_FAILED', createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      prisma.invoice.aggregate({
        where: { dueDate: { lt: new Date() }, balanceDue: { gt: 0 } },
        _sum: { balanceDue: true },
        _count: { id: true },
      }),
      prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.tenant.groupBy({
        by: ['plan'],
        _count: { plan: true },
      }),
    ]);

    res.json({
      totals: {
        tenants: totalTenants,
        activeTenants,
        suspendedTenants,
        trialTenants,
        maintenanceTenants,
        users: totalUsers,
        students: totalStudents,
        branches: totalBranches,
        aiUsage7d,
        aiFailures7d,
        auditEvents7d: audit7d,
        failedLogins24h,
        overdueInvoiceCount: overdueInvoices._count.id,
        overdueBalance: numberValue(overdueInvoices._sum.balanceDue),
      },
      tenantsByPlan: tenantsByPlan.map((item: { plan: string; _count: { plan: number } }) => ({ plan: item.plan, count: item._count.plan })),
      recentTenants,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load overview' });
  }
};

export const getPlatformHealth = async (_req: AuthRequest, res: Response) => {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - started;
    const [recentAudit, aiFailures24h] = await Promise.all([
      prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
      prisma.aIUsageLog.count({
        where: {
          success: false,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    res.json({
      api: { status: 'ok', uptimeSeconds: Math.round(process.uptime()) },
      database: { status: 'ok', latencyMs: dbLatencyMs },
      memory: process.memoryUsage(),
      auditEvents24h: recentAudit,
      aiFailures24h,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      api: { status: 'degraded', uptimeSeconds: Math.round(process.uptime()) },
      database: { status: 'error', error: error.message },
      timestamp: new Date().toISOString(),
    });
  }
};

export const provisionTenant = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = provisionTenantSchema.parse({
      ...req.body,
      slug: req.body.slug ? slugify(req.body.slug) : slugify(req.body.name || ''),
      domain: req.body.domain ? normalizeDomain(req.body.domain) : null,
      branchCode: (req.body.branchCode || 'MAIN').trim().toUpperCase(),
      adminEmail: req.body.adminEmail?.trim().toLowerCase(),
    });

    const existing = await prisma.tenant.findUnique({ where: { slug: parsed.slug } });
    if (existing) {
      return res.status(409).json({ error: `Tenant slug "${parsed.slug}" already taken` });
    }

    const existingAdminEmail = await prisma.user.findFirst({
      where: {
        email: parsed.adminEmail,
        tenantId: { not: 'SYSTEM' },
      },
    });
    if (existingAdminEmail) {
      return res.status(409).json({ error: 'Admin email is already in use by another tenant' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: parsed.name,
          slug: parsed.slug,
          plan: parsed.plan,
          status: parsed.status,
          domain: parsed.domain || null,
          domainStatus: parsed.domain ? 'PENDING_DNS' : 'NONE',
          domainDnsTarget: parsed.domain ? getPlatformCustomDomainTarget() : null,
          domainVerificationToken: parsed.domain ? generateDomainVerificationToken() : null,
          domainRequestedAt: parsed.domain ? new Date() : null,
          locale: parsed.locale,
          timezone: parsed.timezone,
          currency: parsed.currency,
          maxUsers: parsed.maxUsers,
          maxStudents: parsed.maxStudents,
          onboardingStatus: 'IN_PROGRESS',
          onboardingOwner: parsed.adminFullName,
          onboardingChecklist: {
            ...defaultOnboardingChecklist,
            customDomainConfigured: Boolean(parsed.domain),
          },
          onboardingStartedAt: new Date(),
          maintenanceMode: false,
          trialEndsAt: parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : null,
        },
      });

      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: parsed.branchName,
          code: parsed.branchCode,
          isMain: true,
        },
      });

      const admin = await tx.user.create({
        data: {
          email: parsed.adminEmail,
          passwordHash: await hashPassword(parsed.adminPassword),
          fullName: parsed.adminFullName,
          role: 'SUPER_ADMIN',
          tenantId: tenant.id,
          branchId: branch.id,
        },
      });

      await tx.schoolSettings.create({
        data: {
          schoolName: parsed.name,
          tenantId: tenant.id,
        },
      });

      if (parsed.enabledFeatures?.length) {
        await tx.tenantFeature.createMany({
          data: parsed.enabledFeatures.map((feature) => ({
            tenantId: tenant.id,
            feature,
            enabled: true,
          })),
          skipDuplicates: true,
        });
      }

      return { tenant, branch, admin };
    });

    await logPlatformEvent(req, 'CREATE', 'Tenant', result.tenant.id, {
      slug: result.tenant.slug,
      plan: result.tenant.plan,
    });

    res.status(201).json({
      tenant: result.tenant,
      branch: result.branch,
      admin: {
        id: result.admin.id,
        email: result.admin.email,
        fullName: result.admin.fullName,
        role: result.admin.role,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to provision tenant' });
  }
};

export const listTenants = async (req: Request, res: Response) => {
  try {
    const { search, status, plan } = req.query;
    const where: any = {};

    if (status && status !== 'ALL') where.status = status;
    if (plan && plan !== 'ALL') where.plan = plan;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { slug: { contains: search as string, mode: 'insensitive' } },
        { domain: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const tenants = await prisma.tenant.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const enriched = await Promise.all(
      tenants.map(async (tenant) => ({
        ...tenant,
        counts: await tenantCounts(tenant.id),
        enabledFeatures: await getEnabledFeatures(tenant.id),
      }))
    );

    res.json(enriched);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to list tenants' });
  }
};

export const getTenant = async (req: Request, res: Response) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const [counts, usage, features, featureRows, admins, settings, recentAudit, recentAiUsage] = await Promise.all([
      tenantCounts(tenant.id),
      tenantUsageSnapshot(tenant),
      getEnabledFeatures(tenant.id),
      prisma.tenantFeature.findMany({ where: { tenantId: tenant.id }, orderBy: { feature: 'asc' } }),
      prisma.user.findMany({
        where: { tenantId: tenant.id, role: { in: ['SUPER_ADMIN', 'BRANCH_MANAGER'] } },
        select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.schoolSettings.findFirst({
        where: { tenantId: tenant.id },
        select: { schoolName: true, schoolEmail: true, schoolPhone: true, schoolWebsite: true, logoUrl: true },
      }),
      prisma.auditLog.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.aIUsageLog.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      ...tenant,
      domainInstructions: tenant.domain ? buildDomainInstructions(tenant.domain, tenant.domainDnsTarget, tenant.domainVerificationToken) : null,
      counts,
      usage,
      enabledFeatures: features,
      features: AVAILABLE_FEATURES.map((feature) => {
        const override = featureRows.find((row: { feature: string; config: unknown }) => row.feature === feature);
        return {
          feature,
          enabled: features.includes(feature),
          hasOverride: !!override,
          config: override?.config ?? null,
        };
      }),
      admins,
      settings,
      recentAudit,
      recentAiUsage,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load tenant' });
  }
};

export const updateTenantAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const data = updateTenantSchema.parse(req.body);
    const normalizedDomain = data.domain === undefined ? undefined : data.domain ? normalizeDomain(data.domain) : null;
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        ...data,
        domain: normalizedDomain,
        domainRequestedAt: normalizedDomain ? new Date() : data.domain === null ? null : undefined,
        domainStatus: normalizedDomain
          ? data.domainStatus || 'PENDING_DNS'
          : data.domain === null
            ? 'NONE'
            : data.domainStatus,
        domainDnsTarget: normalizedDomain ? getPlatformCustomDomainTarget() : data.domain === null ? null : undefined,
        domainVerificationToken: normalizedDomain
          ? undefined
          : data.domain === null
            ? null
            : undefined,
        trialEndsAt: data.trialEndsAt === undefined
          ? undefined
          : data.trialEndsAt
            ? new Date(data.trialEndsAt)
            : null,
      },
    });

    await logPlatformEvent(req, 'UPDATE', 'Tenant', tenant.id, data);
    res.json(tenant);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to update tenant' });
  }
};

export const updateTenantOnboarding = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = onboardingUpdateSchema.parse(req.body);
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        onboardingStatus: parsed.onboardingStatus,
        onboardingOwner: parsed.onboardingOwner || null,
        onboardingNotes: parsed.onboardingNotes || null,
        onboardingChecklist: parsed.onboardingChecklist === null ? Prisma.JsonNull : parsed.onboardingChecklist,
        onboardingStartedAt: parsed.onboardingStartedAt
          ? new Date(parsed.onboardingStartedAt)
          : parsed.onboardingStartedAt === null
            ? null
            : undefined,
        onboardingCompletedAt: parsed.onboardingCompletedAt
          ? new Date(parsed.onboardingCompletedAt)
          : parsed.onboardingCompletedAt === null
            ? null
            : undefined,
      },
    });

    await logPlatformEvent(req, 'UPDATE_ONBOARDING', 'Tenant', tenant.id, {
      onboardingStatus: tenant.onboardingStatus,
      onboardingOwner: tenant.onboardingOwner,
    });
    res.json(tenant);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to update onboarding' });
  }
};

export const setupTenantDomain = async (req: AuthRequest, res: Response) => {
  try {
    const { domain } = domainSetupSchema.parse(req.body);
    const normalizedDomain = normalizeDomain(domain);

    const existing = await prisma.tenant.findFirst({
      where: {
        domain: normalizedDomain,
        id: { not: req.params.id },
      },
    });
    if (existing) {
      return res.status(409).json({ error: 'That custom domain is already assigned to another tenant' });
    }

    const token = generateDomainVerificationToken();
    await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        domain: normalizedDomain,
        domainStatus: 'PENDING_DNS',
        domainDnsTarget: getPlatformCustomDomainTarget(),
        domainVerificationToken: token,
        domainRequestedAt: new Date(),
        domainVerifiedAt: null,
        domainLastCheckedAt: null,
      },
    });

    const verification = await checkTenantDomainVerification(req.params.id);

    await logPlatformEvent(req, 'SETUP_CUSTOM_DOMAIN', 'Tenant', verification.tenant.id, {
      domain: normalizedDomain,
      status: verification.result.status,
    });
    res.json({
      tenant: verification.tenant,
      instructions: buildDomainInstructions(normalizedDomain, verification.tenant.domainDnsTarget, token),
      result: verification.result,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to setup custom domain' });
  }
};

export const verifyTenantDomain = async (req: AuthRequest, res: Response) => {
  try {
    const parsed = domainVerificationSchema.parse(req.body);
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        domainStatus: parsed.status,
        domainLastCheckedAt: new Date(),
        domainVerifiedAt: parsed.status === 'VERIFIED' ? new Date() : null,
      },
    });

    await logPlatformEvent(req, 'VERIFY_CUSTOM_DOMAIN', 'Tenant', tenant.id, {
      domain: tenant.domain,
      status: parsed.status,
      notes: parsed.notes || null,
    });
    res.json(tenant);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to verify custom domain' });
  }
};

export const checkTenantDomain = async (req: AuthRequest, res: Response) => {
  try {
    const verification = await checkTenantDomainVerification(req.params.id);

    await logPlatformEvent(req, 'CHECK_CUSTOM_DOMAIN', 'Tenant', verification.tenant.id, {
      domain: verification.tenant.domain,
      status: verification.result.status,
      summary: verification.result.summary,
    });

    res.json({
      tenant: verification.tenant,
      instructions: verification.tenant.domain
        ? buildDomainInstructions(
            verification.tenant.domain,
            verification.tenant.domainDnsTarget,
            verification.tenant.domainVerificationToken
          )
        : null,
      result: verification.result,
    });
  } catch (error: any) {
    const statusCode = error?.statusCode || 500;
    res.status(statusCode).json({ error: error.message || 'Failed to check custom domain DNS' });
  }
};

export const suspendTenant = async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { status: 'SUSPENDED' },
    });
    await logPlatformEvent(req, 'SUSPEND', 'Tenant', tenant.id, { status: tenant.status });
    res.json({ message: `Tenant "${tenant.name}" suspended`, tenant });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to suspend tenant' });
  }
};

export const activateTenant = async (req: AuthRequest, res: Response) => {
  try {
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE' },
    });
    await logPlatformEvent(req, 'ACTIVATE', 'Tenant', tenant.id, { status: tenant.status });
    res.json({ message: `Tenant "${tenant.name}" activated`, tenant });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to activate tenant' });
  }
};

export const setTenantMaintenance = async (req: AuthRequest, res: Response) => {
  try {
    const { maintenanceMode, maintenanceMessage } = maintenanceSchema.parse(req.body);
    const tenant = await prisma.tenant.update({
      where: { id: req.params.id },
      data: {
        maintenanceMode,
        maintenanceMessage: maintenanceMessage || null,
      },
    });

    await logPlatformEvent(req, maintenanceMode ? 'ENABLE_MAINTENANCE' : 'DISABLE_MAINTENANCE', 'Tenant', tenant.id, {
      maintenanceMode,
      maintenanceMessage: tenant.maintenanceMessage,
    });
    res.json(tenant);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to update maintenance mode' });
  }
};

export const impersonateTenantUser = async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = impersonationSchema.parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const target = await prisma.user.findFirst({
      where: {
        id: req.params.userId,
        tenantId: tenant.id,
        role: { in: ['SUPER_ADMIN', 'BRANCH_MANAGER'] },
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        tenantId: true,
        branchId: true,
        isActive: true,
      },
    });

    if (!target) return res.status(404).json({ error: 'Tenant admin not found' });
    if (!target.isActive) return res.status(400).json({ error: 'Cannot impersonate a disabled admin' });

    const token = generateToken(target.id, target.role, target.tenantId, target.branchId, {
      impersonatedBy: req.user?.userId,
      impersonationReason: reason || 'Platform support',
    });

    await logPlatformEvent(req, 'IMPERSONATE_USER', 'User', target.id, {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      email: target.email,
      reason: reason || 'Platform support',
    });

    res.json({
      token,
      user: {
        id: target.id,
        email: target.email,
        fullName: target.fullName,
        role: target.role,
        tenantId: target.tenantId,
        branchId: target.branchId,
        impersonatedBy: req.user?.userId,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to impersonate user' });
  }
};

export const updateTenantFeature = async (req: AuthRequest, res: Response) => {
  try {
    const { id, feature } = req.params;
    if (!AVAILABLE_FEATURES.includes(feature)) {
      return res.status(400).json({ error: 'Unknown feature' });
    }
    const { enabled, config } = featureUpdateSchema.parse(req.body);
    const jsonConfig = config === null ? Prisma.JsonNull : config;

    const tenant = await prisma.tenant.findUnique({ where: { id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const row = await prisma.tenantFeature.upsert({
      where: { tenantId_feature: { tenantId: id, feature } },
      create: { tenantId: id, feature, enabled, config: jsonConfig },
      update: { enabled, config: jsonConfig },
    });

    await logPlatformEvent(req, 'UPDATE_FEATURE', 'TenantFeature', row.id, { tenantId: id, feature, enabled });
    res.json(row);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to update feature' });
  }
};

export const listPlatformAuditLogs = async (req: Request, res: Response) => {
  try {
    const { tenantId, action, entityType, page = '1', limit = '50' } = req.query;
    const take = Math.min(parseInt(limit as string, 10) || 50, 100);
    const skip = ((parseInt(page as string, 10) || 1) - 1) * take;
    const where: any = {};

    if (tenantId && tenantId !== 'ALL') where.tenantId = tenantId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: parseInt(page as string, 10) || 1,
        limit: take,
        total,
        pages: Math.ceil(total / take),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load audit logs' });
  }
};

export const listPlatformSecurityEvents = async (req: Request, res: Response) => {
  try {
    const { tenantId, limit = '75' } = req.query;
    const take = Math.min(parseInt(limit as string, 10) || 75, 150);
    const actions = [
      'LOGIN',
      'LOGIN_FAILED',
      'RESET_PASSWORD',
      'ENABLE_USER',
      'DISABLE_USER',
      'IMPERSONATE_USER',
      'SUSPEND',
      'ACTIVATE',
      'ENABLE_MAINTENANCE',
      'DISABLE_MAINTENANCE',
      'UPDATE_FEATURE',
    ];
    const where: any = { action: { in: actions } };
    if (tenantId && tenantId !== 'ALL') where.tenantId = tenantId;

    const events = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
    });

    res.json(events);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load security events' });
  }
};

export const listOperationsFeed = async (_req: Request, res: Response) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const excludedAuditActions = ['LOGIN', 'LOGIN_FAILED'];

    const [aiFailures, tenantEvents, highUsageTenants, tenantDirectory] = await Promise.all([
      prisma.aIUsageLog.findMany({
        where: { success: false, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          tenantId: true,
          feature: true,
          action: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.findMany({
        where: {
          action: { notIn: excludedAuditActions },
          createdAt: { gte: since },
        },
        orderBy: { createdAt: 'desc' },
        take: 75,
      }),
      prisma.tenant.findMany({
        where: { status: { not: 'SUSPENDED' } },
        select: { id: true, name: true, slug: true, maxUsers: true, maxStudents: true },
        take: 100,
      }),
      prisma.tenant.findMany({
        select: { id: true, name: true, slug: true },
      }),
    ]);

    const tenantLookup = new Map(tenantDirectory.map((tenant) => [tenant.id, tenant]));

    const usageSignals = await Promise.all(
      highUsageTenants.map(async (tenant) => {
        const [users, students] = await Promise.all([
          prisma.user.count({ where: { tenantId: tenant.id } }),
          prisma.student.count({ where: { tenantId: tenant.id } }),
        ]);
        const userPercent = tenant.maxUsers ? Math.round((users / tenant.maxUsers) * 100) : 0;
        const studentPercent = tenant.maxStudents ? Math.round((students / tenant.maxStudents) * 100) : 0;
        const signals: any[] = [];
        if (userPercent >= 80) {
          signals.push({
            id: `${tenant.id}-users`,
            type: 'LIMIT_WARNING',
            severity: userPercent >= 100 ? 'critical' : 'warning',
            tenantId: tenant.id,
            title: `${tenant.name} is at ${userPercent}% of user limit`,
            detail: `${users}/${tenant.maxUsers} users`,
            createdAt: new Date().toISOString(),
          });
        }
        if (studentPercent >= 80) {
          signals.push({
            id: `${tenant.id}-students`,
            type: 'LIMIT_WARNING',
            severity: studentPercent >= 100 ? 'critical' : 'warning',
            tenantId: tenant.id,
            title: `${tenant.name} is at ${studentPercent}% of student limit`,
            detail: `${students}/${tenant.maxStudents} students`,
            createdAt: new Date().toISOString(),
          });
        }
        return signals;
      })
    );

    const feed = [
      ...aiFailures.map((event) => ({
        id: event.id,
        type: 'AI_FAILURE',
        severity: 'warning',
        tenantId: event.tenantId,
        title: `AI ${event.feature} failed`,
        detail: event.errorMessage || event.action,
        createdAt: event.createdAt,
      })),
      ...tenantEvents.map((event) => ({
        id: event.id,
        type: event.action,
        severity: ['SUSPEND', 'ENABLE_MAINTENANCE', 'DOMAIN_HEALTH_DEGRADED', 'DELETE', 'FAILED'].includes(event.action)
          ? 'warning'
          : ['CREATE', 'ACTIVATE', 'DOMAIN_HEALTH_RESTORED'].includes(event.action)
            ? 'info'
            : 'info',
        tenantId: event.tenantId,
        title: `${event.action.replace(/_/g, ' ')} ${event.entityType}`,
        detail: event.tenantId === 'SYSTEM'
          ? event.entityId || 'Platform event'
          : tenantLookup.get(event.tenantId)
            ? `${tenantLookup.get(event.tenantId)?.name} (${tenantLookup.get(event.tenantId)?.slug})`
            : event.entityId || event.tenantId,
        createdAt: event.createdAt,
      })),
      ...usageSignals.flat(),
    ].sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());

    res.json(feed.slice(0, 75));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load operations feed' });
  }
};

export const updatePlatformUserStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { isActive } = userStatusSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive },
      select: { id: true, email: true, fullName: true, role: true, tenantId: true, isActive: true },
    });

    await logPlatformEvent(req, isActive ? 'ENABLE_USER' : 'DISABLE_USER', 'User', user.id, {
      tenantId: user.tenantId,
      isActive,
    });
    res.json(user);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to update user' });
  }
};

export const resetPlatformUserPassword = async (req: AuthRequest, res: Response) => {
  try {
    const { password } = resetPasswordSchema.parse(req.body);
    const temporaryPassword = password || randomPassword();
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(temporaryPassword) },
      select: { id: true, email: true, fullName: true, role: true, tenantId: true },
    });

    await logPlatformEvent(req, 'RESET_PASSWORD', 'User', user.id, { tenantId: user.tenantId });
    res.json({
      user,
      temporaryPassword,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
};
