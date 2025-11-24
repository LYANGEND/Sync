import express from 'express';
import { createSchool, listSchools, updateSchool, deleteSchool } from '../controllers/schoolController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = express.Router();

// All school management routes require authentication
router.use(authenticateToken);

router.post('/', authorizeRole(['SYSTEM_OWNER']), createSchool);
router.get('/', authorizeRole(['SYSTEM_OWNER']), listSchools);
router.put('/:id', authorizeRole(['SYSTEM_OWNER']), updateSchool);
router.delete('/:id', authorizeRole(['SYSTEM_OWNER']), deleteSchool);

export default router;
