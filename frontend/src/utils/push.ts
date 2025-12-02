import api from './api';

const VAPID_PUBLIC_KEY = 'BB7DzC7jdgpf0PtthMK1CCHNPTuNa9Roecz5Ajx3hYLZ3rTRl8NtlxlkfJ5zDSTauJY7rnZemuYQLo4yevp5qns';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Check if already subscribed
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      console.log('Already subscribed to push notifications');
      return true;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    await api.post('/communication/push/subscribe', subscription);
    console.log('Subscribed to push notifications');
    return true;
  } catch (error) {
    console.error('Failed to subscribe to push notifications', error);
    return false;
  }
}
