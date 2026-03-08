import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { z } from 'zod';
import { sendEmail } from '../services/emailService';
import { broadcastNotification, createNotification } from '../services/notificationService';
import { getCommunicationLogs, getCommunicationStats } from '../services/communicationLogService';
import smsService from '../services/smsService';
import whatsappService from '../services/whatsappService';
import { broadcastPush } from '../services/pushService';

// ============ ANNOUNCEMENTS ============

const sendAnnouncementSchema = z.object({
  subject: z.string().min(1),
  message: z.string().min(1),
  targetRoles: z.array(z.nativeEnum(Role)).optional(),
  sendEmail: z.boolean().default(false),
  sendSms: z.boolean().default(false),
  sendWhatsApp: z.boolean().default(false),
  sendNotification: z.boolean().default(true),
  priority: z.enum(['NORMAL', 'URGENT', 'EMERGENCY']).default('NORMAL'),
  scheduledAt: z.string().optional(),
});

export const sendAnnouncement = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const data = sendAnnouncementSchema.parse(req.body);
    const { subject, message, targetRoles, sendEmail: shouldSendEmail, sendSms: shouldSendSms, sendWhatsApp: shouldSendWhatsApp, sendNotification, priority, scheduledAt } = data;

    // Find target users
    const whereClause: any = { isActive: true };
    if (targetRoles && targetRoles.length > 0) {
      whereClause.role = { in: targetRoles };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, email: true, fullName: true },
    });

    if (users.length === 0) {
      return res.status(404).json({ message: 'No users found for the selected roles' });
    }

    const userIds = users.map(u => u.id);
    const isScheduled = scheduledAt ? new Date(scheduledAt) > new Date() : false;

    // Persist announcement
    const announcement = await (prisma as any).announcement.create({
      data: {
        subject,
        message,
        targetRoles: targetRoles?.map(r => r.toString()) || ['ALL'],
        sentViaEmail: shouldSendEmail,
        sentViaSms: shouldSendSms,
        sentViaWhatsApp: shouldSendWhatsApp,
        sentViaNotification: sendNotification,
        recipientCount: users.length,
        priority,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        sentAt: isScheduled ? null : new Date(),
        createdById: userId,
      },
    });

    // If scheduled for the future, don't send now
    if (isScheduled) {
      return res.json({ message: `Announcement scheduled for ${scheduledAt}`, announcementId: announcement.id });
    }

    // Send In-App Notifications
    if (sendNotification) {
      await broadcastNotification(userIds, subject, message, priority === 'EMERGENCY' ? 'WARNING' : 'INFO');
    }

    // Send Emails
    if (shouldSendEmail) {
      Promise.all(users.map(user =>
        sendEmail(user.email, subject, `<p>Dear ${user.fullName},</p><p>${message}</p>`, {
          source: 'announcement',
          sentById: userId,
          recipientName: user.fullName,
        })
      )).catch(err => console.error('Background email sending failed', err));
    }

    // Send SMS
    if (shouldSendSms) {
      const usersWithPhones = await prisma.user.findMany({
        where: { id: { in: userIds } },
        include: { children: { select: { guardianPhone: true } } },
      });

      Promise.all(usersWithPhones.map(async (user: any) => {
        const phone = user.children?.[0]?.guardianPhone;
        if (phone) {
          await smsService.send(phone, `${subject}: ${message.substring(0, 140)}`, {
            source: 'announcement',
            sentById: userId,
            recipientName: user.fullName,
          });
        }
      })).catch(err => console.error('Background SMS sending failed', err));
    }

    // Send WhatsApp
    if (shouldSendWhatsApp) {
      const usersWithPhones = await prisma.user.findMany({
        where: { id: { in: userIds } },
        include: { children: { select: { guardianPhone: true } } },
      });

      Promise.all(usersWithPhones.map(async (user: any) => {
        const phone = user.children?.[0]?.guardianPhone;
        if (phone) {
          await whatsappService.sendMessage(phone, `📢 *${subject}*\n\n${message}`, {
            source: 'announcement',
            sentById: userId,
            recipientName: user.fullName,
          });
        }
      })).catch(err => console.error('Background WhatsApp sending failed', err));
    }

    res.json({ message: `Announcement sent to ${users.length} users`, announcementId: announcement.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Send announcement error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ============ EMERGENCY BROADCAST ============

export const sendEmergencyBroadcast = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { subject, message } = z.object({
      subject: z.string().min(1),
      message: z.string().min(1),
    }).parse(req.body);

    // Send to ALL active users via ALL channels
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, email: true, fullName: true },
    });

    // Also get phone numbers
    const usersWithPhones = await prisma.user.findMany({
      where: { isActive: true },
      include: { children: { select: { guardianPhone: true } } },
    });

    const userIds = users.map(u => u.id);

    // Persist as emergency announcement
    await (prisma as any).announcement.create({
      data: {
        subject: `🚨 EMERGENCY: ${subject}`,
        message,
        targetRoles: ['ALL'],
        sentViaEmail: true,
        sentViaSms: true,
        sentViaWhatsApp: true,
        sentViaNotification: true,
        recipientCount: users.length,
        priority: 'EMERGENCY',
        sentAt: new Date(),
        createdById: userId,
      },
    });

    // Fire all channels simultaneously
    await Promise.all([
      // In-app notifications
      broadcastNotification(userIds, `🚨 EMERGENCY: ${subject}`, message, 'ERROR'),

      // Emails
      Promise.all(users.map(user =>
        sendEmail(user.email, `🚨 EMERGENCY: ${subject}`, `<div style="border:3px solid red;padding:20px;"><h1 style="color:red;">🚨 EMERGENCY</h1><p><strong>${subject}</strong></p><p>${message}</p></div>`, {
          source: 'emergency_broadcast',
          sentById: userId,
          recipientName: user.fullName,
        })
      )).catch(err => console.error('Emergency email error', err)),

      // SMS
      Promise.all(usersWithPhones.map(async (user: any) => {
        const phone = user.children?.[0]?.guardianPhone;
        if (phone) {
          await smsService.send(phone, `🚨 EMERGENCY from school: ${subject} - ${message.substring(0, 120)}`, {
            source: 'emergency_broadcast',
            sentById: userId,
          });
        }
      })).catch(err => console.error('Emergency SMS error', err)),

      // WhatsApp
      Promise.all(usersWithPhones.map(async (user: any) => {
        const phone = user.children?.[0]?.guardianPhone;
        if (phone) {
          await whatsappService.sendMessage(phone, `🚨 *EMERGENCY - ${subject}*\n\n${message}`, {
            source: 'emergency_broadcast',
            sentById: userId,
          });
        }
      })).catch(err => console.error('Emergency WhatsApp error', err)),

      // Push
      broadcastPush(userIds, `🚨 EMERGENCY: ${subject}`, message, {
        source: 'emergency_broadcast',
        sentById: userId,
      }),
    ]);

    res.json({ message: `Emergency broadcast sent to ${users.length} users via ALL channels` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Emergency broadcast error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ============ AI ANNOUNCEMENT COMPOSER ============

export const composeWithAI = async (req: Request, res: Response) => {
  try {
    const { topic, tone, audience, channel } = z.object({
      topic: z.string().min(1),
      tone: z.enum(['formal', 'friendly', 'urgent', 'celebratory']).default('formal'),
      audience: z.string().optional(),
      channel: z.enum(['email', 'sms', 'whatsapp', 'all']).default('all'),
    }).parse(req.body);

    // Dynamic import of AI service
    const { default: aiService } = await import('../services/aiService');

    const channelInstruction = channel === 'sms'
      ? 'Keep the message under 160 characters.'
      : channel === 'whatsapp'
        ? 'Use WhatsApp formatting with *bold* and emojis. Keep it concise.'
        : 'Create a well-formatted message suitable for email/notification.';

    const prompt = `You are a school communication assistant. Write a ${tone} school announcement about: ${topic}
${audience ? `Target audience: ${audience}` : ''}
${channelInstruction}

Return a JSON object with:
- "subject": a clear subject line
- "message": the announcement body text`;

    const result = await aiService.generateText(prompt);

    // Try to parse JSON from the response
    let parsed: any;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { subject: topic, message: result };
    } catch {
      parsed = { subject: topic, message: result };
    }

    res.json(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('AI compose error:', error);
    res.status(500).json({ message: 'Failed to compose with AI. Check AI settings.' });
  }
};

// ============ NOTIFICATIONS ============

export const getMyNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    await prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update notification' });
  }
};

