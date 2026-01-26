"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const academicsController_1 = require("../controllers/academicsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Assign a teacher to a subject in a class
router.post('/assign', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'ADMIN']), academicsController_1.assignSubjectTeacher);
// Get assignments for a specific class
router.get('/class/:classId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'BURSAR']), academicsController_1.getClassSubjectTeachers);
// Get assignments for a specific teacher
router.get('/teacher/:teacherId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'ADMIN', 'TEACHER']), academicsController_1.getTeacherSubjectAssignments);
exports.default = router;
