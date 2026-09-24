const CACHE_VERSION = '20260924-01';
const CACHE_NAME = `aifa-contratos-cache-${CACHE_VERSION}`;
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/sw.js',
  '/manifest.webmanifest?v=20241126',
  '/images/aifa-logo.png',
  '/images/aifa-icon-192.png?v=20241126',
  '/images/aifa-icon-256.png?v=20241126',
  '/images/aifa-icon-384.png?v=20241126',
  '/images/aifa-icon-512.png?v=20241126'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return null;
        })
      )
    ).then(() => self.clients.claim())
  );
});

// En desarrollo el service worker no cachea NADA.
//
// La estrategia de abajo es "primero la caché" para todo lo que no sea
// navegación. Con Vite eso significa que el primer /App.tsx que se descargue se
// queda congelado en la caché y ahí sigue por más que se edite el archivo: la
// pantalla no cambia, el editor sí, y se pierde media tarde buscando un fallo
// que ya estaba arreglado. En producción la caché sí vale la pena, así que la
// excepción se limita a localhost.
const ES_DESARROLLO = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (ES_DESARROLLO) return; // sin respondWith: pasa directo a la red

  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request)
        .then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => cachedResponse);
    })
  );
});
