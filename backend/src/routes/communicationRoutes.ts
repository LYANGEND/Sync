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
import { getTemplates, upsertTemplate } from '../controllers/notificationTemplateController';
import { authenticateToken, authorizeRole } from '../middleware/authMiddleware';
import { tenantHandler } from '../utils/routeTypes';
import { requireActiveSubscription, requireFeature } from '../middleware/subscriptionMiddleware';
import { FEATURES } from '../services/subscriptionService';

const router = Router();

router.use(authenticateToken);
router.use(requireActiveSubscription); // Check subscription on all communication routes

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

// Announcement routes (requires email notifications feature)
const announcementRoles = ['SUPER_ADMIN', 'BURSAR', 'SECRETARY', 'TEACHER'];
router.post('/announcements', 
  authorizeRole(announcementRoles), 
  requireFeature(FEATURES.EMAIL_NOTIFICATIONS),
  tenantHandler(sendAnnouncement)
);

// Template Routes (Admin)
router.get('/templates', authorizeRole(['SUPER_ADMIN']), tenantHandler(getTemplates));
router.post('/templates', authorizeRole(['SUPER_ADMIN']), tenantHandler(upsertTemplate));

export default router;
