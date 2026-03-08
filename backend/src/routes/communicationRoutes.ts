import { Router } from 'express';
import {
  sendAnnouncement,
  sendEmergencyBroadcast,
  composeWithAI,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadNotificationCount,
  deleteNotification,
  clearAllNotifications,
  getConversations,
  getMessages,
  sendMessage,
  createGroupChat,
  markMessageRead,
  searchUsers,
  subscribeToPush,
  getSentCommunications,
  getCommunicationStatsHandler,
  getAnnouncementHistory,
  acknowledgeAnnouncement,
  getAnnouncementAcks,
  getMessageTemplates,
  createMessageTemplate,
  updateMessageTemplate,
  deleteMessageTemplate,
  getCommunicationPreferences,
  updateCommunicationPreferences,
  sendTestMessage,
} from '../controllers/communicationController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateToken);

// Push Notification routes
router.post('/push/subscribe', subscribeToPush);

// Notification routes
router.get('/notifications', getMyNotifications);
router.get('/notifications/unread-count', getUnreadNotificationCount);
router.patch('/notifications/:id/read', markAsRead);
router.patch('/notifications/read-all', markAllAsRead);
router.delete('/notifications/:id', deleteNotification);
router.delete('/notifications/clear-read', clearAllNotifications);

// Chat routes
const chatRoles = ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY', 'PARENT', 'STUDENT'];
router.get('/conversations', authorizeRole(chatRoles), getConversations);
router.get('/conversations/:conversationId/messages', authorizeRole(chatRoles), getMessages);
router.post('/messages', authorizeRole(chatRoles), sendMessage);
router.patch('/messages/:messageId/read', authorizeRole(chatRoles), markMessageRead);
router.post('/group-chat', authorizeRole(chatRoles), createGroupChat);
router.get('/users/search', authorizeRole(chatRoles), searchUsers);

// Announcement routes
const announcementRoles = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER'];
router.post('/announcements', authorizeRole(announcementRoles), sendAnnouncement);
router.get('/announcements/history', authorizeRole(announcementRoles), getAnnouncementHistory);
router.post('/announcements/:announcementId/acknowledge', acknowledgeAnnouncement);
router.get('/announcements/:announcementId/acknowledgments', authorizeRole(announcementRoles), getAnnouncementAcks);

// Emergency broadcast (admin only)
router.post('/emergency-broadcast', authorizeRole(['SUPER_ADMIN']), sendEmergencyBroadcast);

// AI Composer
router.post('/ai-compose', authorizeRole(announcementRoles), composeWithAI);

// Message Templates
router.get('/templates', authorizeRole(announcementRoles), getMessageTemplates);
router.post('/templates', authorizeRole(announcementRoles), createMessageTemplate);
router.put('/templates/:id', authorizeRole(announcementRoles), updateMessageTemplate);
router.delete('/templates/:id', authorizeRole(announcementRoles), deleteMessageTemplate);

// Communication Preferences (any authenticated user)
router.get('/preferences', getCommunicationPreferences);
router.put('/preferences', updateCommunicationPreferences);

// Test message sending (admin only)
router.post('/test-message', authorizeRole(['SUPER_ADMIN']), sendTestMessage);

// Communication logs & stats (admin/bursar/secretary only)
const logViewRoles = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY'];
router.get('/logs', authorizeRole(logViewRoles), getSentCommunications);
router.get('/stats', authorizeRole(logViewRoles), getCommunicationStatsHandler);

export default router;
