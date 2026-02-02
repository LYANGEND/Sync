/**
 * Rate Limiting Middleware for Multi-Tenant Architecture
 * Implements tenant-aware rate limiting with tier-based limits
 */

import { Request, Response, NextFunction } from 'express';
import { checkRateLimit } from '../services/cacheService';

// ==========================================
// RATE LIMIT CONFIGURATIONS BY TIER
// ==========================================

interface RateLimitConfig {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Max requests per window
    message: string;       // Error message when limit exceeded
}

const tierLimits: Record<string, RateLimitConfig> = {
    FREE: {
        windowMs: 60000,         // 1 minute
        maxRequests: 60,         // 60 requests per minute
        message: 'Rate limit exceeded. Upgrade your plan for higher limits.',
    },
    STARTER: {
        windowMs: 60000,
        maxRequests: 300,        // 300 requests per minute
        message: 'Rate limit exceeded. Consider upgrading to Professional.',
    },
    PROFESSIONAL: {
        windowMs: 60000,
        maxRequests: 1000,       // 1000 requests per minute
        message: 'Rate limit exceeded. Contact support for Enterprise limits.',
    },
    ENTERPRISE: {
        windowMs: 60000,
        maxRequests: 5000,       // 5000 requests per minute
        message: 'Rate limit exceeded. Contact your account manager.',
    },
    DEFAULT: {
        windowMs: 60000,
        maxRequests: 30,         // Fallback for unauthenticated
        message: 'Rate limit exceeded. Please try again later.',
    },
};

// ==========================================
// ENDPOINT-SPECIFIC LIMITS
// ==========================================

// Some endpoints have stricter limits
const endpointLimits: Record<string, Partial<RateLimitConfig>> = {
    '/api/v1/auth/login': {
        windowMs: 900000,        // 15 minutes
        maxRequests: 10,         // 10 login attempts per 15 min
        message: 'Too many login attempts. Please try again in 15 minutes.',
    },
    '/api/v1/auth/register': {
        windowMs: 3600000,       // 1 hour
        maxRequests: 5,          // 5 registrations per hour
        message: 'Too many registration attempts. Please try again later.',
    },
    '/api/v1/payments': {
        windowMs: 60000,
        maxRequests: 30,         // 30 payment operations per minute
        message: 'Too many payment requests. Please slow down.',
    },
    '/api/v1/reports': {
        windowMs: 60000,
        maxRequests: 10,         // Reports are expensive
        message: 'Too many report requests. Please wait before generating more reports.',
    },
    '/api/v1/export': {
        windowMs: 300000,        // 5 minutes
        maxRequests: 5,          // 5 exports per 5 minutes
        message: 'Export limit reached. Please wait before exporting more data.',
    },
};

// ==========================================
// RATE LIMITER MIDDLEWARE
// ==========================================

/**
 * Tenant-aware rate limiting middleware
 * Uses Redis for distributed rate limiting
 */
export const rateLimiter = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        // Get tenant info from request (set by auth middleware)
        const tenantId = (req as any).tenant?.id || 'anonymous';
        const tier = (req as any).tenant?.tier || 'DEFAULT';
        const userId = (req as any).user?.userId || 'anonymous';

        // Determine the applicable limit
        const path = req.path;
        const endpointConfig = Object.entries(endpointLimits).find(
            ([pattern]) => path.startsWith(pattern)
        );

        let config: RateLimitConfig;

        if (endpointConfig) {
            config = {
                ...tierLimits[tier] || tierLimits.DEFAULT,
                ...endpointConfig[1],
            };
        } else {
            config = tierLimits[tier] || tierLimits.DEFAULT;
        }

        // Create a unique key for this rate limit
        // Key format: tenant:user:endpoint (for granular limiting)
        const limitKey = `${tenantId}:${userId}:${getEndpointGroup(path)}`;

        // Check the rate limit
        const result = await checkRateLimit(limitKey, config.maxRequests, config.windowMs);

        // Set rate limit headers
        res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetIn / 1000).toString());

        if (!result.allowed) {
            res.setHeader('Retry-After', Math.ceil(result.resetIn / 1000).toString());
            res.status(429).json({
                error: 'Too Many Requests',
                message: config.message,
                retryAfter: Math.ceil(result.resetIn / 1000),
            });
            return;
        }

        next();
    } catch (error) {
        // If rate limiting fails, allow the request through
        // but log the error
        console.error('Rate limiter error:', error);
        next();
    }
};

