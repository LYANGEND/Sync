import { Router } from 'express';
import { getAuditLogs } from '../middleware/auditMiddleware';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);
router.use(authorizeRole(['SUPER_ADMIN']));

router.get('/', getAuditLogs);

export default router;
