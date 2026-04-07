import express from 'express';
import { authMiddleware } from '../middleware/authMiddleware';
import * as controller from '../controllers/aiStudyBuddyController';

const router = express.Router();

// Practice questions
router.post('/generate-practice-questions', authMiddleware, controller.generatePracticeQuestions);

// Concept explanation
router.post('/explain-concept', authMiddleware, controller.explainConcept);

// Study plan
router.post('/create-study-plan', authMiddleware, controller.createStudyPlan);

// Note summarization
router.post('/summarize-notes', authMiddleware, controller.summarizeNotes);

// Student progress
router.get('/student-progress/:studentId', authMiddleware, controller.getStudentProgress);

export default router;
