import { Router } from 'express';
import {
	createAcademicTerm,
	deleteAcademicTerm,
	getAcademicTerms,
	getCurrentAcademicTerm,
	startAcademicTermClosing,
	updateAcademicTerm,
} from '../controllers/academicTermController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
	getInstructionalDays,
	replaceInstructionalDays,
} from '../controllers/instructionalDayController';

const router = Router();

router.use(authenticateToken);

router.get('/', getAcademicTerms);
router.get('/current', getCurrentAcademicTerm);
router.get('/:id/instructional-days', getInstructionalDays);
router.post('/', authorizeRole(['SUPER_ADMIN']), createAcademicTerm);
// The active term is set only via PUT /settings (currentTermId).
router.post('/:id/start-closing', authorizeRole(['SUPER_ADMIN']), startAcademicTermClosing);
router.put('/:id/instructional-days', authorizeRole(['SUPER_ADMIN']), replaceInstructionalDays);
router.put('/:id', authorizeRole(['SUPER_ADMIN']), updateAcademicTerm);
router.delete('/:id', authorizeRole(['SUPER_ADMIN']), deleteAcademicTerm);

export default router;
