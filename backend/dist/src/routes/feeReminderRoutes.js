"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const feeReminderController_1 = require("../controllers/feeReminderController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Get students with outstanding fees (for reminder preview)
router.get('/outstanding', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), feeReminderController_1.getStudentsWithOutstandingFees);
// Send fee reminders
router.post('/send', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR']), feeReminderController_1.sendFeeReminders);
// Send payment receipt for a specific payment
router.post('/receipt/:paymentId', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN', 'BURSAR', 'SECRETARY']), feeReminderController_1.sendPaymentReceipt);
// Test notification settings
router.post('/test', (0, authMiddleware_1.authorizeRole)(['SUPER_ADMIN']), feeReminderController_1.testNotification);
exports.default = router;
