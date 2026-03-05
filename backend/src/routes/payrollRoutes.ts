import { Router } from 'express';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import {
  getStaffPayrolls, createStaffPayroll, updateStaffPayroll, deleteStaffPayroll,
  getPayrollRuns, createPayrollRun, getPayrollRunDetail,
  approvePayrollRun, markPayrollPaid, getPayslip,
} from '../controllers/payrollController';

const router = Router();

router.use(authenticateToken);

// Staff Payroll Records
router.get('/staff', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getStaffPayrolls);
router.post('/staff', authorizeRole(['SUPER_ADMIN']), createStaffPayroll);
router.put('/staff/:id', authorizeRole(['SUPER_ADMIN']), updateStaffPayroll);
router.delete('/staff/:id', authorizeRole(['SUPER_ADMIN']), deleteStaffPayroll);

// Payroll Runs
router.get('/runs', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPayrollRuns);
router.post('/runs', authorizeRole(['SUPER_ADMIN', 'BURSAR']), createPayrollRun);
router.get('/runs/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR']), getPayrollRunDetail);
router.post('/runs/:id/approve', authorizeRole(['SUPER_ADMIN']), approvePayrollRun);
router.post('/runs/:id/pay', authorizeRole(['SUPER_ADMIN']), markPayrollPaid);

// Payslips
router.get('/payslips/:id', authorizeRole(['SUPER_ADMIN', 'BURSAR', 'TEACHER']), getPayslip);

export default router;
