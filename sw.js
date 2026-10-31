// Service Worker para CRONO-WEB (PWA v1.0.0)
const CACHE_NAME = 'crono-pwa-v1.0.0';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/supabase.js',
  './js/engine_turnos.js',
  './js/views/sabana.js',
  './js/views/novedades.js',
  './js/views/personal.js',
  './js/views/licencias.js',
  './icons/crono_icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Instalación: Precargar App Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activación: Limpieza de cachés anteriores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Intercepción de solicitudes de red
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solicitudes a Supabase o CDN externo:
  if (url.origin.includes('supabase.co') || url.origin.includes('jsdelivr.net')) {
    // Intentar red primero; si falla, responder con error controlado o dejar que el cliente use su cache local
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Activos propios (App Shell): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
