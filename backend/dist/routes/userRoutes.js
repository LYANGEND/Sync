"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const userController_1 = require("../controllers/userController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
router.get('/teachers', userController_1.getTeachers);
// User Management Routes (Super Admin only)
router.get('/', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), userController_1.getUsers);
router.post('/', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), userController_1.createUser);
router.put('/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), userController_1.updateUser);
router.patch('/:id/status', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), userController_1.toggleUserStatus);
exports.default = router;
