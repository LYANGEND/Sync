import { Router } from 'express';
import {
  getStudents,
  createStudent,
  getStudentById,
  updateStudent,
  deleteStudent,
  getMyChildren,
  bulkCreateStudents,
  bulkDeleteStudents,
  getStudentProfile
} from '../controllers/studentController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { enforceStudentLimit } from '../middleware/usageLimits';

const router = Router();

router.use(authenticateToken);

router.get('/profile/me', authorizeRole(['STUDENT']), getStudentProfile);
router.get('/my-children', authorizeRole(['PARENT']), getMyChildren);
router.get('/', getStudents);
router.post('/bulk', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), enforceStudentLimit, bulkCreateStudents);
router.post('/bulk-delete', authorizeRole(['SUPER_ADMIN']), bulkDeleteStudents);
router.get('/:id', getStudentById);
router.post('/', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), enforceStudentLimit, createStudent);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), updateStudent);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteStudent);

export default router;
