import { PrismaClient, NotificationType } from '@prisma/client';
import { sendPushToUser, sendPushToUsers } from './pushService';

const prisma = new PrismaClient();

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'INFO',
  sendPush: boolean = true
) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
      },
    });

    // Also send push notification
    if (sendPush) {
      sendPushToUser(userId, {
        title,
        body: message,
        tag: `notification-${notification.id}`,
        data: { notificationId: notification.id, type },
      }).catch((err) => console.error('Push notification failed:', err));
    }

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

export const broadcastNotification = async (
  userIds: string[],
  title: string,
  message: string,
  type: NotificationType = 'INFO',
  sendPush: boolean = true
) => {
  try {
    // Use createMany for bulk insertion
    await prisma.notification.createMany({
      data: userIds.map(userId => ({
        userId,
        title,
        message,
        type,
      })),
    });

    // Also send push notifications
    if (sendPush) {
      sendPushToUsers(userIds, {
        title,
        body: message,
        tag: `broadcast-${Date.now()}`,
        data: { type },
      }).catch((err) => console.error('Push broadcast failed:', err));
    }

    return true;
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    return false;
  }
};
