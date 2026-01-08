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
import { tenantHandler } from '../utils/routeTypes';
import { requireActiveSubscription, requireStudentLimit } from '../middleware/subscriptionMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription); // Check subscription on all student routes

router.get('/profile/me', authorizeRole(['STUDENT']), tenantHandler(getStudentProfile));
router.get('/my-children', authorizeRole(['PARENT']), tenantHandler(getMyChildren));
router.get('/', tenantHandler(getStudents));
router.post('/bulk', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), requireStudentLimit, tenantHandler(bulkCreateStudents));
router.post('/bulk-delete', authorizeRole(['SUPER_ADMIN']), tenantHandler(bulkDeleteStudents));
router.get('/:id', tenantHandler(getStudentById));
router.post('/', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), requireStudentLimit, tenantHandler(createStudent));
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'SECRETARY']), tenantHandler(updateStudent));
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(deleteStudent));

export default router;

