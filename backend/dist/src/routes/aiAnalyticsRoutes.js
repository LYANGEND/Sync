"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const aiAnalyticsController_1 = require("../controllers/aiAnalyticsController");
const aiProactiveController_1 = require("../controllers/aiProactiveController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const rateLimiter_1 = require("../middleware/rateLimiter");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
router.use((0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']));
// ---- Usage Analytics ----
router.get('/usage/summary', aiAnalyticsController_1.getUsageSummary);
router.get('/usage/feature/:feature', aiAnalyticsController_1.getFeatureBreakdown);
router.get('/adoption', aiAnalyticsController_1.getAdoptionMetrics);
// ---- Proactive Alerts ----
router.get('/proactive/alerts', aiProactiveController_1.getAlerts);
router.post('/proactive/scan', aiProactiveController_1.runProactiveScan);
router.post('/proactive/ai-scan', rateLimiter_1.aiLimiter, aiProactiveController_1.runAIScan);
router.put('/proactive/alerts/:id/read', aiProactiveController_1.markAlertRead);
router.put('/proactive/alerts/:id/action', aiProactiveController_1.markAlertActioned);
router.put('/proactive/alerts/:id/dismiss', aiProactiveController_1.dismissAlert);
router.get('/proactive/digest', aiProactiveController_1.getWeeklyDigest);
exports.default = router;
