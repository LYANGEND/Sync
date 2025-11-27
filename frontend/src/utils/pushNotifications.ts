import api from './api';

// Check if push notifications are supported
export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Get current notification permission status
export function getNotificationPermission(): NotificationPermission {
  return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    throw new Error('Push notifications not supported');
  }
  return Notification.requestPermission();
}

// Get VAPID public key from server
async function getVapidPublicKey(): Promise<string | null> {
  try {
    const response = await api.get('/push/vapid-public-key');
    return response.data.publicKey;
  } catch {
    console.error('Failed to get VAPID public key');
    return null;
  }
}

// Convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Subscribe to push notifications
export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    throw new Error('Push notifications not supported');
  }

  const permission = await requestNotificationPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied');
  }

  const vapidPublicKey = await getVapidPublicKey();
  if (!vapidPublicKey) {
    throw new Error('Push notifications not configured on server');
  }

  const registration = await navigator.serviceWorker.ready;
  
  // Check for existing subscription
  let subscription = await registration.pushManager.getSubscription();
  
  if (!subscription) {
    // Create new subscription
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  // Send subscription to server
  await api.post('/push/subscribe', {
    subscription: subscription.toJSON(),
  });

  return true;
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    // Notify server
    await api.post('/push/unsubscribe', {
      endpoint: subscription.endpoint,
    });
    
    // Unsubscribe locally
    await subscription.unsubscribe();
  }

  return true;
}

// Check if user is subscribed to push
export async function isSubscribedToPush(): Promise<boolean> {
  if (!isPushSupported()) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}
