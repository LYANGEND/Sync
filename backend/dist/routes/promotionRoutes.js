"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promotionController_1 = require("../controllers/promotionController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Only Admins and Teachers (maybe) should handle promotions
router.get('/candidates', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'TEACHER']), promotionController_1.getPromotionCandidates);
router.post('/process', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), promotionController_1.processPromotions);
exports.default = router;
