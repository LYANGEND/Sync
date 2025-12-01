import { Router } from 'express';
import { 
  getStudents, 
  createStudent, 
  getStudentById, 
  updateStudent, 
  deleteStudent, 
  getMyChildren,
  bulkCreateStudents,
  bulkDeleteStudents
} from '../controllers/studentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/my-children', authorizeRole(['PARENT']), getMyChildren);
router.get('/', getStudents);
router.post('/bulk', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), bulkCreateStudents);
router.post('/bulk-delete', authorizeRole(['SUPER_ADMIN']), bulkDeleteStudents);
router.get('/:id', getStudentById);
router.post('/', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), createStudent);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), updateStudent);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteStudent);

export default router;
