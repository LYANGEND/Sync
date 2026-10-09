import { Router } from 'express';
import { getClasses, getClassById, createClass, updateClass, deleteClass, getClassStudents, addStudentsToClass, bulkCreateClasses } from '../controllers/classController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getClasses);
router.get('/:id', getClassById);
router.post('/', authorizeRole(['SUPER_ADMIN']), createClass);
router.post('/bulk', authorizeRole(['SUPER_ADMIN']), bulkCreateClasses);
router.put('/:id', authorizeRole(['SUPER_ADMIN']), updateClass);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteClass);
router.get('/:id/students', authorizeRole(['SUPER_ADMIN', 'TEACHER', 'BURSAR', 'SECRETARY']), getClassStudents);
router.post('/:id/students', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), addStudentsToClass);

export default router;
