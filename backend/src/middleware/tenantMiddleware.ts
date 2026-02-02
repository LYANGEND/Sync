/**
 * Tenant Middleware for Multi-Tenant Architecture
 * Handles tenant resolution, scoping, and feature gating
 */

import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import {
    getTenantConfig,
    setTenantConfig,
    getTenantByDomain,
    setTenantDomain,
} from '../services/cacheService';

const prisma = new PrismaClient();

// ==========================================
// TYPES
// ==========================================

export interface TenantInfo {
    id: string;
    name: string;
    slug: string;
    domain?: string | null;
    tier: string;
    status: string;
    maxStudents: number;
    maxTeachers: number;
    maxUsers: number;
    maxClasses: number;
    maxStorageGB: number;
    smsEnabled: boolean;
    emailEnabled: boolean;
    onlineAssessmentsEnabled: boolean;
    parentPortalEnabled: boolean;
    reportCardsEnabled: boolean;
    attendanceEnabled: boolean;
    feeManagementEnabled: boolean;
    chatEnabled: boolean;
    advancedReportsEnabled: boolean;
    apiAccessEnabled: boolean;
    timetableEnabled: boolean;
    syllabusEnabled: boolean;
    currentStudentCount: number;
    currentTeacherCount: number;
    currentUserCount: number;
}

declare global {
    namespace Express {
        interface Request {
            tenant?: TenantInfo;
            tenantId?: string;
        }
    }
}

// ==========================================
// TENANT RESOLUTION MIDDLEWARE
// ==========================================

/**
 * Resolve tenant from subdomain or custom domain
 * Should be applied early in the middleware chain
 */
export const resolveTenant = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const host = req.headers.host || '';
        const hostname = host.split(':')[0]; // Remove port if present

        // Skip tenant resolution for certain paths
        if (req.path.startsWith('/api/v1/platform') || req.path.startsWith('/health')) {
            return next();
        }

        let tenantId: string | null = null;

        // 1. Check custom domain first (e.g., school.com)
        let cachedTenantId = await getTenantByDomain(hostname);

        if (cachedTenantId) {
            tenantId = cachedTenantId;
        } else {
            // 2. Check if it's a subdomain (e.g., school.sync.app)
            const subdomain = extractSubdomain(hostname);

            if (subdomain) {
                cachedTenantId = await getTenantByDomain(subdomain);
                if (cachedTenantId) {
                    tenantId = cachedTenantId;
                } else {
                    // Lookup by slug
                    const tenant = await prisma.tenant.findUnique({
                        where: { slug: subdomain },
                        select: { id: true },
                    });

                    if (tenant) {
                        tenantId = tenant.id;
                        await setTenantDomain(subdomain, tenant.id);
                    }
                }
            } else {
                // 3. Lookup by custom domain
                const tenant = await prisma.tenant.findUnique({
                    where: { domain: hostname },
                    select: { id: true },
                });

                if (tenant) {
                    tenantId = tenant.id;
                    await setTenantDomain(hostname, tenant.id);
                }
            }
        }

        // If tenant found, load full config
        if (tenantId) {
            let tenantConfig = await getTenantConfig(tenantId);

            if (!tenantConfig) {
                const tenant = await prisma.tenant.findUnique({
                    where: { id: tenantId },
                });

                if (tenant) {
                    tenantConfig = tenant as any;
                    await setTenantConfig(tenantId, tenantConfig!);
                }
            }

            if (tenantConfig) {
                req.tenant = tenantConfig as TenantInfo;
                req.tenantId = tenantId;
            }
        }

        next();
    } catch (error) {
        console.error('Tenant resolution error:', error);
        next();
    }
};

/**
 * Extract subdomain from hostname
 */
const extractSubdomain = (hostname: string): string | null => {
    const baseDomains = (process.env.BASE_DOMAINS || 'localhost,bwangubwangu.net').split(',');

    for (const baseDomain of baseDomains) {
        if (hostname.endsWith(`.${baseDomain.trim()}`)) {
            const subdomain = hostname.replace(`.${baseDomain.trim()}`, '');
            // Make sure it's not www or other reserved subdomains
            if (!['www', 'api', 'admin', 'platform', 'sync'].includes(subdomain)) {
                return subdomain;
            }
        }
    }

    return null;
};

// ==========================================
// TENANT REQUIREMENT MIDDLEWARE
// ==========================================

/**
 * Require a valid tenant for the request
 * Returns 404 if tenant not found or inactive
 */
