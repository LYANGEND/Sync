"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analyticsController_1 = require("../controllers/analyticsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Analytics routes - Admin/Bursar access
router.get('/dashboard', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), analyticsController_1.getAnalyticsDashboard);
router.get('/revenue', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), analyticsController_1.getRevenueAnalytics);
router.get('/attendance', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER', 'BRANCH_MANAGER']), analyticsController_1.getAttendanceAnalyticsDashboard);
router.get('/school-health', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']), analyticsController_1.getSchoolHealthDashboard);
exports.default = router;
