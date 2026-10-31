/* eslint-env serviceworker */
/**
 * Service worker for Retro Squash.
 *
 * This file is a template: `tools/vite-plugin-sw.js` replaces __VERSION__
 * and __PRECACHE__ at build time with a content hash of the bundle and the
 * list of every file in dist/ (JS, CSS, icons, the glTF models), then writes
 * the result to dist/sw.js. In development no service worker is registered.
 *
 * Strategy
 *   install   precache everything (about 5 MB including the models), without
 *             taking over open pages: the page shows "update available" and
 *             posts SKIP_WAITING when the player agrees.
 *   fetch     same-origin GET only. Navigations are network-first with the
 *             cached index.html as the offline fallback; everything else is
 *             cache-first with a network fallback that is stashed in the
 *             cache. Cross-origin requests (the ranking backend) are left to
 *             the browser untouched, so the game never serves a stale
 *             leaderboard.
 *   activate  delete the caches of previous versions.
 */
const VERSION = '__VERSION__';
const CACHE = `retro-squash-${VERSION}`;
const PRECACHE = __PRECACHE__;

const scopeUrl = (p) => new URL(p, self.registration.scope).href;
const INDEX = scopeUrl('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // cache: 'reload' bypasses the HTTP cache so a new version really is fetched.
    await cache.addAll(PRECACHE.map((p) => new Request(scopeUrl(p), { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('retro-squash-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        const cached = await caches.match(INDEX);
        return cached || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok && (res.type === 'basic' || res.type === 'default')) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
