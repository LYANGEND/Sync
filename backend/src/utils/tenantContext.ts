import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// TYPES
// ==========================================

export interface TenantRequest extends Request {
    tenant?: any; // Populated by resolveTenant middleware
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
 * Get tenantId from request - throws if not available
 */
export function getTenantId(req: TenantRequest): string {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
        throw new Error('Tenant context required - user must be authenticated');
    }
    return tenantId;
}

/**
 * Get tenantId from request - returns null if not available (for optional contexts)
 */
export function getTenantIdOrNull(req: TenantRequest): string | null {
    return req.user?.tenantId || null;
}

/**
 * Get userId from request
 */
export function getUserId(req: TenantRequest): string {
    const userId = req.user?.userId;
    if (!userId) {
        throw new Error('User context required - user must be authenticated');
    }
    return userId;
}

/**
 * Get user role from request
 */
export function getUserRole(req: TenantRequest): string {
    const role = req.user?.role;
    if (!role) {
        throw new Error('Role context required - user must be authenticated');
    }
    return role;
}

/**
 * Middleware to ensure tenantId is present in the request
 * Use this for all authenticated routes that require tenant context
 */
export function requireTenantContext(
    req: TenantRequest,
    res: Response,
    next: NextFunction
) {
    try {
        getTenantId(req);
        next();
    } catch (error) {
        return res.status(400).json({
            error: 'Tenant context required',
            message: 'Please ensure you are logged in and have a valid session'
        });
    }
}

/**
 * Add tenantId to a data object for creation
 */
export function withTenantId<T extends object>(req: TenantRequest, data: T): T & { tenantId: string } {
    return {
        ...data,
        tenantId: getTenantId(req)
    };
}

/**
 * Add tenantId filter to a where clause
 */
export function withTenantFilter<T extends object>(req: TenantRequest, where: T): T & { tenantId: string } {
    return {
        ...where,
        tenantId: getTenantId(req)
    };
}

/**
 * Create a where clause with just tenantId
 */
export function tenantWhere(req: TenantRequest): { tenantId: string } {
    return { tenantId: getTenantId(req) };
}

/**
 * Validate that a resource belongs to the current tenant
 */
export async function validateTenantOwnership(
    req: TenantRequest,
    model: 'student' | 'user' | 'class' | 'payment' | 'subject' | 'academicTerm',
    resourceId: string
): Promise<boolean> {
    const tenantId = getTenantId(req);

    const modelMap: Record<typeof model, any> = {
        student: prisma.student,
        user: prisma.user,
        class: prisma.class,
        payment: prisma.payment,
        subject: prisma.subject,
        academicTerm: prisma.academicTerm,
    };

    const resource = await modelMap[model].findFirst({
        where: {
            id: resourceId,
            tenantId,
        },
    });

    return !!resource;
}

/**
 * Handle common controller errors
 */
export function handleControllerError(res: Response, error: any, context: string) {
    console.error(`${context} error:`, error);

    if (error.message === 'Tenant context required - user must be authenticated') {
        return res.status(401).json({ error: 'Authentication required' });
    }

    if (error.code === 'P2002') {
        return res.status(400).json({ error: 'A record with this data already exists' });
    }

    if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found' });
    }

    return res.status(500).json({ error: 'Internal server error' });
}
