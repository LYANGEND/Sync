"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const homeworkController_1 = require("../controllers/homeworkController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Teacher/Admin routes - manage homework submissions and grading
router.get('/:assessmentId/submissions', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), homeworkController_1.getSubmissions);
router.put('/:id/grade', (0, authMiddleware_1.authorizeRole)(['TEACHER', 'SUPER_ADMIN']), homeworkController_1.gradeSubmission);
exports.default = router;
