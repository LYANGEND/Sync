import { Router } from 'express';
import {
  getUsageSummary,
  getFeatureBreakdown,
  getAdoptionMetrics,
} from '../controllers/aiAnalyticsController';
import {
  runProactiveScan,
  runAIScan,
  getAlerts,
  markAlertRead,
  markAlertActioned,
  dismissAlert,
  getWeeklyDigest,
} from '../controllers/aiProactiveController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { aiLimiter } from '../middleware/rateLimiter';

const router = Router();

router.use(authenticateToken);
router.use(authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']));

// ---- Usage Analytics ----
router.get('/usage/summary', getUsageSummary);
router.get('/usage/feature/:feature', getFeatureBreakdown);
router.get('/adoption', getAdoptionMetrics);

// ---- Proactive Alerts ----
router.get('/proactive/alerts', getAlerts);
router.post('/proactive/scan', runProactiveScan);
router.post('/proactive/ai-scan', aiLimiter, runAIScan);
router.put('/proactive/alerts/:id/read', markAlertRead);
router.put('/proactive/alerts/:id/action', markAlertActioned);
router.put('/proactive/alerts/:id/dismiss', dismissAlert);
router.get('/proactive/digest', getWeeklyDigest);

export default router;
