import { Router } from 'express';
import { recordAttendance, getClassAttendance, getStudentAttendance, getAttendanceAnalytics } from '../controllers/attendanceController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

router.post('/', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'SECRETARY']), tenantHandler(recordAttendance));
router.get('/', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'BURSAR', 'SECRETARY']), tenantHandler(getClassAttendance));
router.get('/analytics', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'SECRETARY']), tenantHandler(getAttendanceAnalytics));
router.get('/student/:studentId', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'BURSAR', 'SECRETARY']), tenantHandler(getStudentAttendance));

export default router;
