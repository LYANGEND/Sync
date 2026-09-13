import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId } from '../middleware/tenantContext';
import { applyTenantToCreateData, applyTenantToNestedWrites } from './tenantWritePolicy';

function toFindFirstWhere(where: Record<string, any> | undefined): Record<string, any> {
  return Object.entries(where || {}).reduce<Record<string, any>>((result, [key, value]) => {
    if (
      key.includes('_') &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).every((field) => key.split('_').includes(field))
    ) {
      return { ...result, ...value };
    }

    result[key] = value;
    return result;
  }, {});
}

// Singleton PrismaClient to prevent connection pool exhaustion
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  systemPrisma: PrismaClient | undefined;
};

const systemClient =
  globalForPrisma.systemPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

const client =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Tenant-facing client. Platform code must deliberately import systemPrisma instead.
client.$use(async (params, next) => {
  const tenantId = getCurrentTenantId();
  if (!tenantId) {
    throw new Error(`Tenant context is required for ${params.model || 'raw'}.${params.action}`);
  }
  if (!params.model) return next(params);

  params.args = params.args || {};

  if (params.model === 'Tenant') {
    if (['create', 'createMany', 'upsert', 'delete', 'deleteMany'].includes(params.action)) {
      throw new Error(`Tenant.${params.action} is restricted to the platform client`);
    }
    params.args.where = { ...params.args.where, id: tenantId };
    return next(params);
  }

  if (params.action === 'create') {
    params.args.data = applyTenantToCreateData(params.args.data, tenantId);
  } else if (params.action === 'createMany') {
    params.args.data = applyTenantToCreateData(params.args.data, tenantId);
  } else if (params.action === 'findUnique') {
    // Convert to findFirst with tenantId filter for tenant safety
    params.action = 'findFirst';
    params.args.where = { ...toFindFirstWhere(params.args.where), tenantId };
  } else if (['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'].includes(params.action)) {
    params.args.where = { ...params.args.where, tenantId };
  } else if (['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
    params.args.where = { ...params.args.where, tenantId };
    if (params.args.data) params.args.data = applyTenantToNestedWrites(params.args.data, tenantId);
  } else if (params.action === 'upsert') {
    params.args.where = { ...params.args.where, tenantId };
    params.args.create = applyTenantToCreateData(params.args.create, tenantId);
    params.args.update = applyTenantToNestedWrites(params.args.update, tenantId);
  }

  return next(params);
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client;
  globalForPrisma.systemPrisma = systemClient;
}

/** Explicit unrestricted client for platform control-plane and tenant discovery only. */
export const systemPrisma: PrismaClient = systemClient;
export const prisma: PrismaClient = client;
export default prisma;
