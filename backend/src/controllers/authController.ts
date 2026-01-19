import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { comparePassword, generateToken, hashPassword } from '../utils/auth';
import { logSecurityEvent, checkAndLockAccount, isAccountLocked, getClientIp, calculateRiskScore } from '../middleware/securityLogger';

const prisma = new PrismaClient();

// ==========================================
// SCHEMAS
// ==========================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  tenantId: z.string().optional(), // Optional - will auto-detect if not provided
});

const selectTenantLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  tenantId: z.string(), // Required when user has accounts in multiple schools
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.enum(['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY']),
  tenantId: z.string(),
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get tenant ID from request (if explicitly provided)
 * Checks: body.tenantId, X-Tenant-ID header, query param, subdomain
 */
const getTenantIdFromRequest = (req: Request): string | null => {
  // Check body first
  if (req.body.tenantId) return req.body.tenantId;

  // Check header
  const headerTenantId = req.headers['x-tenant-id'] as string;
  if (headerTenantId) return headerTenantId;

  // Check query
  const queryTenant = req.query.tenant as string;
  if (queryTenant) return queryTenant;

  // Check subdomain (for production)
  const host = req.headers.host || '';
  const subdomain = host.split('.')[0];
  const skipSubdomains = ['www', 'api', 'localhost', '127', 'app'];
  if (subdomain && !skipSubdomains.includes(subdomain) && !subdomain.includes(':')) {
    return subdomain;
  }

  return null;
};

/**
 * Validate tenant status and return error response if invalid
 */
const validateTenantStatus = (tenant: any): { valid: boolean; error?: any } => {
  if (tenant.status === 'SUSPENDED') {
    return {
      valid: false,
      error: {
        status: 403,
        error: 'Account suspended',
        message: 'Your school account has been suspended. Please contact support.',
        code: 'TENANT_SUSPENDED'
      }
    };
  }

  if (tenant.status === 'CANCELLED' || tenant.status === 'EXPIRED') {
    return {
      valid: false,
      error: {
        status: 403,
        error: 'Subscription expired',
        message: 'Your school subscription has expired. Please renew to continue.',
        code: 'SUBSCRIPTION_EXPIRED'
      }
    };
  }

  // Check trial expiration
  if (tenant.status === 'TRIAL' && tenant.trialEndsAt && new Date() > tenant.trialEndsAt) {
    return {
      valid: false,
      error: {
        status: 403,
        error: 'Trial expired',
        message: 'Your free trial has expired. Please upgrade to continue.',
        code: 'TRIAL_EXPIRED',
        upgradeUrl: '/settings/billing'
      }
    };
  }

  return { valid: true };
};

// ==========================================
// LOGIN - Smart Tenant Resolution
// ==========================================

