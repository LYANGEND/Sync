import { Router } from 'express';
import { 
  getTimetableByClass, 
  getTimetableByTeacher, 
  createTimetablePeriod, 
  deleteTimetablePeriod 
} from '../controllers/timetableController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/class/:classId', getTimetableByClass);
router.get('/teacher/:teacherId', getTimetableByTeacher);
router.post('/', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']), createTimetablePeriod);
router.delete('/:id', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'SYSTEM_OWNER']), deleteTimetablePeriod);

export default router;