export const requireTenant = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.tenant || !req.tenantId) {
        res.status(404).json({
            error: 'Tenant not found',
            message: 'The requested school or organization was not found.',
        });
        return;
    }

    // Check tenant status
    if (req.tenant.status === 'SUSPENDED') {
        res.status(403).json({
            error: 'Account Suspended',
            message: 'This account has been suspended. Please contact support.',
        });
        return;
    }

    if (req.tenant.status === 'CANCELLED' || req.tenant.status === 'EXPIRED') {
        res.status(403).json({
            error: 'Subscription Expired',
            message: 'Your subscription has expired. Please renew to continue using the service.',
        });
        return;
    }

    next();
};

// ==========================================
// FEATURE GATING MIDDLEWARE
// ==========================================

type FeatureFlag =
    | 'smsEnabled'
    | 'emailEnabled'
    | 'onlineAssessmentsEnabled'
    | 'parentPortalEnabled'
    | 'reportCardsEnabled'
    | 'attendanceEnabled'
    | 'feeManagementEnabled'
    | 'chatEnabled'
    | 'advancedReportsEnabled'
    | 'apiAccessEnabled'
    | 'timetableEnabled'
    | 'syllabusEnabled';

/**
 * Create middleware to check if a feature is enabled for the tenant
 */
export const requireFeature = (feature: FeatureFlag) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.tenant) {
            res.status(404).json({
                error: 'Tenant not found',
                message: 'The requested school or organization was not found.',
            });
            return;
        }

        if (!req.tenant[feature]) {
            res.status(403).json({
                error: 'Feature not available',
                message: `This feature is not available in your current plan. Please upgrade to access this functionality.`,
                feature,
                currentTier: req.tenant.tier,
            });
            return;
        }

        next();
    };
};

// ==========================================
// USAGE LIMIT MIDDLEWARE
// ==========================================

/**
 * Check if tenant has reached their student limit
 */
export const checkStudentLimit = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.tenant) {
        return next();
    }

    if (req.tenant.currentStudentCount >= req.tenant.maxStudents) {
        res.status(403).json({
            error: 'Limit reached',
            message: `You have reached your plan's student limit (${req.tenant.maxStudents}). Please upgrade to add more students.`,
            currentCount: req.tenant.currentStudentCount,
            limit: req.tenant.maxStudents,
            tier: req.tenant.tier,
        });
        return;
    }

    next();
};

/**
 * Check if tenant has reached their user limit
 */
export const checkUserLimit = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.tenant) {
        return next();
    }

    if (req.tenant.currentUserCount >= req.tenant.maxUsers) {
        res.status(403).json({
            error: 'Limit reached',
            message: `You have reached your plan's user limit (${req.tenant.maxUsers}). Please upgrade to add more users.`,
            currentCount: req.tenant.currentUserCount,
            limit: req.tenant.maxUsers,
            tier: req.tenant.tier,
        });
        return;
    }

    next();
};

/**
 * Check if tenant has reached their class limit
 */
export const checkClassLimit = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    if (!req.tenant) {
        return next();
    }

    const currentClassCount = await prisma.class.count({
        where: { tenantId: req.tenantId! },
    });

    if (currentClassCount >= req.tenant.maxClasses) {
        res.status(403).json({
            error: 'Limit reached',
            message: `You have reached your plan's class limit (${req.tenant.maxClasses}). Please upgrade to add more classes.`,
            currentCount: currentClassCount,
            limit: req.tenant.maxClasses,
            tier: req.tenant.tier,
        });
        return;
    }

    next();
};

// ==========================================
// TENANT SCOPING UTILITIES
// ==========================================

/**
 * Get tenant-scoped Prisma filters
 * Use this in controllers to ensure queries are tenant-scoped
 */
export const getTenantScope = (req: Request) => {
    if (!req.tenantId) {
        throw new Error('Tenant ID not found in request');
    }
    return { tenantId: req.tenantId };
};

/**
 * Add tenant ID to data for creation
 */
export const withTenant = <T extends Record<string, any>>(req: Request, data: T): T & { tenantId: string } => {
    if (!req.tenantId) {
        throw new Error('Tenant ID not found in request');
    }
    return { ...data, tenantId: req.tenantId };
};

export default {
    resolveTenant,
    requireTenant,
    requireFeature,
    checkStudentLimit,
    checkUserLimit,
    checkClassLimit,
    getTenantScope,
    withTenant,
};
