"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const gradingScaleController_1 = require("../controllers/gradingScaleController");
const reportCardController_1 = require("../controllers/reportCardController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Grading Scales
router.get('/grading-scales', gradingScaleController_1.getGradingScales);
router.post('/grading-scales', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), gradingScaleController_1.createGradingScale);
router.put('/grading-scales/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), gradingScaleController_1.updateGradingScale);
router.delete('/grading-scales/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), gradingScaleController_1.deleteGradingScale);
// Reports
router.post('/generate', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), reportCardController_1.generateStudentReport);
router.post('/generate-bulk', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), reportCardController_1.generateClassReports);
router.put('/remarks', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), reportCardController_1.updateReportRemarks);
router.get('/student', reportCardController_1.getStudentReport);
exports.default = router;
