"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
// Update import to include new controllers
const feeController_1 = require("../controllers/feeController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
router.get('/statement/:studentId', feeController_1.getStudentStatement);
router.get('/templates', feeController_1.getFeeTemplates);
router.post('/templates', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), feeController_1.createFeeTemplate);
router.post('/templates/bulk', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), feeController_1.bulkCreateFeeTemplates);
router.get('/templates/:id', feeController_1.getFeeTemplateById);
router.put('/templates/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), feeController_1.updateFeeTemplate);
router.delete('/templates/:id', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), feeController_1.deleteFeeTemplate);
router.post('/assign-class', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), feeController_1.assignFeeToClass);
exports.default = router;
