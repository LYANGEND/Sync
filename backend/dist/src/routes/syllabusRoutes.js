"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const syllabusController_1 = require("../controllers/syllabusController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
const teacherOrAdmin = (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']);
// Syllabus Overview (subject-level stats)
router.get('/overview', syllabusController_1.getSyllabusOverview);
// Topics (Syllabus Definition)
router.get('/topics', syllabusController_1.getTopics);
router.post('/topics', teacherOrAdmin, syllabusController_1.createTopic);
router.put('/topics/:id', teacherOrAdmin, syllabusController_1.updateTopic);
router.delete('/topics/:id', teacherOrAdmin, syllabusController_1.deleteTopic);
// SubTopics
router.get('/subtopics', syllabusController_1.getSubTopics);
router.post('/subtopics', teacherOrAdmin, syllabusController_1.createSubTopic);
router.put('/subtopics/:id', teacherOrAdmin, syllabusController_1.updateSubTopic);
router.delete('/subtopics/:id', teacherOrAdmin, syllabusController_1.deleteSubTopic);
// Topic Availability (for AI modal - subjects with topics for a class)
router.get('/topic-availability', syllabusController_1.getTopicAvailability);
// Progress Tracking
router.get('/progress', syllabusController_1.getClassProgress);
router.put('/progress/:topicId/:classId', teacherOrAdmin, syllabusController_1.updateTopicProgress);
// Lesson Plans
router.get('/lesson-plans', syllabusController_1.getLessonPlans);
router.post('/lesson-plans', teacherOrAdmin, syllabusController_1.createLessonPlan);
router.put('/lesson-plans/:id', teacherOrAdmin, syllabusController_1.updateLessonPlan);
router.delete('/lesson-plans/:id', teacherOrAdmin, syllabusController_1.deleteLessonPlan);
// AI-Powered Lesson Plan Generation + Next Topic Suggestion
router.post('/generate-lesson-plan', teacherOrAdmin, syllabusController_1.generateLessonPlan);
router.post('/generate-questions', teacherOrAdmin, syllabusController_1.generateQuestions);
router.post('/generate-homework', teacherOrAdmin, syllabusController_1.generateHomework);
router.post('/generate-syllabus', teacherOrAdmin, syllabusController_1.generateSyllabus);
router.get('/next-topic', syllabusController_1.getNextTopic);
exports.default = router;
