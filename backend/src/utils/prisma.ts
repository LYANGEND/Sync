import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId } from '../middleware/tenantContext';

// Singleton PrismaClient to prevent connection pool exhaustion
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const client =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Auto-inject tenantId on every create/update and filter on every read/delete
client.$use(async (params, next) => {
  const tenantId = getCurrentTenantId();
  if (!tenantId || params.model === 'Tenant') return next(params);

  if (params.action === 'create') {
    params.args.data = { ...params.args.data, tenantId };
  } else if (params.action === 'createMany') {
    if (Array.isArray(params.args.data)) {
      params.args.data = params.args.data.map((d: any) => ({ ...d, tenantId }));
    }
  } else if (params.action === 'findUnique') {
    // Convert to findFirst with tenantId filter for tenant safety
    params.action = 'findFirst';
    params.args.where = { ...params.args.where, tenantId };
  } else if (['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'].includes(params.action)) {
    params.args.where = { ...params.args.where, tenantId };
  } else if (['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
    params.args.where = { ...params.args.where, tenantId };
  } else if (params.action === 'upsert') {
    params.args.where = { ...params.args.where, tenantId };
    params.args.create = { ...params.args.create, tenantId };
  }

  return next(params);
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client;
}

export const prisma: PrismaClient = client;
export default prisma;
