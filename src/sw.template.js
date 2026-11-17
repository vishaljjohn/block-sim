/* Test Simulator service worker. Generated at build time; do not edit dist/sw.js by hand. */
const CHANNEL = "__CHANNEL__";
const BASE = "__BASE__";
const BUILD_ID = "__BUILD_ID__";
const FILES = "__FILES__";
const PREFIX = 'blocksim-' + CHANNEL + '-';
const CACHE = PREFIX + BUILD_ID;

function inScope(url) {
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith(BASE)) return false;
  // The stable worker must never touch the beta channel.
  if (CHANNEL === 'stable' && url.pathname.startsWith(BASE + 'beta/')) return false;
  return true;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = FILES.map((f) => BASE + f);
      // Add in small batches so one slow file does not sink the whole install.
      for (let i = 0; i < urls.length; i += 20) {
        await cache.addAll(urls.slice(i, i + 20).map((u) => new Request(u, { cache: 'reload' })));
      }
      await cache.put(BASE, await cache.match(BASE + 'index.html').then((r) => r.clone()));
    })(),
  );
  // No skipWaiting here: an update is only applied when the user presses Refresh.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'GET_BUILD' && event.ports[0]) event.ports[0].postMessage({ buildId: BUILD_ID, channel: CHANNEL });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!inScope(url)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match(BASE + 'index.html') : undefined);
      if (hit) return hit;
      try {
        return await fetch(req);
      } catch (e) {
        if (req.mode === 'navigate') {
          const shell = await cache.match(BASE + 'index.html');
          if (shell) return shell;
        }
        throw e;
      }
    })(),
  );
});