/**
 * Smart Login with Auto-Tenant Detection
 * 
 * Flow:
 * 1. If tenantId provided → Use that tenant directly
 * 2. If no tenantId → Search for email across ALL tenants
 *    a. Found in 1 tenant → Auto-login
 *    b. Found in 2+ tenants → Return list for user to choose
 *    c. Found in 0 tenants → "Invalid credentials"
 */
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const explicitTenantId = getTenantIdFromRequest(req);
    const ipAddress = getClientIp(req);
    const userAgent = req.headers['user-agent'];

    // Check if account is locked
    if (await isAccountLocked(email)) {
      await logSecurityEvent({
        userEmail: email,
        eventType: 'FAILED_LOGIN',
        status: 'FAILED_ACCOUNT_LOCKED',
        ipAddress,
        userAgent,
        riskScore: 100,
        metadata: { reason: 'Account is locked' }
      });
      return res.status(403).json({
        error: 'Account locked',
        message: 'Your account has been locked due to multiple failed login attempts. Please try again later or contact support.'
      });
    }

    // ==========================================
    // CASE 1: Tenant explicitly specified
    // ==========================================
    if (explicitTenantId) {
      return await loginWithTenant(req, res, email, password, explicitTenantId);
    }

    // ==========================================
    // CASE 2: Auto-detect tenant from email
    // ==========================================

    // Find all users with this email across all tenants
    const usersWithEmail = await prisma.user.findMany({
      where: { email },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            primaryColor: true,
            status: true,
          }
        }
      }
    });

    // No user found with this email
    if (usersWithEmail.length === 0) {
      const riskScore = await calculateRiskScore(email, ipAddress);
      await logSecurityEvent({
        userEmail: email,
        eventType: 'FAILED_LOGIN',
        status: 'FAILED_USER_NOT_FOUND',
        ipAddress,
        userAgent,
        riskScore,
        metadata: { reason: 'User not found' }
      });
      
      // Check if we should lock the account
      await checkAndLockAccount(email);
      
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Filter out inactive users
    const activeUsers = usersWithEmail.filter(u => u.isActive);

    if (activeUsers.length === 0) {
      const riskScore = await calculateRiskScore(email, ipAddress);
      await logSecurityEvent({
        tenantId: usersWithEmail[0]?.tenant.id,
        userId: usersWithEmail[0]?.id,
        userEmail: email,
        eventType: 'FAILED_LOGIN',
        status: 'FAILED_PASSWORD',
        ipAddress,
        userAgent,
        riskScore,
        metadata: { reason: 'Account inactive' }
      });
      
      return res.status(401).json({
        error: 'Account inactive',
        message: 'Your account has been deactivated. Please contact your administrator.'
      });
    }

    // ==========================================
    // CASE 2a: User exists in exactly ONE tenant
    // ==========================================
    if (activeUsers.length === 1) {
      const user = activeUsers[0];
      const tenant = user.tenant;

      // Validate password
      const isValid = await comparePassword(password, user.passwordHash);
      if (!isValid) {
        const riskScore = await calculateRiskScore(email, ipAddress);
        await logSecurityEvent({
          tenantId: tenant.id,
          userId: user.id,
          userEmail: email,
          eventType: 'FAILED_LOGIN',
          status: 'FAILED_PASSWORD',
          ipAddress,
          userAgent,
          riskScore,
          metadata: { reason: 'Invalid password' }
        });
        
        // Check if we should lock the account
        await checkAndLockAccount(email, tenant.id, user.id);
        
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Validate tenant status
      const tenantValidation = validateTenantStatus(tenant);
      if (!tenantValidation.valid) {
        return res.status(tenantValidation.error!.status).json(tenantValidation.error);
      }

      // Log successful login
      await logSecurityEvent({
        tenantId: tenant.id,
        userId: user.id,
        userEmail: email,
        eventType: 'SUCCESSFUL_LOGIN',
        status: 'SUCCESS',
        ipAddress,
        userAgent,
        riskScore: 0,
        metadata: { loginMethod: 'password' }
      });

      // Generate token and respond
      const token = generateToken(user.id, tenant.id, user.role);

      return res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
          tenantId: tenant.id,
          profilePictureUrl: user.profilePictureUrl,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          logoUrl: tenant.logoUrl,
          primaryColor: tenant.primaryColor,
        }
      });
    }

    // ==========================================
    // CASE 2b: User exists in MULTIPLE tenants
    // ==========================================

    // Validate password against ANY of the users first (they should have same password)
    let passwordValid = false;
    for (const user of activeUsers) {
      if (await comparePassword(password, user.passwordHash)) {
        passwordValid = true;
        break;
      }
    }

    if (!passwordValid) {
      const riskScore = await calculateRiskScore(email, ipAddress);
      await logSecurityEvent({
        userEmail: email,
        eventType: 'FAILED_LOGIN',
        status: 'FAILED_PASSWORD',
        ipAddress,
        userAgent,
        riskScore,
        metadata: { reason: 'Invalid password', multiTenant: true }
      });
      
      // Check if we should lock the account
      await checkAndLockAccount(email);
      
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Filter to only active tenants
    const availableTenants = activeUsers
      .filter(u => u.tenant.status === 'ACTIVE' || u.tenant.status === 'TRIAL')
      .map(u => ({
        id: u.tenant.id,
        name: u.tenant.name,
        slug: u.tenant.slug,
        logoUrl: u.tenant.logoUrl,
        role: u.role
      }));

    if (availableTenants.length === 0) {
      return res.status(403).json({
        error: 'No active schools',
        message: 'All your school accounts are inactive or suspended.'
      });
    }

    // Return list of tenants for user to choose
    return res.status(300).json({
      message: 'Multiple schools found. Please select one.',
      code: 'MULTIPLE_TENANTS',
      tenants: availableTenants
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ==========================================
// LOGIN WITH SPECIFIC TENANT
// ==========================================

/**
 * Login with a specific tenant (when user has selected from multiple)
 */
async function loginWithTenant(
  req: Request,
  res: Response,
  email: string,
  password: string,
  tenantId: string
) {
  // Find tenant (by ID or slug)
  const tenant = await prisma.tenant.findFirst({
    where: {
      OR: [
        { id: tenantId },
        { slug: tenantId },
      ],
    },
  });

  if (!tenant) {
    return res.status(404).json({
      error: 'School not found',
      message: 'The specified school does not exist'
    });
  }

  // Validate tenant status
  const tenantValidation = validateTenantStatus(tenant);
  if (!tenantValidation.valid) {
    return res.status(tenantValidation.error!.status).json(tenantValidation.error);
  }

  // Find user in this tenant
  const user = await prisma.user.findFirst({
    where: {
      email,
      tenantId: tenant.id
    }
  });

  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'Invalid credentials or inactive account' });
  }

  const isValid = await comparePassword(password, user.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Generate token with tenantId
  const token = generateToken(user.id, tenant.id, user.role);

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: tenant.id,
      profilePictureUrl: user.profilePictureUrl,
    },
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor,
      tier: tenant.tier,
      status: tenant.status,
    }
  });
}