export const markAllAsRead = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update notifications' });
  }
};

export const getUnreadNotificationCount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get notification count' });
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    await prisma.notification.deleteMany({
      where: { id, userId },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete notification' });
  }
};

export const clearAllNotifications = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    await prisma.notification.deleteMany({
      where: { userId, isRead: true },
    });

    res.json({ success: true, message: 'All read notifications cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to clear notifications' });
  }
};

// ============ CHAT / MESSAGING ============

const sendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  recipientId: z.string().uuid().optional(),
  content: z.string().min(1),
});

export const getConversations = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const conversations = await prisma.conversation.findMany({
      where: {
        participants: { some: { userId } }
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, fullName: true, role: true, email: true } }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Get unread counts for each conversation
    const unreadCounts = await Promise.all(
      conversations.map(c =>
        prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: userId },
            isRead: false,
          },
        })
      )
    );

    const formatted = conversations.map((c, idx) => {
      const otherParticipants = c.participants
        .filter(p => p.userId !== userId)
        .map(p => p.user);

      const lastMessage = c.messages[0];

      return {
        id: c.id,
        isGroup: (c as any).isGroup || false,
        name: (c as any).name || null,
        participants: otherParticipants,
        lastMessage: lastMessage ? {
          content: lastMessage.content,
          createdAt: lastMessage.createdAt,
          isRead: lastMessage.isRead,
          senderId: lastMessage.senderId
        } : null,
        unreadCount: unreadCounts[idx],
        updatedAt: c.updatedAt
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { conversationId } = req.params;

    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: userId! }
      }
    });

    if (!participant) {
      return res.status(403).json({ message: 'Not a participant in this conversation' });
    }

    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: { select: { id: true, fullName: true } }
      }
    });

    // Auto-mark messages from others as read
    await prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { conversationId, recipientId, content } = sendMessageSchema.parse(req.body);

    let targetConversationId = conversationId;

    if (!targetConversationId) {
      if (!recipientId) {
        return res.status(400).json({ message: 'Recipient ID is required for new conversation' });
      }

      const existing = await prisma.conversation.findFirst({
        where: {
          isGroup: false,
          AND: [
            { participants: { some: { userId: userId } } },
            { participants: { some: { userId: recipientId } } }
          ]
        }
      });

      if (existing) {
        targetConversationId = existing.id;
      } else {
        const newConv = await prisma.conversation.create({
          data: {
            participants: {
              create: [
                { userId: userId! },
                { userId: recipientId }
              ]
            }
          }
        });
        targetConversationId = newConv.id;
      }
    }

    const message = await prisma.message.create({
      data: {
        conversationId: targetConversationId!,
        senderId: userId!,
        content
      },
      include: {
        sender: { select: { id: true, fullName: true } }
      }
    });

    await prisma.conversation.update({
      where: { id: targetConversationId },
      data: { updatedAt: new Date() }
    });

    // Send in-app notification to other participants
    const participants = await prisma.conversationParticipant.findMany({
      where: { conversationId: targetConversationId!, userId: { not: userId } },
    });
    const senderName = message.sender.fullName;
    for (const p of participants) {
      createNotification(
        p.userId,
        `New message from ${senderName}`,
        content.substring(0, 100),
        'INFO'
      ).catch(() => {});
    }

    // Emit via Socket.io if available
    const io = (req.app as any).io;
    if (io) {
      io.to(`conversation:${targetConversationId}`).emit('new_message', message);
      for (const p of participants) {
        io.to(`user:${p.userId}`).emit('conversation_updated', {
          conversationId: targetConversationId,
          lastMessage: { content, createdAt: message.createdAt, senderId: userId },
        });
      }
    }

    res.json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
};

