"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const onlineAssessmentController_1 = require("../controllers/onlineAssessmentController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Teacher routes
router.post('/:assessmentId/questions', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), onlineAssessmentController_1.addQuestionsToAssessment);
router.get('/:assessmentId/questions', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), onlineAssessmentController_1.getAssessmentQuestions);
// Student routes
router.get('/student/my-assessments', (0, authMiddleware_1.authorizeRole)(['STUDENT', 'TEACHER', 'SUPER_ADMIN', 'PARENT']), onlineAssessmentController_1.getStudentAssessments);
router.get('/:assessmentId/take', (0, authMiddleware_1.authorizeRole)(['STUDENT', 'TEACHER', 'SUPER_ADMIN']), onlineAssessmentController_1.getQuizForStudent);
router.post('/:assessmentId/submit', (0, authMiddleware_1.authorizeRole)(['STUDENT', 'TEACHER', 'SUPER_ADMIN']), onlineAssessmentController_1.submitQuiz);
exports.default = router;
