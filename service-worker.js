/**
 * gtgWeb — Service Worker
 *
 * Stratégie : Network First avec fallback cache.
 * Les fichiers statiques sont mis en cache à l'installation.
 * Les requêtes CalDAV ne sont jamais mises en cache.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

const CACHE_NAME    = 'gtgweb-v1';
const CACHE_OFFLINE = 'gtgweb-offline-v1';

// Fichiers statiques mis en cache à l'installation
const STATIC_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/js/storage.js',
  '/js/parser.js',
  '/js/builder.js',
  '/js/tree.js',
  '/js/editor.js',
  '/js/caldav.js',
  '/js/ui.js',
  '/js/app.js',
];

// ── Installation ──────────────────────────────────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
      .catch(e => console.warn('gtgWeb SW : erreur cache install', e))
  );
});

// ── Activation ────────────────────────────────────────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== CACHE_OFFLINE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Interception des requêtes ─────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ne jamais intercepter les requêtes CalDAV (proxy.php)
  if (url.pathname.includes('proxy.php') ||
      url.pathname.includes('gtg-config.php')) {
    return;
  }

  // Requêtes non-GET → pas de cache
  if (event.request.method !== 'GET') return;

  // Stratégie Network First → fallback cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Mettre en cache la réponse fraîche
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        // Réseau indisponible → cache
        caches.match(event.request)
          .then(cached => cached || new Response(
            '<h1>gtgWeb</h1><p>Hors-ligne. Reconnectez-vous pour synchroniser.</p>',
            { headers: { 'Content-Type': 'text/html' } }
          ))
      )
  );
});
