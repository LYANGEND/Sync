import { PrismaClient, NotificationType } from '@prisma/client';
import { sendPushNotification } from './pushService';

const prisma = new PrismaClient();

export const createNotification = async (
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'INFO'
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

    // Send Push Notification
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    const payload = {
      title,
      body: message,
      icon: '/pwa-192x192.png',
      data: { url: '/notifications' }
    };

    subscriptions.forEach(sub => {
      sendPushNotification(sub, payload);
    });

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
  type: NotificationType = 'INFO'
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

    // Send Push Notifications
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: { in: userIds } },
    });

    const payload = {
      title,
      body: message,
      icon: '/pwa-192x192.png',
      data: { url: '/notifications' }
    };

    subscriptions.forEach(sub => {
      sendPushNotification(sub, payload);
    });

    return true;
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    return false;
  }
};
