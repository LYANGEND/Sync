import { Router } from 'express';
import { getSubjects, createSubject, updateSubject, deleteSubject, bulkCreateSubjects } from '../controllers/subjectController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

router.get('/', tenantHandler(getSubjects));
router.post('/', authorizeRole(['SUPER_ADMIN']), tenantHandler(createSubject));
router.post('/bulk', authorizeRole(['SUPER_ADMIN']), tenantHandler(bulkCreateSubjects));
router.put('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(updateSubject));
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(deleteSubject));

export default router;
