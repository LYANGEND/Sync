"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const expenseController_1 = require("../controllers/expenseController");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(authMiddleware_1.authenticateToken);
// Vendors
router.get('/vendors', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), expenseController_1.getVendors);
router.post('/vendors', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), expenseController_1.createVendor);
router.put('/vendors/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), expenseController_1.updateVendor);
router.delete('/vendors/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), expenseController_1.deleteVendor);
// Expenses
router.get('/summary', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), expenseController_1.getExpenseSummary);
router.get('/', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), expenseController_1.getExpenses);
router.get('/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), expenseController_1.getExpenseById);
router.post('/', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), expenseController_1.createExpense);
router.put('/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), expenseController_1.updateExpense);
router.post('/:id/approve', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), expenseController_1.approveExpense);
router.post('/:id/reject', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), expenseController_1.rejectExpense);
router.post('/:id/pay', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), expenseController_1.markExpensePaid);
router.delete('/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), expenseController_1.deleteExpense);
exports.default = router;
