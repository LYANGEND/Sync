import prisma from '../utils/prisma';

// ── Feature definitions with plan-level defaults ──
const PLAN_FEATURES: Record<string, string[]> = {
  FREE:          ['ATTENDANCE', 'GRADEBOOK', 'FEE_MANAGEMENT', 'NOTIFICATIONS'],
  STARTER:       ['ATTENDANCE', 'GRADEBOOK', 'FEE_MANAGEMENT', 'NOTIFICATIONS', 'SMS', 'REPORTS', 'TIMETABLE'],
  PROFESSIONAL:  ['ATTENDANCE', 'GRADEBOOK', 'FEE_MANAGEMENT', 'NOTIFICATIONS', 'SMS', 'REPORTS', 'TIMETABLE', 'AI_TUTOR', 'VIRTUAL_CLASSROOM', 'DEBT_COLLECTION', 'WHATSAPP', 'BULK_IMPORT'],
  ENTERPRISE:    ['ATTENDANCE', 'GRADEBOOK', 'FEE_MANAGEMENT', 'NOTIFICATIONS', 'SMS', 'REPORTS', 'TIMETABLE', 'AI_TUTOR', 'VIRTUAL_CLASSROOM', 'DEBT_COLLECTION', 'WHATSAPP', 'BULK_IMPORT', 'PAYROLL', 'ACCOUNTING', 'MULTI_BRANCH', 'API_ACCESS', 'CUSTOM_FIELDS', 'WHITE_LABEL'],
};

/**
 * Check if a feature is enabled for a tenant.
 * 1. Check TenantFeature override (explicit enable/disable)
 * 2. Fall back to plan-level defaults
 */
export async function isFeatureEnabled(tenantId: string, feature: string): Promise<boolean> {
  // Explicit override?
  const override = await prisma.tenantFeature.findUnique({
    where: { tenantId_feature: { tenantId, feature } },
  });
  if (override) return override.enabled;

  // Fall back to plan defaults
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, status: true },
  });
  if (!tenant || tenant.status === 'SUSPENDED') return false;

  return PLAN_FEATURES[tenant.plan]?.includes(feature) ?? false;
}

/**
 * Get all enabled features for a tenant (plan defaults + overrides)
 */
export async function getEnabledFeatures(tenantId: string): Promise<string[]> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true, status: true },
  });
  if (!tenant || tenant.status === 'SUSPENDED') return [];

  const planDefaults = new Set(PLAN_FEATURES[tenant.plan] ?? []);

  // Apply overrides
  const overrides = await prisma.tenantFeature.findMany({
    where: { tenantId },
  });
  for (const o of overrides) {
    if (o.enabled) planDefaults.add(o.feature);
    else planDefaults.delete(o.feature);
  }

  return Array.from(planDefaults);
}

/**
 * Get feature-specific config JSON (for features that need extra settings)
 */
export async function getFeatureConfig(tenantId: string, feature: string): Promise<Record<string, any> | null> {
  const row = await prisma.tenantFeature.findUnique({
    where: { tenantId_feature: { tenantId, feature } },
    select: { config: true },
  });
  return (row?.config as Record<string, any>) ?? null;
}

export const AVAILABLE_FEATURES = [
  'ATTENDANCE', 'GRADEBOOK', 'FEE_MANAGEMENT', 'NOTIFICATIONS',
  'SMS', 'REPORTS', 'TIMETABLE', 'AI_TUTOR', 'VIRTUAL_CLASSROOM',
  'DEBT_COLLECTION', 'WHATSAPP', 'BULK_IMPORT', 'PAYROLL',
  'ACCOUNTING', 'MULTI_BRANCH', 'API_ACCESS', 'CUSTOM_FIELDS', 'WHITE_LABEL',
];
