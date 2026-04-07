import webpush from 'web-push';
import { prisma } from '../utils/prisma';
import { logCommunication, updateCommunicationLogStatus } from './communicationLogService';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY || '';
const privateVapidKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

const vapidConfigured = publicVapidKey.length > 10 && privateVapidKey.length > 10
  && publicVapidKey !== 'not-set' && privateVapidKey !== 'not-set';

if (!vapidConfigured) {
  console.warn('VAPID keys not configured. Push notifications will not work.');
} else {
  try {
    webpush.setVapidDetails(vapidEmail, publicVapidKey, privateVapidKey);
  } catch (err) {
    console.warn('VAPID key setup failed (invalid keys). Push notifications disabled:', err);
  }
}

export const sendPushNotification = async (subscription: any, payload: any) => {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    // Remove invalid subscriptions (expired / unsubscribed)
    if (error.statusCode === 404 || error.statusCode === 410) {
      try {
        await prisma.pushSubscription.delete({ where: { endpoint: subscription.endpoint } });
        console.log('Removed invalid push subscription:', subscription.endpoint);
      } catch {}
    }
    return false;
  }
};

/**
 * Send push notifications to ALL subscribed devices for a given user.
 * Called automatically when a notification is created.
 */
export const sendPushToUser = async (
  userId: string,
  title: string,
  message: string,
  options?: { source?: string; sentById?: string }
): Promise<{ sent: number; failed: number }> => {
  let sent = 0;
  let failed = 0;

  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return { sent: 0, failed: 0 };

    for (const sub of subscriptions) {
      const logId = await logCommunication({
        channel: 'PUSH',
        status: 'PENDING',
        message: `${title}: ${message}`.substring(0, 500),
        source: options?.source || 'auto_push',
        sentById: options?.sentById,
      });

      const payload = {
        title,
        body: message,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        data: { url: '/' },
      };

      const success = await sendPushNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload
      );

      if (logId) await updateCommunicationLogStatus(logId, success ? 'SENT' : 'FAILED');
      if (success) sent++;
      else failed++;
    }
  } catch (error) {
    console.error('sendPushToUser error:', error);
  }

  return { sent, failed };
};

/**
 * Send push notifications to multiple users at once.
 */
export const broadcastPush = async (
  userIds: string[],
  title: string,
  message: string,
  options?: { source?: string; sentById?: string }
): Promise<{ sent: number; failed: number }> => {
  let totalSent = 0;
  let totalFailed = 0;

  // Process in batches to avoid overwhelming
  const batchSize = 50;
  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((uid) => sendPushToUser(uid, title, message, options))
    );
    for (const r of results) {
      totalSent += r.sent;
      totalFailed += r.failed;
    }
  }

  return { sent: totalSent, failed: totalFailed };
};

export default webpush;
