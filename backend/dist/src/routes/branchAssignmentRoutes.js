"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const branchAssignmentController_1 = require("../controllers/branchAssignmentController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = express_1.default.Router();
// All routes require authentication
router.use(authMiddleware_1.authenticateToken);
// ==================== User Branch Assignments ====================
// Get all branch assignments for a user
router.get('/users/:userId/branches', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']), branchAssignmentController_1.getUserBranchAssignments);
// Assign a user to a branch
router.post('/users/:userId/branches', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), branchAssignmentController_1.assignUserToBranch);
// Remove a user from a branch
router.delete('/users/:userId/branches/:branchId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), branchAssignmentController_1.removeUserFromBranch);
// ==================== Student Branch Enrollments ====================
// Get all branch enrollments for a student
router.get('/students/:studentId/branches', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'SECRETARY']), branchAssignmentController_1.getStudentBranchEnrollments);
// Enroll a student in a branch
router.post('/students/:studentId/branches', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']), branchAssignmentController_1.enrollStudentInBranch);
// Remove a student from a branch
router.delete('/students/:studentId/branches/:branchId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']), branchAssignmentController_1.removeStudentFromBranch);
// ==================== Branch-centric queries ====================
// Get all users in a branch (with optional secondary assignments)
router.get('/branches/:branchId/users', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER']), authMiddleware_1.authorizeBranchAccess, branchAssignmentController_1.getBranchUsers);
// Get all students in a branch (with optional secondary enrollments)
router.get('/branches/:branchId/students', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BRANCH_MANAGER', 'TEACHER', 'SECRETARY']), authMiddleware_1.authorizeBranchAccess, branchAssignmentController_1.getBranchStudents);
exports.default = router;
