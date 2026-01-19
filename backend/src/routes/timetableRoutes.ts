import { Router } from 'express';
import {
  getTimetableByClass,
  getTimetableByTeacher,
  createTimetablePeriod,
  deleteTimetablePeriod
} from '../controllers/timetableController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';
import { requireActiveSubscription, requireFeature } from '../middleware/subscriptionMiddleware';
import { FEATURES } from '../services/subscriptionService';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription); // Check subscription
router.use(requireFeature(FEATURES.TIMETABLE)); // Require timetable feature

router.get('/class/:classId', tenantHandler(getTimetableByClass));
router.get('/teacher/:teacherId', tenantHandler(getTimetableByTeacher));
router.post('/', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tenantHandler(createTimetablePeriod));
router.delete('/:id', authorizeRole(['SUPER_ADMIN', 'TEACHER']), tenantHandler(deleteTimetablePeriod));

export default router;
