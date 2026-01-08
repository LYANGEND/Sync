import { Request, Response, NextFunction, RequestHandler } from 'express';
import { PrismaClient, SubscriptionTier, SubscriptionStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// TYPES
// ==========================================

export interface TenantFeatures {
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
}

export interface TenantLimits {
    maxStudents: number;
    maxTeachers: number;
    maxUsers: number;
    maxClasses: number;
    maxStorageGB: number;
}

export interface TenantUsage {
    currentStudentCount: number;
    currentTeacherCount: number;
    currentUserCount: number;
    currentStorageUsedMB: number;
}

export interface TenantInfo {
    id: string;
    slug: string;
    name: string;
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    features: TenantFeatures;
    limits: TenantLimits;
    usage: TenantUsage;
}

export interface TenantRequest extends Request {
    tenant?: TenantInfo;
    user?: {
        userId: string;
        tenantId: string;
        role: string;
    };
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Extract tenant slug from request
 * Supports: subdomain, path parameter, JWT token, or header
 */
function extractTenantIdentifier(req: Request): string | null {
    // 1. Check for X-Tenant-ID header (useful for API calls)
    const headerTenantId = req.headers['x-tenant-id'] as string;
    if (headerTenantId) {
        return headerTenantId;
    }

    // 2. Check for tenant in query params (for development)
    const queryTenant = req.query.tenant as string;
    if (queryTenant) {
        return queryTenant;
    }

    // 3. Check subdomain (production setup)
    const host = req.headers.host || '';
    const subdomain = host.split('.')[0];

    // Skip common non-tenant subdomains
    const skipSubdomains = ['www', 'api', 'localhost', '127'];
    if (subdomain && !skipSubdomains.includes(subdomain) && !subdomain.includes(':')) {
        return subdomain;
    }

    // 4. Check for tenantId in JWT (will be added after auth)
    const user = (req as TenantRequest).user;
    if (user?.tenantId) {
        return user.tenantId;
    }

    return null;
}

/**
 * Extract features from tenant record
 */
function extractFeatures(tenant: any): TenantFeatures {
    return {
        smsEnabled: tenant.smsEnabled,
        emailEnabled: tenant.emailEnabled,
        onlineAssessmentsEnabled: tenant.onlineAssessmentsEnabled,
        parentPortalEnabled: tenant.parentPortalEnabled,
        reportCardsEnabled: tenant.reportCardsEnabled,
        attendanceEnabled: tenant.attendanceEnabled,
        feeManagementEnabled: tenant.feeManagementEnabled,
        chatEnabled: tenant.chatEnabled,
        advancedReportsEnabled: tenant.advancedReportsEnabled,
        apiAccessEnabled: tenant.apiAccessEnabled,
        timetableEnabled: tenant.timetableEnabled,
        syllabusEnabled: tenant.syllabusEnabled,
    };
}

/**
 * Extract limits from tenant record
 */
function extractLimits(tenant: any): TenantLimits {
    return {
        maxStudents: tenant.maxStudents,
        maxTeachers: tenant.maxTeachers,
        maxUsers: tenant.maxUsers,
        maxClasses: tenant.maxClasses,
        maxStorageGB: tenant.maxStorageGB,
    };
}

/**
 * Extract current usage from tenant record
 */
function extractUsage(tenant: any): TenantUsage {
    return {
        currentStudentCount: tenant.currentStudentCount,
        currentTeacherCount: tenant.currentTeacherCount,
        currentUserCount: tenant.currentUserCount,
        currentStorageUsedMB: tenant.currentStorageUsedMB,
    };
}

// ==========================================
// MIDDLEWARE
// ==========================================

/**
 * Resolve tenant from request and attach to req.tenant
 * This should run after authentication middleware
 */
// ==========================================
// MIDDLEWARE
// ==========================================

/**
 * Resolve tenant from request and attach to req.tenant
 * This should run after authentication middleware
 */
export const resolveTenant: RequestHandler = async (req, res, next) => {
    try {
        const tenantRequest = req as TenantRequest;
        const tenantIdentifier = extractTenantIdentifier(req);

        if (!tenantIdentifier) {
            // Optional: for auth routes like /login where tenant isn't known yet
            // Just continue without tenant? Or strictly require it?
            // For now, we'll continue but tenantRequest.tenant will be undefined.
            // Routes that REQUIRE tenant will fail later or we can check here.

            // Actually, for global middleware, we should allow passing if no tenant identifier found
            // UNLESS it's a route that specifically needs it.
            // But for now, let's keep the logic: if ID provided but not found -> 404.
            // If ID NOT provided -> continue (tenant undefined).
            // But the original code returned 400. Let's make it optional if not provided?
            // No, the original code returned 400. Let's check logic.

            // If we make it global middleware in app.ts, it runs on /login too.
            // /login doesn't have tenant ID in header usually (unless provided).
            // So on /login, this would fail with 400.
            // WE MUST FIX THIS.

            // Strategy: Try to resolve. If not found, just next() without tenant.
            // Specific routes that need tenant will check req.tenant.
            next();
            return;
        }

        // Try to find tenant by ID or slug
        const tenant = await prisma.tenant.findFirst({
            where: {
                OR: [
                    { id: tenantIdentifier },
                    { slug: tenantIdentifier },
                ],
            },
        });

        if (!tenant) {
            res.status(404).json({
                error: 'School not found',
                message: `No school found with identifier: ${tenantIdentifier}`,
            });
            return;
        }

        // Check subscription status
        if (tenant.status === 'SUSPENDED') {
            res.status(403).json({
                error: 'Subscription suspended',
                message: 'Your school subscription has been suspended. Please contact support.',
                code: 'SUBSCRIPTION_SUSPENDED',
            });
            return;
        }

        if (tenant.status === 'CANCELLED') {
            res.status(403).json({
                error: 'Subscription cancelled',
                message: 'Your school subscription has been cancelled.',
                code: 'SUBSCRIPTION_CANCELLED',
            });
            return;
        }

        if (tenant.status === 'EXPIRED') {
            res.status(403).json({
                error: 'Subscription expired',
                message: 'Your school subscription has expired. Please renew to continue.',
                code: 'SUBSCRIPTION_EXPIRED',
            });
            return;
        }

        // Check trial expiration
        if (tenant.status === 'TRIAL' && tenant.trialEndsAt) {
            if (new Date() > tenant.trialEndsAt) {
                res.status(403).json({
                    error: 'Trial expired',
                    message: 'Your free trial has expired. Please upgrade to continue.',
                    code: 'TRIAL_EXPIRED',
                    upgradeUrl: '/settings/billing',
                });
                return;
            }
        }

        // Attach tenant info to request
        tenantRequest.tenant = {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            tier: tenant.tier,
            status: tenant.status,
            features: extractFeatures(tenant),
            limits: extractLimits(tenant),
            usage: extractUsage(tenant),
        };

        next();
    } catch (error) {
        console.error('Tenant resolution error:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to resolve tenant',
        });
    }
};

/**
 * Require a specific feature to be enabled for the tenant
 * Usage: router.get('/sms', requireFeature('smsEnabled'), sendSmsController)
 */
export const requireFeature = (feature: keyof TenantFeatures): RequestHandler => {
    return (req, res, next) => {
        const tenantRequest = req as TenantRequest;
        if (!tenantRequest.tenant) {
            res.status(500).json({
                error: 'Tenant not resolved',
                message: 'Tenant middleware must run before feature check',
            });
            return;
        }

        if (!tenantRequest.tenant.features[feature]) {
            const featureNames: Record<keyof TenantFeatures, string> = {
                smsEnabled: 'SMS Notifications',
                emailEnabled: 'Email Notifications',
                onlineAssessmentsEnabled: 'Online Assessments',
                parentPortalEnabled: 'Parent Portal',
                reportCardsEnabled: 'Report Cards',
                attendanceEnabled: 'Attendance Tracking',
                feeManagementEnabled: 'Fee Management',
                chatEnabled: 'In-App Chat',
                advancedReportsEnabled: 'Advanced Reports',
                apiAccessEnabled: 'API Access',
                timetableEnabled: 'Timetable Management',
                syllabusEnabled: 'Syllabus Tracking',
            };

            res.status(403).json({
                error: 'Feature not available',
                message: `${featureNames[feature]} is not available on your current plan.`,
                feature,
                currentTier: tenantRequest.tenant.tier,
                upgradeUrl: '/settings/billing',
                code: 'FEATURE_NOT_AVAILABLE',
            });
            return;
        }

        next();
    };
};

/**
 * Check if adding a new resource would exceed tenant limits
 * Usage: router.post('/students', checkLimit('students'), createStudentController)
 */
export const checkLimit = (resourceType: 'students' | 'teachers' | 'users' | 'classes'): RequestHandler => {
    return async (req, res, next) => {
        const tenantRequest = req as TenantRequest;
        if (!tenantRequest.tenant) {
            res.status(500).json({
                error: 'Tenant not resolved',
                message: 'Tenant middleware must run before limit check',
            });
            return;
        }

        const limitMap: Record<typeof resourceType, { limit: keyof TenantLimits; current: keyof TenantUsage }> = {
            students: { limit: 'maxStudents', current: 'currentStudentCount' },
            teachers: { limit: 'maxTeachers', current: 'currentTeacherCount' },
            users: { limit: 'maxUsers', current: 'currentUserCount' },
            classes: { limit: 'maxClasses', current: 'currentStudentCount' }, // Classes tracked via students
        };

        const { limit, current } = limitMap[resourceType];
        const maxAllowed = tenantRequest.tenant.limits[limit];
        const currentCount = tenantRequest.tenant.usage[current];

        // -1 means unlimited
        if (maxAllowed !== -1 && currentCount >= maxAllowed) {
            const resourceNames: Record<typeof resourceType, string> = {
                students: 'students',
                teachers: 'teachers',
                users: 'users',
                classes: 'classes',
            };

            res.status(403).json({
                error: 'Limit reached',
                message: `You have reached the maximum of ${maxAllowed} ${resourceNames[resourceType]} allowed on your plan.`,
                resourceType,
                current: currentCount,
                limit: maxAllowed,
                currentTier: tenantRequest.tenant.tier,
                upgradeUrl: '/settings/billing',
                code: 'LIMIT_REACHED',
            });
            return;
        }

        next();
    };
};

/**
 * Update tenant usage counts after creating/deleting resources
 */
export const updateTenantUsage = async (
    tenantId: string,
    resourceType: 'students' | 'teachers' | 'users',
    operation: 'increment' | 'decrement'
) => {
    const fieldMap: Record<typeof resourceType, string> = {
        students: 'currentStudentCount',
        teachers: 'currentTeacherCount',
        users: 'currentUserCount',
    };

    const field = fieldMap[resourceType];
    const change = operation === 'increment' ? 1 : -1;

    await prisma.tenant.update({
        where: { id: tenantId },
        data: {
            [field]: {
                [operation]: 1,
            },
        },
    });
};

/**
 * Get tenant by ID (utility function)
 */
export const getTenantById = async (tenantId: string) => {
    return prisma.tenant.findUnique({
        where: { id: tenantId },
    });
};

/**
 * Validate that a resource belongs to the tenant
 * Prevents cross-tenant data access
 */
export const validateTenantAccess = async (
    tenantId: string,
    model: 'student' | 'user' | 'class' | 'payment',
    resourceId: string
): Promise<boolean> => {
    const modelMap: Record<typeof model, any> = {
        student: prisma.student,
        user: prisma.user,
        class: prisma.class,
        payment: prisma.payment,
    };

    const resource = await modelMap[model].findFirst({
        where: {
            id: resourceId,
            tenantId,
        },
    });

    return !!resource;
};
