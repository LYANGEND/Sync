import { Router } from 'express';
import {
  getSubmissions,
  gradeSubmission,
} from '../controllers/homeworkController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Teacher/Admin routes - manage homework submissions and grading
router.get('/:assessmentId/submissions', authorizeRole(['TEACHER', 'SUPER_ADMIN']), getSubmissions);
router.put('/:id/grade', authorizeRole(['TEACHER', 'SUPER_ADMIN']), gradeSubmission);

export default router;
