import { Router } from 'express';
import {
  getScholarships,
  createScholarship,
  updateScholarship,
  deleteScholarship,
  bulkCreateScholarships
} from '../controllers/scholarshipController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);
router.use(authorizeRole(['SUPER_ADMIN', 'BURSAR']));

router.get('/', tenantHandler(getScholarships));
router.post('/', tenantHandler(createScholarship));
router.post('/bulk', tenantHandler(bulkCreateScholarships));
router.put('/:id', tenantHandler(updateScholarship));
router.delete('/:id', tenantHandler(deleteScholarship));

export default router;
