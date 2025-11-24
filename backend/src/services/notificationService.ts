import { PrismaClient, NotificationType } from '@prisma/client';

const prisma = new PrismaClient();

export const createNotification = async (
  schoolId: string,
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'INFO'
) => {
  try {
    const notification = await prisma.notification.create({
      data: {
        schoolId,
        userId,
        title,
        message,
        type,
      },
    });
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

export const broadcastNotification = async (
  schoolId: string,
  userIds: string[],
  title: string,
  message: string,
  type: NotificationType = 'INFO'
) => {
  try {
    // Use createMany for bulk insertion
    await prisma.notification.createMany({
      data: userIds.map(userId => ({
        schoolId,
        userId,
        title,
        message,
        type,
      })),
    });
    return true;
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    return false;
  }
};
