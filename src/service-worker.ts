import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare let self: ServiceWorkerGlobalScope;

// Cleanup alter Caches
cleanupOutdatedCaches();

// Precache manifest – wird durch Vite automatisch ersetzt
precacheAndRoute(self.__WB_MANIFEST);

// Supabase Cache – 24h gültig, NetworkFirst
registerRoute(
  ({ url, request }) => url.hostname.endsWith('.supabase.co') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'supabase-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 24 * 60 * 60 // 24 Stunden
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// Unsplash Bilder – 1 Woche gültig, CacheFirst
registerRoute(
  ({ url }) => url.hostname === 'images.unsplash.com',
  new CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 7 * 24 * 60 * 60 // 1 Woche
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200]
      })
    ]
  })
);

// Sofort aktivieren (optional)
self.skipWaiting();
self.clientsClaim();
