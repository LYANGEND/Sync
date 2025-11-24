import { Router } from 'express';
import { getSubjects, createSubject, updateSubject, deleteSubject } from '../controllers/subjectController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getSubjects);
router.post('/', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), createSubject);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), updateSubject);
router.delete('/:id', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), deleteSubject);

export default router;
