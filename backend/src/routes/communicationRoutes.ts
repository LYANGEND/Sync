import { Router } from 'express';
import {
  sendAnnouncement,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadNotificationCount,
  getConversations,
  getMessages,
  sendMessage,
  searchUsers,
  subscribeToPush,
  getSentCommunications,
  getCommunicationStatsHandler,
  getAnnouncementHistory
} from '../controllers/communicationController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Push Notification routes
router.post('/push/subscribe', subscribeToPush);

// User routes
router.get('/notifications', getMyNotifications);
router.get('/notifications/unread-count', getUnreadNotificationCount);
router.patch('/notifications/:id/read', markAsRead);
router.patch('/notifications/read-all', markAllAsRead);

// Chat routes
const chatRoles = ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT'];
router.get('/conversations', authorizeRole(chatRoles), getConversations);
router.get('/conversations/:conversationId/messages', authorizeRole(chatRoles), getMessages);
router.post('/messages', authorizeRole(chatRoles), sendMessage);
router.get('/users/search', authorizeRole(chatRoles), searchUsers);

// Announcement routes
const announcementRoles = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER'];
router.post('/announcements', authorizeRole(announcementRoles), sendAnnouncement);
router.get('/announcements/history', authorizeRole(announcementRoles), getAnnouncementHistory);

// Communication logs & stats (admin/bursar/secretary only)
const logViewRoles = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY'];
router.get('/logs', authorizeRole(logViewRoles), getSentCommunications);
router.get('/stats', authorizeRole(logViewRoles), getCommunicationStatsHandler);

export default router;
