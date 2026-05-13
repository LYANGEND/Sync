import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import prisma from '../utils/prisma';
import { getEnabledFeatures, AVAILABLE_FEATURES } from '../services/tenantFeatureService';

// ── GET /api/tenant ── Current tenant info + features
export const getCurrentTenant = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const enabledFeatures = await getEnabledFeatures(tenantId);

    res.json({ ...tenant, enabledFeatures, availableFeatures: AVAILABLE_FEATURES });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── PUT /api/tenant ── Update tenant profile (name, domain, locale, etc.)
export const updateTenant = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });

    const { name, domain, locale, timezone, currency } = req.body;
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: { name, domain, locale, timezone, currency },
    });

    res.json(tenant);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/tenant/features ── List features with status
export const listFeatures = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });

    const enabledFeatures = await getEnabledFeatures(tenantId);
    const overrides = await prisma.tenantFeature.findMany({ where: { tenantId } });
    const overrideMap = Object.fromEntries(overrides.map(o => [o.feature, { enabled: o.enabled, config: o.config }]));

    const features = AVAILABLE_FEATURES.map(f => ({
      feature: f,
      enabled: enabledFeatures.includes(f),
      hasOverride: !!overrideMap[f],
      config: overrideMap[f]?.config ?? null,
    }));

    res.json(features);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── PUT /api/tenant/features/:feature ── Toggle or configure a feature (SUPER_ADMIN only)
export const updateFeature = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });

    const { feature } = req.params;
    const { enabled, config } = req.body;

    const result = await prisma.tenantFeature.upsert({
      where: { tenantId_feature: { tenantId, feature } },
      create: { tenantId, feature, enabled, config },
      update: { enabled, config },
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/tenant/custom-fields?entity=STUDENT ── List custom fields
export const listCustomFields = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });

    const { entity } = req.query;
    const where: any = { tenantId };
    if (entity) where.entity = entity;

    const fields = await prisma.tenantCustomField.findMany({
      where,
      orderBy: [{ entity: 'asc' }, { sortOrder: 'asc' }],
    });

    res.json(fields);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/tenant/custom-fields ── Create a custom field
export const createCustomField = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'Tenant context required' });

    const { entity, fieldName, fieldLabel, fieldType, options, required, sortOrder } = req.body;

    const field = await prisma.tenantCustomField.create({
      data: { tenantId, entity, fieldName, fieldLabel, fieldType, options, required, sortOrder },
    });

    res.status(201).json(field);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── DELETE /api/tenant/custom-fields/:id ── Remove a custom field + its values
export const deleteCustomField = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.customFieldValue.deleteMany({ where: { customFieldId: id } });
    await prisma.tenantCustomField.delete({ where: { id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/tenant/custom-fields/:entityId/values ── Get custom field values for an entity
export const getCustomFieldValues = async (req: AuthRequest, res: Response) => {
  try {
    const { entityId } = req.params;
    const values = await prisma.customFieldValue.findMany({
      where: { entityId },
    });
    res.json(values);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ── PUT /api/tenant/custom-fields/:entityId/values ── Bulk upsert custom field values
export const saveCustomFieldValues = async (req: AuthRequest, res: Response) => {
  try {
    const { entityId } = req.params;
    const { values } = req.body; // [{ customFieldId, value }]

    const results = await Promise.all(
      values.map((v: { customFieldId: string; value: string }) =>
        prisma.customFieldValue.upsert({
          where: { customFieldId_entityId: { customFieldId: v.customFieldId, entityId } },
          create: { customFieldId: v.customFieldId, entityId, value: v.value },
          update: { value: v.value },
        })
      )
    );

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
