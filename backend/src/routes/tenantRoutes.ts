import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  getCurrentTenant, updateTenant,
  listFeatures, updateFeature,
  listCustomFields, createCustomField, deleteCustomField,
  getCustomFieldValues, saveCustomFieldValues,
} from '../controllers/tenantController';

const router = Router();

// Tenant profile
router.get('/', authenticateToken, getCurrentTenant);
router.put('/', authenticateToken, authorizeRole(['SUPER_ADMIN']), updateTenant);

// Feature flags
router.get('/features', authenticateToken, listFeatures);
router.put('/features/:feature', authenticateToken, authorizeRole(['SUPER_ADMIN']), updateFeature);

// Custom fields definition
router.get('/custom-fields', authenticateToken, listCustomFields);
router.post('/custom-fields', authenticateToken, authorizeRole(['SUPER_ADMIN', 'ADMIN']), createCustomField);
router.delete('/custom-fields/:id', authenticateToken, authorizeRole(['SUPER_ADMIN', 'ADMIN']), deleteCustomField);

// Custom field values for a specific entity (e.g., student)
router.get('/custom-fields/:entityId/values', authenticateToken, getCustomFieldValues);
router.put('/custom-fields/:entityId/values', authenticateToken, saveCustomFieldValues);

export default router;
