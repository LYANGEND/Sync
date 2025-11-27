// Push notification event handlers for service worker
// This file is imported by the main service worker

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const { title, body, icon, badge, tag, data, actions } = payload;

    const options = {
      body: body || '',
      icon: icon || '/pwa-192x192.svg',
      badge: badge || '/pwa-192x192.svg',
      tag: tag || 'sync-notification',
      data: data || {},
      actions: actions || [],
      vibrate: [100, 50, 100],
      requireInteraction: false,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (error) {
    console.error('Error showing push notification:', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const urlToOpen = data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (data.url) {
            client.navigate(urlToOpen);
          }
          return;
        }
      }
      // Open new window if none exists
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  // Track notification dismissals if needed
  console.log('Notification closed:', event.notification.tag);
});
