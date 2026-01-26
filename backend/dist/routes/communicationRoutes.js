"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const communicationController_1 = require("../controllers/communicationController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Push Notification routes
router.post('/push/subscribe', communicationController_1.subscribeToPush);
// User routes
router.get('/notifications', communicationController_1.getMyNotifications);
router.get('/notifications/unread-count', communicationController_1.getUnreadNotificationCount);
router.patch('/notifications/:id/read', communicationController_1.markAsRead);
router.patch('/notifications/read-all', communicationController_1.markAllAsRead);
// Chat routes
const chatRoles = ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT'];
router.get('/conversations', (0, authMiddleware_1.authorizeRole)(chatRoles), communicationController_1.getConversations);
router.get('/conversations/:conversationId/messages', (0, authMiddleware_1.authorizeRole)(chatRoles), communicationController_1.getMessages);
router.post('/messages', (0, authMiddleware_1.authorizeRole)(chatRoles), communicationController_1.sendMessage);
router.get('/users/search', (0, authMiddleware_1.authorizeRole)(chatRoles), communicationController_1.searchUsers);
// Announcement routes
const announcementRoles = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER'];
router.post('/announcements', (0, authMiddleware_1.authorizeRole)(announcementRoles), communicationController_1.sendAnnouncement);
exports.default = router;
