import { Router } from 'express';
import { getStudents, createStudent, getStudentById, updateStudent, deleteStudent, getMyChildren } from '../controllers/studentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/my-children', authorizeRole(['PARENT', 'SYSTEM_OWNER']), getMyChildren);
router.get('/', getStudents);
router.get('/:id', getStudentById);
router.post('/', authorizeRole(['SUPER_ADMIN', 'SECRETARY', 'SYSTEM_OWNER']), createStudent);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'SECRETARY', 'SYSTEM_OWNER']), updateStudent);
router.delete('/:id', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), deleteStudent);

export default router;
