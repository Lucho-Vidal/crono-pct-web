// Service Worker para CRONO-WEB (PWA v1.1.0)
const CACHE_NAME = 'crono-pwa-v1.1.0';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/app.js',
  './js/supabase.js',
  './js/webauthn.js',
  './js/qrcode.min.js',
  './js/engine_turnos.js',
  './js/combobox.js',
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

// Mensajería con clientes (Purga de caché sensible)
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'CLEAR_AUTH_CACHE') {
    // Purgar cualquier caché que pudiera contener datos no estáticos
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        if (key.includes('data') || key.includes('auth')) {
          caches.delete(key);
        }
      });
    });
  }
});

// Intercepción de solicitudes de red
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Manejo de sonda de inspección Chrome DevTools
  if (url.pathname.includes('com.chrome.devtools.json')) {
    event.respondWith(
      new Response('{}', {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      })
    );
    return;
  }

  // Solicitudes a Supabase: NUNCA cachear en Service Worker (estricto directo a red)
  if (url.origin.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Solicitudes a CDNs externos (ej. Supabase JS ESM): Red primero con fallback a caché
  if (url.origin.includes('jsdelivr.net')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Activos propios (App Shell): Network-First con fallback a caché para aplicar cambios de seguridad de inmediato
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});
