"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const syllabusController_1 = require("../controllers/syllabusController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Topics (Syllabus Definition)
router.get('/topics', syllabusController_1.getTopics);
router.post('/topics', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), syllabusController_1.createTopic);
router.delete('/topics/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), syllabusController_1.deleteTopic);
// Progress Tracking
router.get('/progress', syllabusController_1.getClassProgress);
router.put('/progress/:topicId/:classId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), syllabusController_1.updateTopicProgress);
// Lesson Plans
router.get('/lesson-plans', syllabusController_1.getLessonPlans);
router.post('/lesson-plans', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), syllabusController_1.createLessonPlan);
exports.default = router;