// ============ GROUP CHATS ============

export const createGroupChat = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const { name, participantIds } = z.object({
      name: z.string().min(1),
      participantIds: z.array(z.string().uuid()).min(1),
    }).parse(req.body);

    const allParticipants = [...new Set([userId!, ...participantIds])];

    const conversation = await prisma.conversation.create({
      data: {
        isGroup: true,
        name,
        participants: {
          create: allParticipants.map(uid => ({ userId: uid })),
        },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, fullName: true, role: true, email: true } },
          },
        },
      },
    });

    res.json(conversation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Create group chat error:', error);
    res.status(500).json({ message: 'Failed to create group chat' });
  }
};

// ============ MESSAGE READ RECEIPTS ============

export const markMessageRead = async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = (req as any).user?.userId;

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ message: 'Message not found' });
    if (message.senderId === userId) return res.json({ success: true });

    await prisma.message.update({
      where: { id: messageId },
      data: { isRead: true, readAt: new Date() },
    });

    // Emit read receipt via Socket.io
    const io = (req.app as any).io;
    if (io) {
      io.to(`conversation:${message.conversationId}`).emit('message_read', {
        messageId,
        readAt: new Date(),
        readBy: userId,
      });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark message as read' });
  }
};

// ============ USER SEARCH ============

