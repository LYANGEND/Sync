import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { isFeatureEnabled } from '../services/tenantFeatureService';

/**
 * Middleware that gates a route behind a feature flag.
 * Usage: router.get('/ai/tutor', requireFeature('AI_TUTOR'), aiTutorController.chat)
 */
export const requireFeature = (feature: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const enabled = await isFeatureEnabled(tenantId, feature);
    if (!enabled) {
      return res.status(403).json({
        error: 'Feature not available',
        feature,
        message: `The "${feature}" feature is not included in your current plan. Please upgrade to access this feature.`,
      });
    }

    next();
  };
};
