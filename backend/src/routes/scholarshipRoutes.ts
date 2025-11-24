import { Router } from 'express';
import { 
  getScholarships, 
  createScholarship, 
  updateScholarship, 
  deleteScholarship 
} from '../controllers/scholarshipController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(authorizeRole(['SUPER_ADMIN', 'BURSAR', 'SYSTEM_OWNER']));

router.get('/', getScholarships);
router.post('/', createScholarship);
router.put('/:id', updateScholarship);
router.delete('/:id', deleteScholarship);

export default router;
