import { Router } from 'express';
import {
  getFeeTemplates,
  createFeeTemplate,
  assignFeeToClass,
  getFeeTemplateById,
  updateFeeTemplate,
  deleteFeeTemplate,
  bulkCreateFeeTemplates,
  getStudentStatement
} from '../controllers/feeController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

router.get('/statement/:studentId', tenantHandler(getStudentStatement));

router.get('/templates', tenantHandler(getFeeTemplates));
router.post('/templates', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(createFeeTemplate));
router.post('/templates/bulk', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(bulkCreateFeeTemplates));

router.get('/templates/:id', tenantHandler(getFeeTemplateById));
router.put('/templates/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(updateFeeTemplate));
router.delete('/templates/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(deleteFeeTemplate));

router.post('/assign-class', authorizeRole(['SUPER_ADMIN', 'BURSAR']), tenantHandler(assignFeeToClass));

export default router;
