import api from './api';

const VAPID_PUBLIC_KEY = 'BE2-OUTXmwT7zc2m2efNQCecKxbJcl5-cFJ4qDnHaSArZtYllkYnn65VkGA2AaXgbCR6m9gUGIFkOjdBhTsWtJw';

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

const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window;

const saveSubscription = async (subscription: PushSubscription) => {
  await api.post('/communication/push/subscribe', subscription.toJSON());
};

/**
 * Rebind an existing browser endpoint to the current authenticated identity
 * without prompting the user for notification permission.
 */
export async function synchronizeExistingPushSubscription() {
  if (!pushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return false;

    await saveSubscription(subscription);
    return true;
  } catch (error) {
    console.error('Failed to synchronize push subscription', error);
    return false;
  }
}

export async function subscribeToPushNotifications() {
  if (!pushSupported()) {
    console.warn('Push notifications not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Always synchronize an existing endpoint: Push API subscriptions belong
    // to the browser/service worker, not to the last authenticated user.
    await saveSubscription(subscription);
    console.log('Subscribed to push notifications');
    return true;
  } catch (error) {
    console.error('Failed to subscribe to push notifications', error);
    return false;
  }
}

/**
 * Detach only the current authenticated owner, then invalidate the browser
 * endpoint. Backend release is best-effort so an offline user can still log
 * out; provider 404/410 cleanup removes any remaining stale record later.
 */
export async function unsubscribeFromPushNotifications(detachBackend = true) {
  if (!pushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;

    let shouldUnsubscribeBrowser = !detachBackend;
    if (detachBackend) {
      try {
        const response = await api.delete<{ released: boolean }>('/communication/push/subscribe', {
          data: { endpoint: subscription.endpoint },
          timeout: 3_000,
        });
        // A false result can mean another tenant/user claimed this shared
        // endpoint. A stale logout must not invalidate that newer binding.
        shouldUnsubscribeBrowser = response.data.released !== false;
      } catch (error) {
        console.warn('Could not detach push subscription from the server', error);
        shouldUnsubscribeBrowser = true;
      }
    }

    if (shouldUnsubscribeBrowser) {
      await subscription.unsubscribe();
    }
  } catch (error) {
    console.warn('Could not unsubscribe browser push notifications', error);
  }
}
