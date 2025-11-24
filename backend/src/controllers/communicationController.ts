import { Request, Response } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { z } from 'zod';
import { sendEmail } from '../services/emailService';
import { broadcastNotification, createNotification } from '../services/notificationService';

const prisma = new PrismaClient();

const sendAnnouncementSchema = z.object({
  subject: z.string().min(1),
  message: z.string().min(1),
  targetRoles: z.array(z.nativeEnum(Role)).optional(), // If empty, send to all? Or require specific roles
  sendEmail: z.boolean().default(false),
  sendNotification: z.boolean().default(true),
});

export const sendAnnouncement = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const { subject, message, targetRoles, sendEmail: shouldSendEmail, sendNotification } = sendAnnouncementSchema.parse(req.body);

    // 1. Find target users
    const whereClause: any = { isActive: true, schoolId: req.school.id };
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
    const emails = users.map(u => u.email);

    // 2. Send Notifications
    if (sendNotification) {
      await broadcastNotification(req.school.id, userIds, subject, message, 'INFO');
    }

    // 3. Send Emails (Async to not block response)
    if (shouldSendEmail) {
      // Send individually or use BCC? For now, let's loop (simple but slow for large lists)
      // In production, use a queue (BullMQ)
      Promise.all(users.map(user => 
        sendEmail(req.school!.id, user.email, subject, `<p>Dear ${user.fullName},</p><p>${message}</p>`)
      )).catch(err => console.error('Background email sending failed', err));
    }

    res.json({ message: `Announcement sent to ${users.length} users` });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Send announcement error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getMyNotifications = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const userId = (req as any).user?.userId;
    const notifications = await prisma.notification.findMany({
      where: { userId, schoolId: req.school.id },
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
      where: { id, userId }, // Ensure ownership
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

const sendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  recipientId: z.string().uuid().optional(),
  content: z.string().min(1),
});

export const getConversations = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const userId = (req as any).user?.userId;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const conversations = await prisma.conversation.findMany({
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
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const userId = (req as any).user?.userId;
    const { conversationId } = req.params;
    
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: userId!
        }
      }
    });

    if (!participant) {
      return res.status(403).json({ message: 'Not a participant in this conversation' });
    }

    const messages = await prisma.message.findMany({
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
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  try {
    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }
    const userId = (req as any).user?.userId;
    const { conversationId, recipientId, content } = sendMessageSchema.parse(req.body);

    let targetConversationId = conversationId;

    if (!targetConversationId) {
      if (!recipientId) {
        return res.status(400).json({ message: 'Recipient ID is required for new conversation' });
      }

      // Verify recipient belongs to the same school
      const recipient = await prisma.user.findFirst({
        where: {
          id: recipientId,
          schoolId: req.school.id
        }
      });

      if (!recipient) {
        return res.status(404).json({ message: 'Recipient not found' });
      }

      const existing = await prisma.conversation.findFirst({
        where: {
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
        sender: {
          select: {
            id: true,
            fullName: true
          }
        }
      }
    });

    await prisma.conversation.update({
      where: { id: targetConversationId },
      data: { updatedAt: new Date() }
    });

    res.json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
};

export const searchUsers = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    const currentUserId = (req as any).user?.userId;

    if (!req.school) {
      return res.status(400).json({ message: 'Tenant context missing' });
    }

    if (!query || typeof query !== 'string' || query.length < 2) {
      return res.json([]);
    }

    const users = await prisma.user.findMany({
      where: {
        AND: [
          {
            OR: [
              { fullName: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } }
            ]
          },
          { id: { not: currentUserId } },
          { isActive: true },
          { schoolId: req.school.id }
        ]
      },
      select: {
        id: true,
        fullName: true,
        role: true,
        email: true
      },
      take: 10
    });

    res.json(users);
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Failed to search users' });
  }
};
