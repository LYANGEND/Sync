import { Router } from 'express';
import {
  getStudentAcademicDashboard,
  getGradeTrends,
  getClassAnalytics,
} from '../controllers/studentPortalController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Student/Parent academic dashboard
router.get('/student/:studentId/dashboard', getStudentAcademicDashboard);
router.get('/student/:studentId/trends', getGradeTrends);

// Class analytics (teacher/admin)
router.get('/class/:classId/analytics', authorizeRole(['TEACHER', 'SUPER_ADMIN']), getClassAnalytics);

export default router;
