import { Router } from 'express';
import {
  createResource,
  getTeacherResources,
  getStudentResources,
  deleteResource,
} from '../controllers/resourceController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';
import { requireActiveSubscription } from '../middleware/subscriptionMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription);

// Teacher routes
router.post('/', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(createResource));
router.get('/teacher', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(getTeacherResources));
router.delete('/:resourceId', authorizeRole(['TEACHER', 'SUPER_ADMIN']), tenantHandler(deleteResource));

// Student/Parent routes
router.get('/student', authorizeRole(['STUDENT', 'PARENT', 'TEACHER', 'SUPER_ADMIN']), tenantHandler(getStudentResources));

export default router;
