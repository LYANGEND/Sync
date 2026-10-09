import { Router } from 'express';
import {
  acknowledgeRolloverWarnings,
  approveRollover,
  createRolloverBackup,
  preflightRollover,
  verifyRolloverBackup,
  createRollover,
  dryRunRollover,
  getRolloverEnrollmentPlan,
  getRollover,
  listRolloverEvents,
  listRollovers,
  listRolloverTasks,
  prepareRollover,
  saveRolloverEnrollmentDecisions,
  stageRolloverEnrollments,
  updateRolloverConfiguration,
  validateRolloverEnrollments,
  validateRollover,
} from '../controllers/termRolloverController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken, authorizeRole(['SUPER_ADMIN']));

router.get('/', listRollovers);
router.post('/', createRollover);
router.get('/:id/preflight', preflightRollover);
router.post('/:id/preflight', preflightRollover);
router.put('/:id/warning-acknowledgements', acknowledgeRolloverWarnings);
router.post('/:id/backup', createRolloverBackup);
router.post('/:id/verify-backup', verifyRolloverBackup);
router.post('/:id/approve', approveRollover);
router.get('/:id/tasks', listRolloverTasks);
router.get('/:id/events', listRolloverEvents);
router.get('/:id/validation', validateRollover);
router.get('/:id/enrollment-plan', getRolloverEnrollmentPlan);
router.put('/:id/enrollment-decisions', saveRolloverEnrollmentDecisions);
router.post('/:id/stage-enrollments', stageRolloverEnrollments);
router.get('/:id/enrollment-validation', validateRolloverEnrollments);
router.post('/:id/dry-run', dryRunRollover);
router.post('/:id/prepare', prepareRollover);
router.patch('/:id/configuration', updateRolloverConfiguration);
router.get('/:id', getRollover);

export default router;
