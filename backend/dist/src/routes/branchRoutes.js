"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const branchController_1 = require("../controllers/branchController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// All routes require authentication
router.use(authMiddleware_1.authenticateToken);
// ==================== Basic CRUD ====================
// List all branches - Accessible by authenticated users
router.get('/', branchController_1.getAllBranches);
router.get('/compare', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']), branchController_1.compareBranches);
router.get('/:id', branchController_1.getBranchById);
// Admin only routes for management
router.post('/', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), branchController_1.createBranch);
router.put('/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']), authMiddleware_1.authorizeBranchAccess, branchController_1.updateBranch);
router.delete('/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), branchController_1.deleteBranch);
// ==================== Analytics & Financials ====================
router.get('/:id/analytics', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR']), authMiddleware_1.authorizeBranchAccess, branchController_1.getBranchAnalytics);
router.get('/:id/financial-summary', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER', 'BURSAR']), authMiddleware_1.authorizeBranchAccess, branchController_1.getBranchFinancialSummary);
// ==================== Transfers ====================
router.post('/:id/students/:studentId/transfer', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']), authMiddleware_1.authorizeBranchAccess, branchController_1.transferStudent);
router.post('/:id/users/:userId/transfer', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), branchController_1.transferUser);
router.get('/:id/transfers', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']), authMiddleware_1.authorizeBranchAccess, branchController_1.getTransferHistory);
exports.default = router;
