import { Router } from 'express';
import { getSubjects, createSubject, updateSubject, deleteSubject, bulkCreateSubjects } from '../controllers/subjectController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getSubjects);
router.post('/', authorizeRole(['SUPER_ADMIN']), createSubject);
router.post('/bulk', authorizeRole(['SUPER_ADMIN']), bulkCreateSubjects);
router.put('/:id', authorizeRole(['SUPER_ADMIN']), updateSubject);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteSubject);

export default router;
