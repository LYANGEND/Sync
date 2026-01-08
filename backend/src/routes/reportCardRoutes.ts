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
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

// Grading Scales
router.get('/grading-scales', tenantHandler(getGradingScales));
router.post('/grading-scales', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tenantHandler(createGradingScale));
router.put('/grading-scales/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(updateGradingScale));
router.delete('/grading-scales/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(deleteGradingScale));

// Reports
router.post('/generate', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(generateStudentReport));
router.post('/generate-bulk', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(generateClassReports));
router.put('/remarks', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(updateReportRemarks));
router.get('/student', tenantHandler(getStudentReport));
router.get('/class', tenantHandler(getClassReports));

export default router;
