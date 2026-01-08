import { Router } from 'express';
import {
  sendAnnouncement,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getConversations,
  getMessages,
  sendMessage,
  searchUsers,
  subscribeToPush
} from '../controllers/communicationController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';

const router = Router();

router.use(authenticateToken);

// Push Notification routes
router.post('/push/subscribe', tenantHandler(subscribeToPush));

// User routes
router.get('/notifications', tenantHandler(getMyNotifications));
router.patch('/notifications/:id/read', tenantHandler(markAsRead));
router.patch('/notifications/read-all', tenantHandler(markAllAsRead));

// Chat routes
const chatRoles = ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT'];
router.get('/conversations', authorizeRole(chatRoles), tenantHandler(getConversations));
router.get('/conversations/:conversationId/messages', authorizeRole(chatRoles), tenantHandler(getMessages));
router.post('/messages', authorizeRole(chatRoles), tenantHandler(sendMessage));
router.get('/users/search', authorizeRole(chatRoles), tenantHandler(searchUsers));

// Announcement routes
const announcementRoles = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER'];
router.post('/announcements', authorizeRole(announcementRoles), tenantHandler(sendAnnouncement));

export default router;
