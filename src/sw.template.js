/* Test Simulator service worker. Generated at build time; do not edit dist/sw.js by hand. */
const BASE = "__BASE__";
const CHANNEL = "__CHANNEL__";
const BUILD_ID = "__BUILD_ID__";
const FILES = "__FILES__";
// cache names kept from the first version, so old caches are cleaned up on update
const PREFIX = 'blocksim-' + CHANNEL + '-';
const CACHE = PREFIX + BUILD_ID;

function inScope(url) {
  if (url.origin !== self.location.origin) return false;
  if (!url.pathname.startsWith(BASE)) return false;
  // the live site's worker never touches the beta under /beta/
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
  // the new version takes over at once; it never reloads a page (an open block keeps running on what it loaded)
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // keep this version and the one before it: a page still open from before can load the files it needs
      const mine = (await caches.keys()).filter((n) => n.startsWith(PREFIX));
      const keep = new Set([CACHE, ...mine.filter((n) => n !== CACHE).slice(-1)]);
      await Promise.all(mine.filter((n) => !keep.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  // pages from before this change still show an "Update available" bar: its Refresh button reloads the page
  if (event.data && event.data.type === 'SKIP_WAITING' && event.source && 'navigate' in event.source) event.source.navigate(event.source.url).catch(() => {});
  if (event.data && event.data.type === 'GET_BUILD' && event.ports[0]) event.ports[0].postMessage({ buildId: BUILD_ID });
});

/** The page itself: always the newest from the internet when online, the saved copy when offline or very slow. */
async function page(req) {
  const cache = await caches.open(CACHE);
  try {
    const net = await Promise.race([fetch(req, { cache: 'no-cache' }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 5000))]);
    if (net && net.ok) return net;
    throw new Error('bad response');
  } catch (e) {
    const shell = (await cache.match(BASE + 'index.html')) || (await caches.match(BASE + 'index.html'));
    if (shell) return shell;
    throw e;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!inScope(url)) return;
  if (req.mode === 'navigate') return event.respondWith(page(req));
  event.respondWith(
    (async () => {
      // files have content hashes in their names, so a saved copy is always right
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && url.origin === self.location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    })(),
  );
});
