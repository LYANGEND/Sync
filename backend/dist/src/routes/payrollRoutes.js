"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const payrollController_1 = require("../controllers/payrollController");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Staff Payroll Records
router.get('/staff', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), payrollController_1.getStaffPayrolls);
router.post('/staff', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), payrollController_1.createStaffPayroll);
router.put('/staff/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), payrollController_1.updateStaffPayroll);
router.delete('/staff/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), payrollController_1.deleteStaffPayroll);
// Payroll Runs
router.get('/runs', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), payrollController_1.getPayrollRuns);
router.post('/runs', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), payrollController_1.createPayrollRun);
router.get('/runs/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), payrollController_1.getPayrollRunDetail);
router.post('/runs/:id/approve', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), payrollController_1.approvePayrollRun);
router.post('/runs/:id/pay', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), payrollController_1.markPayrollPaid);
// Payslips
router.get('/payslips/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'TEACHER']), payrollController_1.getPayslip);
exports.default = router;
