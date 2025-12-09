import { Router } from 'express';
// Update import to include new controllers
import { 
  getFeeTemplates, 
  createFeeTemplate, 
  assignFeeToClass, 
  getFeeTemplateById, 
  updateFeeTemplate, 
  deleteFeeTemplate 
} from '../controllers/feeController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/templates', getFeeTemplates);
router.post('/templates', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createFeeTemplate);

router.get('/templates/:id', getFeeTemplateById);
router.put('/templates/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR']), updateFeeTemplate);
router.delete('/templates/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR']), deleteFeeTemplate);

router.post('/assign-class', authorizeRole(['SUPER_ADMIN', 'BURSAR']), assignFeeToClass);

export default router;
