import { Router } from 'express';
import { 
  createAssessment, 
  getAssessments, 
  getAssessmentById,
  recordResults, 
  getAssessmentResults,
  getStudentResults,
  deleteAssessment,
  bulkDeleteAssessments
} from '../controllers/assessmentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Assessment Management
router.post('/', authorizeRole(['TEACHER', 'SUPER_ADMIN']), createAssessment);
router.get('/', getAssessments);
router.get('/:id', getAssessmentById);
router.delete('/:id', authorizeRole(['TEACHER', 'SUPER_ADMIN']), deleteAssessment);
router.post('/bulk-delete', authorizeRole(['TEACHER', 'SUPER_ADMIN']), bulkDeleteAssessments);

// Results Management
router.post('/results', authorizeRole(['TEACHER', 'SUPER_ADMIN']), recordResults);
router.get('/:id/results', getAssessmentResults);

// Student specific
router.get('/student/:studentId', getStudentResults);

export default router;