/**
 * Strict rate limiter for sensitive endpoints
 * Uses IP-based limiting in addition to tenant limiting
 */
export const strictRateLimiter = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const path = req.path;

        // IP-based limiting for sensitive endpoints
        const endpointOverride = endpointLimits[path];
        const config: RateLimitConfig = {
            windowMs: endpointOverride?.windowMs || 60000,
            maxRequests: endpointOverride?.maxRequests || 10,
            message: endpointOverride?.message || 'Too many requests from this IP. Please try again later.',
        };

        const limitKey = `ip:${ip}:${path}`;
        const result = await checkRateLimit(limitKey, config.maxRequests, config.windowMs);

        res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetIn / 1000).toString());

        if (!result.allowed) {
            res.setHeader('Retry-After', Math.ceil(result.resetIn / 1000).toString());
            res.status(429).json({
                error: 'Too Many Requests',
                message: config.message,
                retryAfter: Math.ceil(result.resetIn / 1000),
            });
            return;
        }

        next();
    } catch (error) {
        console.error('Strict rate limiter error:', error);
        next();
    }
};

/**
 * Get endpoint group for rate limiting
 * Groups similar endpoints together
 */
const getEndpointGroup = (path: string): string => {
    // Group CRUD operations on the same resource
    const parts = path.split('/').filter(Boolean);

    // Remove UUIDs from path for grouping
    const cleaned = parts.map((part) => {
        // Check if part is a UUID
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) {
            return ':id';
        }
        return part;
    });

    return cleaned.join('/');
};

// ==========================================
// SPECIALIZED RATE LIMITERS
// ==========================================

/**
 * Create a rate limiter for a specific endpoint
 */
export const createEndpointRateLimiter = (
    maxRequests: number,
    windowMs: number,
    message?: string
) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        const tenantId = (req as any).tenant?.id || 'anonymous';
        const limitKey = `${tenantId}:${req.path}`;

        const result = await checkRateLimit(limitKey, maxRequests, windowMs);

        if (!result.allowed) {
            res.status(429).json({
                error: 'Too Many Requests',
                message: message || 'Rate limit exceeded. Please try again later.',
                retryAfter: Math.ceil(result.resetIn / 1000),
            });
            return;
        }

        next();
    };
};

/**
 * SMS rate limiter (expensive operation)
 */
export const smsRateLimiter = createEndpointRateLimiter(
    50,                    // 50 SMS per
    3600000,               // hour
    'SMS limit exceeded. Please wait before sending more messages.'
);

/**
 * Email rate limiter
 */
export const emailRateLimiter = createEndpointRateLimiter(
    100,                   // 100 emails per
    3600000,               // hour
    'Email limit exceeded. Please wait before sending more emails.'
);

/**
 * Report generation rate limiter
 */
export const reportRateLimiter = createEndpointRateLimiter(
    10,                    // 10 reports per
    300000,                // 5 minutes
    'Report generation limit reached. Please wait before generating more reports.'
);

/**
 * Public API rate limiter (for unauthenticated public endpoints)
 * Uses IP-based limiting
 */
export const publicRateLimiter = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const ip = req.ip || req.socket.remoteAddress || 'unknown';
        const path = req.path;

        // Conservative limits for public endpoints
        const config: RateLimitConfig = {
            windowMs: 60000,         // 1 minute
            maxRequests: 30,         // 30 requests per minute per IP
            message: 'Too many requests. Please try again later.',
        };

        const limitKey = `public:${ip}:${path}`;
        const result = await checkRateLimit(limitKey, config.maxRequests, config.windowMs);

        res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
        res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
        res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetIn / 1000).toString());

        if (!result.allowed) {
            res.setHeader('Retry-After', Math.ceil(result.resetIn / 1000).toString());
            res.status(429).json({
                error: 'Too Many Requests',
                message: config.message,
                retryAfter: Math.ceil(result.resetIn / 1000),
            });
            return;
        }

        next();
    } catch (error) {
        console.error('Public rate limiter error:', error);
        next();
    }
};

export default {
    rateLimiter,
    strictRateLimiter,
    publicRateLimiter,
    createEndpointRateLimiter,
    smsRateLimiter,
    emailRateLimiter,
    reportRateLimiter,
};
