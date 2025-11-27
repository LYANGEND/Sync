import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  getDebtorsList,
  getDailyCollectionReport,
  getFeeCollectionSummary,
  getAttendanceSummary,
  getStudentAttendanceHistory,
  getAbsenteeismReport,
  getClassRoster,
  getEnrollmentStats
} from '../controllers/reportsController';

const router = Router();

router.use(authenticateToken);

// Financial Reports - Bursar and Admin
router.get('/financial/debtors', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getDebtorsList);
router.get('/financial/daily-collection', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getDailyCollectionReport);
router.get('/financial/fee-summary', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getFeeCollectionSummary);

// Attendance Reports - Admin, Teachers
router.get('/attendance/summary', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SECRETARY']), getAttendanceSummary);
router.get('/attendance/student', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SECRETARY']), getStudentAttendanceHistory);
router.get('/attendance/absenteeism', authorizeRole(['SUPER_ADMIN', 'TEACHER']), getAbsenteeismReport);

// Student Reports - All staff
router.get('/students/roster', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SECRETARY', 'BURSAR']), getClassRoster);
router.get('/students/enrollment', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SECRETARY', 'BURSAR']), getEnrollmentStats);

export default router;