// ==========================================
// REGISTER USER
// ==========================================

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, fullName, role, tenantId } = registerSchema.parse(req.body);

    // Validate tenant exists
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return res.status(404).json({ error: 'School not found' });
    }

    // Check tenant status
    const tenantValidation = validateTenantStatus(tenant);
    if (!tenantValidation.valid) {
      return res.status(tenantValidation.error!.status).json(tenantValidation.error);
    }

    // Check if user already exists in this tenant
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        tenantId
      }
    });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists in this school' });
    }

    // Check tenant user limits
    if (tenant.maxUsers !== -1 && tenant.currentUserCount >= tenant.maxUsers) {
      return res.status(403).json({
        error: 'User limit reached',
        message: `Maximum of ${tenant.maxUsers} users allowed. Please upgrade your plan.`,
        code: 'LIMIT_REACHED',
        upgradeUrl: '/settings/billing'
      });
    }

    const passwordHash = await hashPassword(password);

    // Create user and update tenant count in transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          role,
          tenantId,
        },
      });

      // Update tenant user count
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          currentUserCount: { increment: 1 },
          ...(role === 'TEACHER' ? { currentTeacherCount: { increment: 1 } } : {}),
        }
      });

      return newUser;
    });

    const token = generateToken(user.id, tenantId, user.role);

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ==========================================
// GET TENANT INFO (Public)
// ==========================================

/**
 * Get tenant info by slug (for login page branding)
 */
export const getTenantBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
        secondaryColor: true,
        accentColor: true,
        status: true,
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: 'School not found' });
    }

    res.json(tenant);
  } catch (error) {
    console.error('Get tenant error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// ==========================================
// GET CURRENT USER INFO
// ==========================================

/**
 * Get current user's info from token
 */
export const me = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const tenantId = (req as any).user?.tenantId;

    if (!userId || !tenantId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            primaryColor: true,
            tier: true,
            status: true,
            // Feature flags for frontend
            smsEnabled: true,
            emailEnabled: true,
            onlineAssessmentsEnabled: true,
            parentPortalEnabled: true,
            reportCardsEnabled: true,
            attendanceEnabled: true,
            feeManagementEnabled: true,
            chatEnabled: true,
            advancedReportsEnabled: true,
            timetableEnabled: true,
            syllabusEnabled: true,
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        profilePictureUrl: user.profilePictureUrl,
        tenantId: user.tenantId,
      },
      tenant: user.tenant
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
