import { Router } from 'express';
import {
  addQuestionsToAssessment,
  getAssessmentQuestions,
  getQuizForStudent,
  submitQuiz,
  getStudentAssessments
} from '../controllers/onlineAssessmentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

// Teacher routes
router.post('/:assessmentId/questions', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(addQuestionsToAssessment));
router.get('/:assessmentId/questions', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(getAssessmentQuestions));

// Student routes
router.get('/student/my-assessments', authorizeRole(['STUDENT', 'TEACHER', 'SUPER_ADMIN', 'PARENT']), tenantHandler(getStudentAssessments));
router.get('/:assessmentId/take', authorizeRole(['STUDENT', 'TEACHER', 'SUPER_ADMIN']), tenantHandler(getQuizForStudent));
router.post('/:assessmentId/submit', authorizeRole(['STUDENT', 'TEACHER', 'SUPER_ADMIN']), tenantHandler(submitQuiz));

export default router;
