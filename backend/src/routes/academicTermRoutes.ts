import { Router } from 'express';
import { getAcademicTerms, createAcademicTerm } from '../controllers/academicTermController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/', getAcademicTerms);
router.post('/', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), createAcademicTerm);

export default router;
