import { Router } from 'express';
import { getTeachers, getUsers, createUser, updateUser, toggleUserStatus } from '../controllers/userController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

router.get('/teachers', tenantHandler(getTeachers));

// User Management Routes (Super Admin only)
router.get('/', authorizeRole(['SUPER_ADMIN']), tenantHandler(getUsers));
router.post('/', authorizeRole(['SUPER_ADMIN']), tenantHandler(createUser));
router.put('/:id', authorizeRole(['SUPER_ADMIN']), tenantHandler(updateUser));
router.patch('/:id/status', authorizeRole(['SUPER_ADMIN']), tenantHandler(toggleUserStatus));

export default router;
