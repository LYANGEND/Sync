import { Router } from 'express';
import {
  getTimetableByClass,
  getTimetableByTeacher,
  createTimetablePeriod,
  deleteTimetablePeriod,
  getAllPeriods
} from '../controllers/timetableController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', authorizeRole(['SUPER_ADMIN', 'TEACHER']), getAllPeriods);
router.get('/class/:classId', getTimetableByClass);
router.get('/teacher/:teacherId', getTimetableByTeacher);
router.post('/', authorizeRole(['SUPER_ADMIN', 'TEACHER']), createTimetablePeriod);
router.delete('/:id', authorizeRole(['SUPER_ADMIN', 'TEACHER']), deleteTimetablePeriod);

export default router;
