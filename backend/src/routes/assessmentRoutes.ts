import { Router } from 'express';
import {
  createAssessment,
  getAssessments,
  getAssessmentById,
  recordResults,
  getAssessmentResults,
  getStudentResults,
  deleteAssessment,
  bulkDeleteAssessments,
  getGradebook
} from '../controllers/assessmentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

// Assessment Management
router.post('/', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(createAssessment));
router.get('/', tenantHandler(getAssessments));
router.get('/gradebook', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'BURSAR', 'SECRETARY']), tenantHandler(getGradebook));
router.get('/:id', tenantHandler(getAssessmentById));
router.delete('/:id', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(deleteAssessment));
router.post('/bulk-delete', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(bulkDeleteAssessments));

// Results Management
router.post('/results', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(recordResults));
router.get('/:id/results', tenantHandler(getAssessmentResults));

// Student specific
router.get('/student/:studentId', tenantHandler(getStudentResults));

export default router;
