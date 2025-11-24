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
  updateReportRemarks
} from '../controllers/reportCardController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Grading Scales
router.get('/grading-scales', getGradingScales);
router.post('/grading-scales', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']), createGradingScale);
router.put('/grading-scales/:id', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), updateGradingScale);
router.delete('/grading-scales/:id', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), deleteGradingScale);

// Reports
router.post('/generate', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'SYSTEM_OWNER']), generateStudentReport);
router.post('/generate-bulk', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'SYSTEM_OWNER']), generateClassReports);
router.put('/remarks', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'SYSTEM_OWNER']), updateReportRemarks);
router.get('/student', getStudentReport);

export default router;
