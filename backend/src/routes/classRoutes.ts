import { Router } from 'express';
import { getClasses, getClassById, createClass, updateClass, deleteClass, getClassStudents } from '../controllers/classController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';
import { requireActiveSubscription, requireClassLimit } from '../middleware/subscriptionMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription); // Check subscription on all class routes

router.get('/', tenantHandler(getClasses));
router.get('/:id', tenantHandler(getClassById));
router.post('/', 
  authorizeRole(['SUPER_ADMIN']), 
  requireClassLimit, // Check class limit before creating
  tenantHandler(createClass)
);
router.put('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(updateClass));
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(deleteClass));
router.get('/:id/students', tenantHandler(getClassStudents));

export default router;
