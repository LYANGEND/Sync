import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { StaleWhileRevalidate, NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { BackgroundSyncPlugin } from 'workbox-background-sync'

// Precache static assets (injected by Vite PWA plugin)
precacheAndRoute(self.__WB_MANIFEST)

// Clean old caches
cleanupOutdatedCaches()

// Skip waiting and claim clients immediately
self.skipWaiting()
clientsClaim()

// ============================================
// BACKGROUND SYNC - Queue failed requests
// ============================================
const bgSyncPlugin = new BackgroundSyncPlugin('failedRequests', {
  maxRetentionTime: 24 * 60, // Retry for up to 24 hours (in minutes)
  onSync: async ({ queue }) => {
    let entry
    while ((entry = await queue.shiftRequest())) {
      try {
        await fetch(entry.request)
        console.log('Background Sync: Replayed request', entry.request.url)

        // Notify user of successful sync
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'SYNC_SUCCESS',
              url: entry.request.url,
            })
          })
        })
      } catch (error) {
        console.error('Background Sync: Replay failed', error)
        await queue.unshiftRequest(entry)
        throw error
      }
    }
  },
})

// ============================================
// RUNTIME CACHING STRATEGIES
// ============================================

// 1. API GET Requests - NetworkFirst with fallback to cache
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24, // 24 hours
        purgeOnQuotaError: true,
      }),
    ],
  })
)

// 2. API POST/PUT/DELETE - NetworkOnly with Background Sync fallback
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method),
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'POST'
)

registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method),
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'PUT'
)

// 3. Images - CacheFirst (images rarely change)
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  })
)

// 4. Google Fonts - CacheFirst
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  })
)

// 5. Static Assets (JS, CSS) - StaleWhileRevalidate
registerRoute(
  ({ request }) =>
    request.destination === 'script' ||
    request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
    plugins: [
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
)

// ============================================
// NAVIGATION (SPA Fallback)
// ============================================
let allowlist
if (import.meta.env.DEV) {
  allowlist = [/^\/$/]
}

registerRoute(
  new NavigationRoute(
    createHandlerBoundToURL('index.html'),
    { allowlist }
  )
)

// ============================================
// OFFLINE FALLBACK
// ============================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('offline-cache').then((cache) => {
      return cache.addAll([
        '/offline.html',
        '/pwa-192x192.png',
      ])
    })
  )
})

// Serve offline page when network fails for navigation requests
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/offline.html')
      })
    )
  }
})

// ============================================
// PERIODIC BACKGROUND SYNC
// ============================================
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-student-data') {
    event.waitUntil(syncStudentData())
  }
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications())
  }
})

async function syncStudentData() {
  try {
    // Refresh critical data in cache
    const cache = await caches.open('api-cache')

    // Pre-fetch dashboard data
    const dashboardResponse = await fetch('/api/dashboard')
    if (dashboardResponse.ok) {
      await cache.put('/api/dashboard', dashboardResponse)
    }

    console.log('Periodic Sync: Student data refreshed')

    // Notify app of fresh data
    const clients = await self.clients.matchAll()
    clients.forEach((client) => {
      client.postMessage({ type: 'DATA_REFRESHED' })
    })
  } catch (error) {
    console.error('Periodic Sync failed:', error)
  }
}

async function syncNotifications() {
  try {
    const response = await fetch('/api/notifications/unread-count')
    if (response.ok) {
      const data = await response.json()

      // Update badge count
      if ('setAppBadge' in navigator) {
        if (data.count > 0) {
          navigator.setAppBadge(data.count)
        } else {
          navigator.clearAppBadge()
        }
      }
    }
  } catch (error) {
    console.error('Notification sync failed:', error)
  }
}

// ============================================
// BADGE API - Update app icon badge
// ============================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }

  // Handle badge updates from the app
  if (event.data && event.data.type === 'SET_BADGE') {
    const count = event.data.count
    if ('setAppBadge' in navigator) {
      if (count > 0) {
        navigator.setAppBadge(count)
      } else {
        navigator.clearAppBadge()
      }
    }
  }

  // Clear badge
  if (event.data && event.data.type === 'CLEAR_BADGE') {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge()
    }
  }
})

// ============================================
// PUSH NOTIFICATIONS
// ============================================
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'Sync', body: 'New notification' }

  const options = {
    body: data.body,
    icon: data.icon || '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    vibrate: [100, 50, 100],
    data: data.data,
    actions: data.actions || [],
    tag: data.tag || 'default',
    renotify: true,
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, options),
      // Update badge when push notification arrives
      (async () => {
        if ('setAppBadge' in navigator) {
          try {
            const response = await fetch('/api/notifications/unread-count')
            if (response.ok) {
              const countData = await response.json()
              navigator.setAppBadge(countData.count || 1)
            }
          } catch (e) {
            // Fallback: increment by 1
            navigator.setAppBadge()
          }
        }
      })()
    ])
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const urlToOpen = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus()
        }
      }
      return self.clients.openWindow(urlToOpen)
    })
  )
})
