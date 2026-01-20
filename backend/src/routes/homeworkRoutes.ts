import { Router } from 'express';
import {
  createHomework,
  getTeacherHomework,
  getStudentHomework,
  submitHomework,
  gradeHomework,
  bulkGradeHomework,
  getHomeworkSubmissions,
  deleteHomework,
} from '../controllers/homeworkController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';
import { requireActiveSubscription } from '../middleware/subscriptionMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

// Teacher routes
router.post('/', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(createHomework));
router.get('/teacher', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(getTeacherHomework));
router.get('/:homeworkId/submissions', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(getHomeworkSubmissions));
router.post('/grade/:submissionId', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(gradeHomework));
router.post('/grade/bulk', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(bulkGradeHomework));
router.delete('/:homeworkId', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(deleteHomework));

// Student/Parent routes
router.get('/student', authorizeRole(['STUDENT', 'PARENT', 'TEACHER', 'SUPER_ADMIN']), tenantHandler(getStudentHomework));
router.post('/:homeworkId/submit', authorizeRole(['STUDENT', 'PARENT', 'TEACHER', 'SUPER_ADMIN']), tenantHandler(submitHomework));

export default router;
