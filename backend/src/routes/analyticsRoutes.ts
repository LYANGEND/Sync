import { Router } from 'express';
import {
  getAnalyticsDashboard,
  getRevenueAnalytics,
  getAttendanceAnalyticsDashboard,
  getSchoolHealthDashboard,
} from '../controllers/analyticsController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Analytics routes - Admin/Bursar access
router.get('/dashboard', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'BRANCH_MANAGER']), getAnalyticsDashboard);
router.get('/revenue', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getRevenueAnalytics);
router.get('/attendance', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'BRANCH_MANAGER']), getAttendanceAnalyticsDashboard);
router.get('/school-health', authorizeRole(['SUPER_ADMIN', 'BRANCH_MANAGER']), getSchoolHealthDashboard);

export default router;
