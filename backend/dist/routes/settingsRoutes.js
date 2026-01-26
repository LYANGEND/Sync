"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settingsController_1 = require("../controllers/settingsController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const uploadMiddleware_1 = require("../middleware/uploadMiddleware");
const router = (0, express_1.Router)();
router.get('/public', settingsController_1.getPublicSettings);
router.use(authMiddleware_1.authenticateToken);
router.get('/', settingsController_1.getSettings);
router.put('/', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), settingsController_1.updateSettings);
// Logo upload routes
router.post('/logo', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), uploadMiddleware_1.uploadSchoolLogo.single('logo'), settingsController_1.uploadLogo);
router.delete('/logo', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), settingsController_1.deleteLogo);
exports.default = router;
