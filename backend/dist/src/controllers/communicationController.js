"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnnouncementHistory = exports.getCommunicationStatsHandler = exports.getSentCommunications = exports.subscribeToPush = exports.searchUsers = exports.sendMessage = exports.getMessages = exports.getConversations = exports.getUnreadNotificationCount = exports.markAllAsRead = exports.markAsRead = exports.getMyNotifications = exports.sendAnnouncement = void 0;
const client_1 = require("@prisma/client");
const prisma_1 = require("../utils/prisma");
const zod_1 = require("zod");
const emailService_1 = require("../services/emailService");
const notificationService_1 = require("../services/notificationService");
const communicationLogService_1 = require("../services/communicationLogService");
const sendAnnouncementSchema = zod_1.z.object({
    subject: zod_1.z.string().min(1),
    message: zod_1.z.string().min(1),
    targetRoles: zod_1.z.array(zod_1.z.nativeEnum(client_1.Role)).optional(), // If empty, send to all? Or require specific roles
    sendEmail: zod_1.z.boolean().default(false),
    sendNotification: zod_1.z.boolean().default(true),
});
const sendAnnouncement = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { subject, message, targetRoles, sendEmail: shouldSendEmail, sendNotification } = sendAnnouncementSchema.parse(req.body);
        // 1. Find target users
        const whereClause = { isActive: true };
        if (targetRoles && targetRoles.length > 0) {
            whereClause.role = { in: targetRoles };
        }
        const users = yield prisma_1.prisma.user.findMany({
            where: whereClause,
            select: { id: true, email: true, fullName: true },
        });
        if (users.length === 0) {
            return res.status(404).json({ message: 'No users found for the selected roles' });
        }
        const userIds = users.map(u => u.id);
        // 2. Persist announcement to database
        yield prisma_1.prisma.announcement.create({
            data: {
                subject,
                message,
                targetRoles: (targetRoles === null || targetRoles === void 0 ? void 0 : targetRoles.map(r => r.toString())) || ['ALL'],
                sentViaEmail: shouldSendEmail,
                sentViaNotification: sendNotification,
                recipientCount: users.length,
                createdById: userId,
            },
        });
        // 3. Send Notifications
        if (sendNotification) {
            yield (0, notificationService_1.broadcastNotification)(userIds, subject, message, 'INFO');
        }
        // 4. Send Emails with audit logging
        if (shouldSendEmail) {
            Promise.all(users.map(user => (0, emailService_1.sendEmail)(user.email, subject, `<p>Dear ${user.fullName},</p><p>${message}</p>`, {
                source: 'announcement',
                sentById: userId,
                recipientName: user.fullName,
            }))).catch(err => console.error('Background email sending failed', err));
        }
        res.json({ message: `Announcement sent to ${users.length} users` });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Send announcement error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.sendAnnouncement = sendAnnouncement;
const getMyNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const notifications = yield prisma_1.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        res.json(notifications);
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to fetch notifications' });
    }
});
exports.getMyNotifications = getMyNotifications;
const markAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { id } = req.params;
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        yield prisma_1.prisma.notification.updateMany({
            where: { id, userId }, // Ensure ownership
            data: { isRead: true },
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to update notification' });
    }
});
exports.markAsRead = markAsRead;
const markAllAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        yield prisma_1.prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to update notifications' });
    }
});
exports.markAllAsRead = markAllAsRead;
const getUnreadNotificationCount = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const count = yield prisma_1.prisma.notification.count({
            where: { userId, isRead: false },
        });
        res.json({ count });
    }
    catch (error) {
        res.status(500).json({ message: 'Failed to get notification count' });
    }
});
exports.getUnreadNotificationCount = getUnreadNotificationCount;
const sendMessageSchema = zod_1.z.object({
    conversationId: zod_1.z.string().uuid().optional(),
    recipientId: zod_1.z.string().uuid().optional(),
    content: zod_1.z.string().min(1),
});
const getConversations = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const conversations = yield prisma_1.prisma.conversation.findMany({
            where: {
                participants: {
                    some: {
                        userId: userId
                    }
                }
            },
            include: {
                participants: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                fullName: true,
                                role: true,
                                email: true
                            }
                        }
                    }
                },
                messages: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 1
                }
            },
            orderBy: {
                updatedAt: 'desc'
            }
        });
        const formatted = conversations.map(c => {
            const otherParticipants = c.participants
                .filter(p => p.userId !== userId)
                .map(p => p.user);
            const lastMessage = c.messages[0];
            return {
                id: c.id,
                participants: otherParticipants,
                lastMessage: lastMessage ? {
                    content: lastMessage.content,
                    createdAt: lastMessage.createdAt,
                    isRead: lastMessage.isRead,
                    senderId: lastMessage.senderId
                } : null,
                updatedAt: c.updatedAt
            };
        });
        res.json(formatted);
    }
    catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({ message: 'Failed to fetch conversations' });
    }
});
exports.getConversations = getConversations;
const getMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { conversationId } = req.params;
        const participant = yield prisma_1.prisma.conversationParticipant.findUnique({
            where: {
                conversationId_userId: {
                    conversationId,
                    userId: userId
                }
            }
        });
        if (!participant) {
            return res.status(403).json({ message: 'Not a participant in this conversation' });
        }
        const messages = yield prisma_1.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: {
                    select: {
                        id: true,
                        fullName: true
                    }
                }
            }
        });
        res.json(messages);
    }
    catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({ message: 'Failed to fetch messages' });
    }
});
exports.getMessages = getMessages;
const sendMessage = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const { conversationId, recipientId, content } = sendMessageSchema.parse(req.body);
        let targetConversationId = conversationId;
        if (!targetConversationId) {
            if (!recipientId) {
                return res.status(400).json({ message: 'Recipient ID is required for new conversation' });
            }
            const existing = yield prisma_1.prisma.conversation.findFirst({
                where: {
                    AND: [
                        { participants: { some: { userId: userId } } },
                        { participants: { some: { userId: recipientId } } }
                    ]
                }
            });
            if (existing) {
                targetConversationId = existing.id;
            }
            else {
                const newConv = yield prisma_1.prisma.conversation.create({
                    data: {
                        participants: {
                            create: [
                                { userId: userId },
                                { userId: recipientId }
                            ]
                        }
                    }
                });
                targetConversationId = newConv.id;
            }
        }
        const message = yield prisma_1.prisma.message.create({
            data: {
                conversationId: targetConversationId,
                senderId: userId,
                content
            },
            include: {
                sender: {
                    select: {
                        id: true,
                        fullName: true
                    }
                }
            }
        });
        yield prisma_1.prisma.conversation.update({
            where: { id: targetConversationId },
            data: { updatedAt: new Date() }
        });
        res.json(message);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ errors: error.errors });
        }
        console.error('Send message error:', error);
        res.status(500).json({ message: 'Failed to send message' });
    }
});
exports.sendMessage = sendMessage;
const searchUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { query } = req.query;
        const currentUser = req.user;
        const currentUserId = currentUser === null || currentUser === void 0 ? void 0 : currentUser.userId;
        const userRole = currentUser === null || currentUser === void 0 ? void 0 : currentUser.role;
        if (!query || typeof query !== 'string' || query.length < 2) {
            return res.json([]);
        }
        const whereClause = {
            AND: [
                {
                    OR: [
                        { fullName: { contains: query, mode: 'insensitive' } },
                        { email: { contains: query, mode: 'insensitive' } }
                    ]
                },
                { id: { not: currentUserId } },
                { isActive: true }
            ]
        };
        // RESTRICTION: Parents and Students can ONLY see Staff
        if (userRole === 'PARENT' || userRole === 'STUDENT') {
            whereClause.AND.push({
                role: { in: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY'] }
            });
        }
        const users = yield prisma_1.prisma.user.findMany({
            where: whereClause,
            select: {
                id: true,
                fullName: true,
                role: true,
                email: true
            },
            take: 10
        });
        res.json(users);
    }
    catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({ message: 'Failed to search users' });
    }
});
exports.searchUsers = searchUsers;
const subscribeToPush = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        const subscription = req.body;
        if (!userId || !subscription || !subscription.endpoint) {
            return res.status(400).json({ message: 'Invalid subscription data' });
        }
        // Upsert subscription
        yield prisma_1.prisma.pushSubscription.upsert({
            where: { endpoint: subscription.endpoint },
            update: {
                userId,
                keys: subscription.keys,
            },
            create: {
                userId,
                endpoint: subscription.endpoint,
                keys: subscription.keys,
            },
        });
        res.status(201).json({ message: 'Push subscription saved' });
    }
    catch (error) {
        console.error('Push subscription error:', error);
        res.status(500).json({ message: 'Failed to save subscription' });
    }
});
exports.subscribeToPush = subscribeToPush;
// ============ Communication Logs & History ============
const getSentCommunications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { channel, status, source, search, page, limit } = req.query;
        const result = yield (0, communicationLogService_1.getCommunicationLogs)({
            channel: channel,
            status: status,
            source: source,
            search: search,
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 25,
        });
        res.json(result);
    }
    catch (error) {
        console.error('Get sent communications error:', error);
        res.status(500).json({ message: 'Failed to fetch communication logs' });
    }
});
exports.getSentCommunications = getSentCommunications;
const getCommunicationStatsHandler = (_req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const stats = yield (0, communicationLogService_1.getCommunicationStats)();
        res.json(stats);
    }
    catch (error) {
        console.error('Get communication stats error:', error);
        res.status(500).json({ message: 'Failed to fetch communication stats' });
    }
});
exports.getCommunicationStatsHandler = getCommunicationStatsHandler;
const getAnnouncementHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const [announcements, total] = yield Promise.all([
            prisma_1.prisma.announcement.findMany({
                orderBy: { createdAt: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                include: {
                    createdBy: {
                        select: { id: true, fullName: true, role: true },
                    },
                },
            }),
            prisma_1.prisma.announcement.count(),
        ]);
        res.json({
            announcements,
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
        });
    }
    catch (error) {
        console.error('Get announcement history error:', error);
        res.status(500).json({ message: 'Failed to fetch announcement history' });
    }
});
exports.getAnnouncementHistory = getAnnouncementHistory;
