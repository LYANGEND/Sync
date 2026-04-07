import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import * as controller from '../controllers/aiTeacherAssistantController';

const router = express.Router();

// Lesson plan generation
router.post('/generate-lesson-plan', authMiddleware, controller.generateLessonPlan);
router.post('/generate-unit-plan', authMiddleware, controller.generateUnitPlan);
router.post('/adapt-lesson-plan', authMiddleware, controller.adaptLessonPlan);
router.post('/save-lesson-plan', authMiddleware, controller.saveLessonPlan);
router.get('/lesson-plan-templates', authMiddleware, controller.getLessonPlanTemplates);

export default router;
