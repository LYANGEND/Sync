"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const studentPortalController_1 = require("../controllers/studentPortalController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Student/Parent academic dashboard
router.get('/student/:studentId/dashboard', studentPortalController_1.getStudentAcademicDashboard);
router.get('/student/:studentId/trends', studentPortalController_1.getGradeTrends);
// Class analytics (teacher/admin)
router.get('/class/:classId/analytics', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), studentPortalController_1.getClassAnalytics);
exports.default = router;
