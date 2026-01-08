import { Router } from 'express';
import { getAcademicTerms, createAcademicTerm, getCurrentTerm, updateAcademicTerm, setActiveTerm } from '../controllers/academicTermController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

router.get('/', tenantHandler(getAcademicTerms));
router.get('/current', tenantHandler(getCurrentTerm));
router.post('/', authorizeRole(['SUPER_ADMIN']), tenantHandler(createAcademicTerm));
router.put('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(updateAcademicTerm));
router.patch('/:id/activate', authorizeRole(['SUPER_ADMIN']), tenantHandler(setActiveTerm));

export default router;
