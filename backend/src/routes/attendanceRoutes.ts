import { Router } from 'express';
import { recordAttendance, getClassAttendance, getStudentAttendance } from '../controllers/attendanceController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.post('/', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'SECRETARY', 'SYSTEM_OWNER']), recordAttendance);
router.get('/', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'SYSTEM_OWNER']), getClassAttendance);
router.get('/student/:studentId', authorizeRole(['TEACHER', 'SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'SYSTEM_OWNER']), getStudentAttendance);

export default router;
