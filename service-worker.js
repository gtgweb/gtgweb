/**
 * gtgWeb — Service Worker
 *
 * Stratégie : Network First avec fallback cache, durci contre le
 * « cache empoisonné » : on ne met JAMAIS en cache une réponse d'erreur ou du
 * HTML servi sous une URL d'asset (sinon un script/style reste cassé après un
 * redéploiement). Les requêtes CalDAV (proxy.php) ne sont jamais mises en cache.
 *
 * @license GPL-3.0
 * @link    https://github.com/gtgweb/gtgweb
 */

const CACHE_NAME = 'gtgweb-v2';

// Fichiers statiques mis en cache à l'installation (ordre = index.html).
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
  '/js/richfield.js',
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
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// ── Politique de mise en cache ─────────────────────────────────────────────────

// N'accepte de cacher qu'une réponse d'asset SAINE : GET, statut 200, type
// « basic » (même origine, pas opaque/erreur), et jamais du HTML servi sous une
// URL de script/style/asset (un 404 rendu en HTML empoisonnerait durablement le
// cache et casserait l'app hors-ligne ou après un redéploiement FTP).
function _isCacheable(request, response) {
  if (request.method !== 'GET') return false;
  if (!response || response.status !== 200 || response.type !== 'basic') return false;
  const path = new URL(request.url).pathname;
  const contentType = response.headers.get('Content-Type') || '';
  const isAssetUrl = /\.(js|css|json|png|svg|ico|woff2?)$/i.test(path);
  if (isAssetUrl && contentType.includes('text/html')) return false;
  return true;
}

// ── Interception des requêtes ──────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ne jamais intercepter les requêtes CalDAV (proxy.php) ni la config.
  if (url.pathname.includes('proxy.php') ||
      url.pathname.includes('gtg-config.php')) {
    return;
  }

  // Seules les requêtes GET same-origin passent par le cache.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Network First → fallback cache.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (_isCacheable(event.request, response)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() =>
        // Réseau indisponible → cache, avec un dernier recours lisible.
        caches.match(event.request)
          .then(cached => cached || new Response(
            '<h1>gtgWeb</h1><p>Hors-ligne. Reconnectez-vous pour synchroniser.</p>',
            { headers: { 'Content-Type': 'text/html' } }
          ))
      )
  );
});
