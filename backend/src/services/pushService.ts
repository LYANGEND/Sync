import webpush from 'web-push';

const publicVapidKey = process.env.VAPID_PUBLIC_KEY!;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY!;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

if (!publicVapidKey || !privateVapidKey) {
  console.warn('VAPID keys not found. Push notifications will not work.');
} else {
  webpush.setVapidDetails(vapidEmail, publicVapidKey, privateVapidKey);
}

export const sendPushNotification = async (subscription: any, payload: any) => {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.error('Error sending push notification:', error);
    return false;
  }
};

export default webpush;
