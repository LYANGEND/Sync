import { Router } from 'express';
import { 
  getScholarships, 
  createScholarship, 
  updateScholarship, 
  deleteScholarship,
  bulkCreateScholarships
} from '../controllers/scholarshipController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(authorizeRole(['SUPER_ADMIN', 'BURSAR']));

router.get('/', getScholarships);
router.post('/', createScholarship);
router.post('/bulk', bulkCreateScholarships);
router.put('/:id', updateScholarship);
router.delete('/:id', deleteScholarship);

export default router;
