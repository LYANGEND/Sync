import { Request, Response, NextFunction, RequestHandler } from 'express';
import { TenantRequest, getTenantId } from '../utils/tenantContext';
import {
    checkSubscriptionActive,
    checkResourceLimit,
    checkFeatureAccess,
    ResourceType,
    FeatureKey,
    FEATURES,
} from '../services/subscriptionService';

/**
 * Middleware to check if the subscription is active
 * Blocks access if subscription is expired, suspended, or cancelled
 */
export const requireActiveSubscription: RequestHandler = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        // Skip subscription check if user is not authenticated
        const tenantRequest = req as TenantRequest;
        if (!tenantRequest.user?.tenantId) {
            // Not authenticated yet - let auth middleware handle it
            return next();
        }

        const tenantId = tenantRequest.user.tenantId;
        const result = await checkSubscriptionActive(tenantId);

        if (!result.allowed) {
            res.status(402).json({
                error: 'subscription_required',
                message: result.reason,
                status: result.status,
                tier: result.tier,
                upgradeRequired: result.upgradeRequired,
                upgradeUrl: '/subscription/upgrade',
            });
            return;
        }

        // Add subscription info to request for downstream use
        (req as any).subscription = {
            tier: result.tier,
            status: result.status,
            daysUntilExpiry: result.daysUntilExpiry,
        };

        // Warn if subscription is expiring soon (within 7 days)
        if (result.daysUntilExpiry && result.daysUntilExpiry <= 7) {
            res.setHeader('X-Subscription-Warning', `Subscription expires in ${result.daysUntilExpiry} days`);
        }

        next();
    } catch (error) {
        console.error('Subscription check error:', error);
        // Allow through on error to avoid blocking legitimate requests
        next();
    }
};

/**
 * Factory function to create middleware that checks resource limits
 */
export const requireResourceLimit = (resourceType: ResourceType, increment: number = 1): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = getTenantId(req as TenantRequest);
            const result = await checkResourceLimit(tenantId, resourceType, increment);

            if (!result.allowed) {
                res.status(403).json({
                    error: 'limit_exceeded',
                    message: result.reason,
                    resource: resourceType,
                    currentCount: result.currentCount,
                    maxAllowed: result.maxAllowed,
                    tier: result.tier,
                    upgradeRequired: result.upgradeRequired,
                    upgradeUrl: '/subscription/upgrade',
                });
                return;
            }

            next();
        } catch (error) {
            console.error('Resource limit check error:', error);
            next();
        }
    };
};

/**
 * Factory function to create middleware that checks feature access
 */
export const requireFeature = (feature: FeatureKey): RequestHandler => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tenantId = getTenantId(req as TenantRequest);
            const result = await checkFeatureAccess(tenantId, feature);

            if (!result.allowed) {
                res.status(403).json({
                    error: 'feature_not_available',
                    message: result.reason,
                    feature,
                    tier: result.tier,
                    upgradeRequired: result.upgradeRequired,
                    upgradeUrl: '/subscription/upgrade',
                });
                return;
            }

            next();
        } catch (error) {
            console.error('Feature access check error:', error);
            next();
        }
    };
};

// Pre-built middleware for common use cases
export const requireStudentLimit = requireResourceLimit('students');
export const requireTeacherLimit = requireResourceLimit('teachers');
export const requireUserLimit = requireResourceLimit('users');
export const requireClassLimit = requireResourceLimit('classes');

export const requireSmsFeature = requireFeature(FEATURES.SMS_NOTIFICATIONS);
export const requireOnlineAssessments = requireFeature(FEATURES.ONLINE_ASSESSMENTS);
export const requireParentPortal = requireFeature(FEATURES.PARENT_PORTAL);
export const requireAdvancedReports = requireFeature(FEATURES.ADVANCED_REPORTS);
export const requireApiAccess = requireFeature(FEATURES.API_ACCESS);

