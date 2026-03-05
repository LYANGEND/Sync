import { Router } from 'express';
import {
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
} from '../controllers/academicCalendarController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getEvents);
router.post('/', authorizeRole(['SUPER_ADMIN']), createEvent);
router.put('/:id', authorizeRole(['SUPER_ADMIN']), updateEvent);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteEvent);

export default router;
