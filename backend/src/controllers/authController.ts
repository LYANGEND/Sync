import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { comparePassword, generateToken, hashPassword } from '../utils/auth';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.enum(['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY']),
});

/**
 * Resolve tenantId from request.
 * Priority: x-tenant-slug header → x-tenant-id header
 */
async function resolveTenant(req: Request): Promise<{
  id: string;
  slug: string;
  name: string;
  status: string;
  plan: string;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  trialEndsAt: Date | null;
} | null> {
  const slug = req.headers['x-tenant-slug'] as string;
  if (slug) {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (tenant && tenant.status !== 'SUSPENDED') return tenant;
    return null;
  }
  const tid = req.headers['x-tenant-id'] as string;
  if (tid) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tid } });
    if (tenant && tenant.status !== 'SUSPENDED') return tenant;
    return null;
  }
  return null;
}

const logAuthEvent = async (
  req: Request,
  tenantId: string,
  action: 'LOGIN' | 'LOGIN_FAILED',
  userId?: string | null,
  details?: Record<string, unknown>
) => {
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: userId || null,
      action,
      entityType: 'Auth',
      entityId: userId || null,
      newValue: details as any,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.get('User-Agent') || null,
    },
  }).catch(() => undefined);
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.trim().toLowerCase();

    // Resolve tenant from header
    const tenant = await resolveTenant(req);
    if (!tenant) {
      await logAuthEvent(req, 'SYSTEM', 'LOGIN_FAILED', null, { email: normalizedEmail, reason: 'missing_or_invalid_tenant' });
      return res.status(400).json({ error: 'Missing or invalid tenant. Provide x-tenant-slug or x-tenant-id header.' });
    }

    // Find user scoped to this tenant
    const user = await prisma.user.findFirst({
      where: { email: normalizedEmail, tenantId: tenant.id },
    });

    if (!user || !user.isActive) {
      await logAuthEvent(req, tenant.id, 'LOGIN_FAILED', user?.id, {
        email: normalizedEmail,
        reason: user ? 'inactive_account' : 'unknown_user',
      });
      return res.status(401).json({ error: 'Invalid credentials or inactive account' });
    }

    // Check tenant trial expiry
    if (tenant?.trialEndsAt && new Date() > tenant.trialEndsAt && tenant.plan === 'FREE') {
      await logAuthEvent(req, tenant.id, 'LOGIN_FAILED', user.id, { email: normalizedEmail, reason: 'trial_expired' });
      return res.status(403).json({ error: 'Trial period has expired. Please upgrade your plan.' });
    }

    if (tenant.maintenanceMode && user.role !== 'SUPER_ADMIN') {
      await logAuthEvent(req, tenant.id, 'LOGIN_FAILED', user.id, { email: normalizedEmail, reason: 'maintenance_mode' });
      return res.status(423).json({
        error: 'Tenant is in maintenance mode',
        message: tenant.maintenanceMessage || 'This school portal is temporarily unavailable.',
      });
    }

    const isValid = await comparePassword(password, user.passwordHash);

    if (!isValid) {
      await logAuthEvent(req, tenant.id, 'LOGIN_FAILED', user.id, { email: normalizedEmail, reason: 'bad_password' });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.role, user.tenantId, user.branchId);
    await logAuthEvent(req, tenant.id, 'LOGIN', user.id, { email: normalizedEmail });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        branchId: user.branchId,
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Temporary register for seeding/testing
export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, role } = registerSchema.parse(req.body);

    const tenant = await resolveTenant(req);
    if (!tenant) {
      return res.status(400).json({ error: 'Missing or invalid tenant. Provide x-tenant-slug or x-tenant-id header.' });
    }

    const existingUser = await prisma.user.findFirst({
      where: { email, tenantId: tenant.id },
    });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists in this tenant' });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName,
        role,
        tenantId: tenant.id,
      },
    });

    const token = generateToken(user.id, user.role, user.tenantId, user.branchId);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
};
