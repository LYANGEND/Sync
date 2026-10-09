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
  getClassReports,
  verifyReport
} from '../controllers/reportCardController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  applyAmendment,
  approveAmendment,
  finalizeReport,
  finalizeReportsBulk,
  getClassReadiness,
  getStudentReadiness,
  getVersion,
  listAmendments,
  listVersions,
  publishReport,
  publishReportsBulk,
  rejectAmendment,
  requestAmendment,
} from '../controllers/reportLifecycleController';

const router = Router();

// Public Verification Route
router.get('/public/verify/:id', verifyReport);

router.use(authenticateToken);

// Grading Scales
router.get('/grading-scales', getGradingScales);
router.post('/grading-scales', authorizeRole(['SUPER_ADMIN']), createGradingScale);
router.put('/grading-scales/:id', authorizeRole(['SUPER_ADMIN']), updateGradingScale);
router.delete('/grading-scales/:id', authorizeRole(['SUPER_ADMIN']), deleteGradingScale);

// Reports
router.post('/generate', authorizeRole(['TEACHER', 'SUPER_ADMIN']), generateStudentReport);
router.post('/generate-bulk', authorizeRole(['TEACHER', 'SUPER_ADMIN']), generateClassReports);
router.put('/remarks', authorizeRole(['TEACHER', 'SUPER_ADMIN']), updateReportRemarks);
router.get('/readiness/student', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'SECRETARY']), getStudentReadiness);
router.get('/readiness/class', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'SECRETARY']), getClassReadiness);
router.post('/finalize', authorizeRole(['TEACHER', 'SUPER_ADMIN']), finalizeReport);
router.post('/finalize-bulk', authorizeRole(['TEACHER', 'SUPER_ADMIN']), finalizeReportsBulk);
router.post('/publish', authorizeRole(['SUPER_ADMIN']), publishReport);
router.post('/publish-bulk', authorizeRole(['SUPER_ADMIN']), publishReportsBulk);
router.post('/amendments', authorizeRole(['TEACHER', 'SUPER_ADMIN']), requestAmendment);
router.get('/amendments', authorizeRole(['SUPER_ADMIN']), listAmendments);
router.post('/amendments/:id/approve', authorizeRole(['SUPER_ADMIN']), approveAmendment);
router.post('/amendments/:id/reject', authorizeRole(['SUPER_ADMIN']), rejectAmendment);
router.post('/amendments/:id/apply', authorizeRole(['SUPER_ADMIN']), applyAmendment);
router.get('/:reportId/versions', listVersions);
router.get('/:reportId/versions/:version', getVersion);
router.get('/student', getStudentReport);
router.get('/class', getClassReports);

export default router;