export const searchUsers = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    const currentUser = (req as any).user;
    const currentUserId = currentUser?.userId;
    const userRole = currentUser?.role;

    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.json([]);
    }

    const whereClause: any = {
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

    // Parents and Students can ONLY see Staff
    if (userRole === 'PARENT' || userRole === 'STUDENT') {
      whereClause.AND.push({
        role: { in: ['SUPER_ADMIN', 'BURSAR', 'TEACHER', 'SECRETARY'] }
      });
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      select: { id: true, fullName: true, role: true, email: true },
      take: 10
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Failed to search users' });
  }
};

// ============ PUSH SUBSCRIPTION ============

export const subscribeToPush = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const subscription = req.body;

    if (!userId || !subscription || !subscription.endpoint) {
      return res.status(400).json({ message: 'Invalid subscription data' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: { userId, keys: subscription.keys },
      create: { userId, endpoint: subscription.endpoint, keys: subscription.keys },
    });

    res.status(201).json({ message: 'Push subscription saved' });
  } catch (error) {
    console.error('Push subscription error:', error);
    res.status(500).json({ message: 'Failed to save subscription' });
  }
};

// ============ COMMUNICATION LOGS & HISTORY ============

export const getSentCommunications = async (req: Request, res: Response) => {
  try {
    const { channel, status, source, search, page, limit } = req.query;

    const result = await getCommunicationLogs({
      channel: channel as any,
      status: status as any,
      source: source as string,
      search: search as string,
      page: page ? parseInt(page as string) : 1,
      limit: limit ? parseInt(limit as string) : 25,
    });

    res.json(result);
  } catch (error) {
    console.error('Get sent communications error:', error);
    res.status(500).json({ message: 'Failed to fetch communication logs' });
  }
};

export const getCommunicationStatsHandler = async (_req: Request, res: Response) => {
  try {
    const stats = await getCommunicationStats();
    res.json(stats);
  } catch (error) {
    console.error('Get communication stats error:', error);
    res.status(500).json({ message: 'Failed to fetch communication stats' });
  }
};

export const getAnnouncementHistory = async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const [announcements, total] = await Promise.all([
      (prisma as any).announcement.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          createdBy: { select: { id: true, fullName: true, role: true } },
          _count: { select: { acknowledgments: true } },
        },
      }),
      (prisma as any).announcement.count(),
    ]);

    res.json({
      announcements,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Get announcement history error:', error);
    res.status(500).json({ message: 'Failed to fetch announcement history' });
  }
};

// ============ ANNOUNCEMENT ACKNOWLEDGMENT ============

export const acknowledgeAnnouncement = async (req: Request, res: Response) => {
  try {
    const { announcementId } = req.params;
    const userId = (req as any).user?.userId;

    await (prisma as any).announcementAcknowledgment.upsert({
      where: {
        announcementId_userId: { announcementId, userId },
      },
      update: {},
      create: { announcementId, userId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Acknowledge error:', error);
    res.status(500).json({ message: 'Failed to acknowledge announcement' });
  }
};

export const getAnnouncementAcks = async (req: Request, res: Response) => {
  try {
    const { announcementId } = req.params;

    const acks = await (prisma as any).announcementAcknowledgment.findMany({
      where: { announcementId },
      select: { userId: true, acknowledgedAt: true },
    });

    res.json({ count: acks.length, acknowledgments: acks });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get acknowledgments' });
  }
};

// ============ MESSAGE TEMPLATES ============

export const getMessageTemplates = async (req: Request, res: Response) => {
  try {
    const { category, channel } = req.query;
    const where: any = {};
    if (category) where.category = category;
    if (channel) where.channel = channel;

    const templates = await (prisma as any).messageTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch templates' });
  }
};

export const createMessageTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const data = z.object({
      name: z.string().min(1),
      subject: z.string().optional(),
      body: z.string().min(1),
      channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'ALL']).default('ALL'),
      category: z.string().default('general'),
    }).parse(req.body);

    const template = await (prisma as any).messageTemplate.create({
      data: { ...data, createdById: userId },
    });

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to create template' });
  }
};

