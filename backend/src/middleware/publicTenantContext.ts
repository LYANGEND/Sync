import { NextFunction, Request, Response } from 'express';
import { systemPrisma } from '../utils/prisma';
import { runWithTenant } from './tenantContext';

const normalizeHost = (value: string) => value.trim().toLowerCase().split(':')[0];

export async function requirePublicTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const slug = String(req.headers['x-tenant-slug'] || '').trim().toLowerCase();
    const tenantId = String(req.headers['x-tenant-id'] || '').trim();
    const host = normalizeHost(String(req.headers['x-forwarded-host'] || req.headers.host || ''));

    const tenant = slug
      ? await systemPrisma.tenant.findUnique({ where: { slug } })
      : tenantId
        ? await systemPrisma.tenant.findUnique({ where: { id: tenantId } })
        : host
          ? await systemPrisma.tenant.findFirst({ where: { domain: host, domainStatus: 'VERIFIED' } })
          : null;

    if (!tenant || tenant.status !== 'ACTIVE') {
      return next();
    }

    return runWithTenant(tenant.id, () => next());
  } catch (error) {
    console.error('Public tenant resolution failed:', error);
    return next();
  }
}