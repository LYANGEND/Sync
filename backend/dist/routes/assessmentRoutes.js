"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const assessmentController_1 = require("../controllers/assessmentController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Assessment Management
router.post('/', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), assessmentController_1.createAssessment);
router.get('/', assessmentController_1.getAssessments);
router.get('/gradebook', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN', 'BURSAR', 'SECRETARY']), assessmentController_1.getGradebook);
router.get('/:id', assessmentController_1.getAssessmentById);
router.delete('/:id', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), assessmentController_1.deleteAssessment);
router.post('/bulk-delete', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), assessmentController_1.bulkDeleteAssessments);
// Results Management
router.post('/results', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), assessmentController_1.recordResults);
router.get('/:id/results', assessmentController_1.getAssessmentResults);
// Student specific
router.get('/student/:studentId', assessmentController_1.getStudentResults);
exports.default = router;
