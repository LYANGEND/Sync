import { Router } from 'express';
import { getClasses, getClassById, createClass, updateClass, deleteClass, getClassStudents } from '../controllers/classController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

router.get('/', tenantHandler(getClasses));
router.get('/:id', tenantHandler(getClassById));
router.post('/', authorizeRole(['SUPER_ADMIN']), tenantHandler(createClass));
router.put('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(updateClass));
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(deleteClass));
router.get('/:id/students', tenantHandler(getClassStudents));

export default router;
