import { Router } from 'express';
import { 
  getGradingScales, 
  createGradingScale, 
  updateGradingScale, 
  deleteGradingScale 
} from '../controllers/gradingScaleController';
import { 
  generateStudentReport, 
  getStudentReport, 
  generateClassReports,
  updateReportRemarks,
  getClassReports
} from '../controllers/reportCardController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Grading Scales
router.get('/grading-scales', getGradingScales);
router.post('/grading-scales', authorizeRole(['SUPER_ADMIN', 'TEACHER']), createGradingScale);
router.put('/grading-scales/:id', authorizeRole(['SUPER_ADMIN']), updateGradingScale);
router.delete('/grading-scales/:id', authorizeRole(['SUPER_ADMIN']), deleteGradingScale);

// Reports
router.post('/generate', authorizeRole(['TEACHER', 'SUPER_ADMIN']), generateStudentReport);
router.post('/generate-bulk', authorizeRole(['TEACHER', 'SUPER_ADMIN']), generateClassReports);
router.put('/remarks', authorizeRole(['TEACHER', 'SUPER_ADMIN']), updateReportRemarks);
router.get('/student', getStudentReport);
router.get('/class', getClassReports);

export default router;
