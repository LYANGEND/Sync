import { Router } from 'express';
import { getTeachers, getUsers, createUser, updateUser, toggleUserStatus } from '../controllers/userController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

router.get('/teachers', getTeachers);

// User Management Routes (Super Admin only)
router.get('/', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), getUsers);
router.post('/', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), createUser);
router.put('/:id', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), updateUser);
router.patch('/:id/status', authorizeRole(['SUPER_ADMIN', 'SYSTEM_OWNER']), toggleUserStatus);

export default router;
