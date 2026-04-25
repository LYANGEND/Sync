import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getLessons,
  getLesson,
  createFromAction,
  updateLesson,
  generateActivities,
  changeLessonStatus,
} from '../controllers/adaptWorkspaceController';

const router = Router();

router.use(authenticateToken);

// Lesson CRUD
router.get('/lessons', getLessons);
router.get('/lessons/:id', getLesson);
router.post('/create-from-action', createFromAction);
router.put('/lessons/:id', updateLesson);

// AI activity generation
router.post('/lessons/:id/generate-activities', generateActivities);

// Status transitions
router.patch('/lessons/:id/status', changeLessonStatus);

export default router;
