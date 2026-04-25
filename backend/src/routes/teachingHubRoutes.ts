import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getLearningObjectives,
  getStudentQueue,
  getPendingActions,
  resolveAction,
  logIntervention
} from '../controllers/teachingHubController';

const router = Router();

// Ensure all these endpoints are protected
router.use(authenticateToken);

// Phase 1 API endpoints for the Teacher Insights Dashboard
router.get('/learning-objectives', getLearningObjectives);
router.get('/student-queue', getStudentQueue);
router.get('/pending-actions', getPendingActions);
router.post('/resolve-action', resolveAction);
router.post('/log-intervention', logIntervention);

export default router;