export const updateMessageTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = z.object({
      name: z.string().min(1).optional(),
      subject: z.string().optional(),
      body: z.string().min(1).optional(),
      channel: z.enum(['EMAIL', 'SMS', 'WHATSAPP', 'ALL']).optional(),
      category: z.string().optional(),
    }).parse(req.body);

    const template = await (prisma as any).messageTemplate.update({
      where: { id },
      data,
    });

    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to update template' });
  }
};

export const deleteMessageTemplate = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await (prisma as any).messageTemplate.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete template' });
  }
};

// ============ COMMUNICATION PREFERENCES ============

export const getCommunicationPreferences = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    let prefs = await (prisma as any).communicationPreference.findUnique({
      where: { userId },
    });

    if (!prefs) {
      prefs = {
        emailEnabled: true,
        smsEnabled: true,
        whatsappEnabled: true,
        pushEnabled: true,
        quietHoursStart: null,
        quietHoursEnd: null,
      };
    }

    res.json(prefs);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch preferences' });
  }
};

export const updateCommunicationPreferences = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const data = z.object({
      emailEnabled: z.boolean().optional(),
      smsEnabled: z.boolean().optional(),
      whatsappEnabled: z.boolean().optional(),
      pushEnabled: z.boolean().optional(),
      quietHoursStart: z.string().nullable().optional(),
      quietHoursEnd: z.string().nullable().optional(),
    }).parse(req.body);

    const prefs = await (prisma as any).communicationPreference.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });

    res.json(prefs);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to update preferences' });
  }
};

// ============ SEND TEST MESSAGE ============

export const sendTestMessage = async (req: Request, res: Response) => {
  try {
    const { channel, to } = z.object({
      channel: z.enum(['email', 'sms', 'whatsapp']),
      to: z.string().min(1),
    }).parse(req.body);

    const userId = (req as any).user?.userId;
    let success = false;
    let error = '';

    switch (channel) {
      case 'email':
        success = await sendEmail(to, '✅ Sync Test Email', '<h1>Test Email</h1><p>If you received this, your email settings are working correctly!</p>', {
          source: 'test_message',
          sentById: userId,
        });
        break;
      case 'sms':
        const smsResult = await smsService.send(to, 'Test SMS from Sync. If you received this, your SMS settings are working correctly!', {
          source: 'test_message',
          sentById: userId,
        });
        success = smsResult.success;
        error = smsResult.error || '';
        break;
      case 'whatsapp':
        const waResult = await whatsappService.sendMessage(to, '✅ *Test WhatsApp Message from Sync*\n\nIf you received this, your WhatsApp settings are working correctly!', {
          source: 'test_message',
          sentById: userId,
        });
        success = waResult.success;
        error = waResult.error || '';
        break;
    }

    if (success) {
      res.json({ success: true, message: `Test ${channel} sent successfully!` });
    } else {
      res.status(400).json({ success: false, message: `Test ${channel} failed: ${error || 'Check settings'}` });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    res.status(500).json({ message: 'Failed to send test message' });
  }
};

// ============ SCHEDULED ANNOUNCEMENT PROCESSOR ============

export const processScheduledAnnouncements = async () => {
  try {
    const now = new Date();
    const pending = await (prisma as any).announcement.findMany({
      where: {
        scheduledAt: { lte: now },
        sentAt: null,
      },
      include: {
        createdBy: { select: { id: true } },
      },
    });

    for (const announcement of pending) {
      const whereClause: any = { isActive: true };
      const roles = announcement.targetRoles;
      if (roles && roles.length > 0 && !roles.includes('ALL')) {
        whereClause.role = { in: roles };
      }

      const users = await prisma.user.findMany({
        where: whereClause,
        select: { id: true, email: true, fullName: true },
      });
      const userIds = users.map((u: any) => u.id);

      if (announcement.sentViaNotification) {
        await broadcastNotification(userIds, announcement.subject, announcement.message, 'INFO');
      }

      if (announcement.sentViaEmail) {
        Promise.all(users.map((user: any) =>
          sendEmail(user.email, announcement.subject, `<p>Dear ${user.fullName},</p><p>${announcement.message}</p>`, {
            source: 'scheduled_announcement',
            sentById: announcement.createdBy?.id,
            recipientName: user.fullName,
          })
        )).catch(err => console.error('Scheduled email error', err));
      }

      await (prisma as any).announcement.update({
        where: { id: announcement.id },
        data: { sentAt: now },
      });

      console.log(`Processed scheduled announcement: ${announcement.subject}`);
    }
  } catch (error) {
    console.error('Process scheduled announcements error:', error);
  }
};
