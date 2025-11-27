import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configure web-push with VAPID keys
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:admin@school.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string; icon?: string }>;
}

// Subscribe a user to push notifications
export async function subscribeToPush(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
) {
  try {
    // Upsert subscription (update if endpoint exists, create if not)
    const pushSub = await prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
    return pushSub;
  } catch (error) {
    console.error('Error saving push subscription:', error);
    throw error;
  }
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(endpoint: string) {
  try {
    await prisma.pushSubscription.delete({
      where: { endpoint },
    });
    return true;
  } catch (error) {
    console.error('Error removing push subscription:', error);
    return false;
  }
}

// Send push notification to a specific user
export async function sendPushToUser(userId: string, payload: PushPayload) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('VAPID keys not configured, skipping push notification');
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (error: unknown) {
      failed++;
      // Remove invalid subscriptions (410 Gone or 404 Not Found)
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
  }

  return { sent, failed };
}

// Send push notification to multiple users
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('VAPID keys not configured, skipping push notification');
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (error: unknown) {
      failed++;
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
  }

  return { sent, failed };
}

// Send push notification to users by role
export async function sendPushToRole(role: string, payload: PushPayload) {
  const users = await prisma.user.findMany({
    where: { role: role as never, isActive: true },
    select: { id: true },
  });

  return sendPushToUsers(users.map((u) => u.id), payload);
}

// Broadcast push notification to all subscribed users
export async function broadcastPush(payload: PushPayload) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('VAPID keys not configured, skipping push notification');
    return { sent: 0, failed: 0 };
  }

  const subscriptions = await prisma.pushSubscription.findMany();

  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (error: unknown) {
      failed++;
      const statusCode = (error as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } });
      }
    }
  }

  return { sent, failed };
}

// Get VAPID public key for frontend
export function getVapidPublicKey() {
  return vapidPublicKey || null;
}
