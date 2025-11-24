import { Router } from 'express';
import { getClasses, createClass, updateClass, deleteClass, getClassStudents, addStudentsToClass } from '../controllers/classController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getClasses);
router.post('/', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), createClass);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), updateClass);
router.delete('/:id', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), deleteClass);
router.get('/:id/students', getClassStudents);
router.post('/:id/students', authorizeRole(['SUPER_ADMIN', 'SECRETARY', 'SYSTEM_OWNER']), addStudentsToClass);

export default router;
