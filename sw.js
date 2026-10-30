/* PGL Linlithgowshire phone app: the service worker. src/lib/pwa-integration.mjs writes it to dist/sw.js after each
   build, with the constants in the first lines filled in (a new build means a new version, so phones update).

   - Pages: network first, so a new build is seen at once; after 6 seconds without an answer (a weak signal) the saved
     copy is shown; with no network at all, the saved copy or the offline page.
   - Hashed files (/_astro/): cache first; their names change whenever their content does.
   - Crest and icons: from the cache, refreshed in the background.
   - Everything else (calendar feeds, meetings.json, the manifest) and other sites' pictures: straight to the network.
   - Caches are named by version and old ones are deleted when a new version takes over, so nothing stale is left. */

const VERSION = "b85b64c2d4a7";
const BASE = "/pgl-linlithgowshire-demo/";
const OFFLINE = "/pgl-linlithgowshire-demo/offline/";
const PRECACHE_PAGES = ["/pgl-linlithgowshire-demo/","/pgl-linlithgowshire-demo/whatson/","/pgl-linlithgowshire-demo/lodges/","/pgl-linlithgowshire-demo/app/","/pgl-linlithgowshire-demo/13/","/pgl-linlithgowshire-demo/17/","/pgl-linlithgowshire-demo/85/","/pgl-linlithgowshire-demo/272/","/pgl-linlithgowshire-demo/374/","/pgl-linlithgowshire-demo/409/","/pgl-linlithgowshire-demo/548/","/pgl-linlithgowshire-demo/590/","/pgl-linlithgowshire-demo/636/","/pgl-linlithgowshire-demo/827/","/pgl-linlithgowshire-demo/927/","/pgl-linlithgowshire-demo/1145/","/pgl-linlithgowshire-demo/1186/","/pgl-linlithgowshire-demo/1232/","/pgl-linlithgowshire-demo/1305/","/pgl-linlithgowshire-demo/1587/","/pgl-linlithgowshire-demo/1601/","/pgl-linlithgowshire-demo/1614/","/pgl-linlithgowshire-demo/1658/"];
const PRECACHE_ASSETS = ["/pgl-linlithgowshire-demo/icons/icon-192.png","/pgl-linlithgowshire-demo/icons/badge-96.png","/pgl-linlithgowshire-demo/_astro/AppBar.astro_astro_type_script_index_0_lang.CrHMbSZQ.js","/pgl-linlithgowshire-demo/_astro/_lodge_.astro_astro_type_script_index_0_lang.ClvH7oAL.js","/pgl-linlithgowshire-demo/_astro/app-platform.DcUShYyq.js","/pgl-linlithgowshire-demo/_astro/app.astro_astro_type_script_index_0_lang.DF53gzKr.js","/pgl-linlithgowshire-demo/_astro/fonts/03f5467bfe589012.woff2","/pgl-linlithgowshire-demo/_astro/fonts/0c620e894fb20522.woff2","/pgl-linlithgowshire-demo/_astro/fonts/1492e67ee33e5ffb.woff2","/pgl-linlithgowshire-demo/_astro/fonts/294fbab2f0541b57.woff2","/pgl-linlithgowshire-demo/_astro/fonts/55807add4d353038.woff2","/pgl-linlithgowshire-demo/_astro/index.astro_astro_type_script_index_0_lang.BNBfMbQl.js","/pgl-linlithgowshire-demo/_astro/index.astro_astro_type_script_index_0_lang.BXBH-H_V.js","/pgl-linlithgowshire-demo/_astro/render.CegQdRDx.js","/pgl-linlithgowshire-demo/_astro/whatson.0iK6bx11.js","/pgl-linlithgowshire-demo/brand/pgl-crest-192.webp","/pgl-linlithgowshire-demo/brand/pgl-crest-384.webp","/pgl-linlithgowshire-demo/brand/pgl-crest-96.png","/pgl-linlithgowshire-demo/brand/pgl-crest-96.webp","/pgl-linlithgowshire-demo/icons/apple-touch-icon.png"];
const ICON = "/pgl-linlithgowshire-demo/icons/icon-192.png";
const BADGE = "/pgl-linlithgowshire-demo/icons/badge-96.png";
const PUSH = {"workerUrl":"","vapidPublicKey":""};

// Prefixed with the site's name: other sites on the same github.io origin may keep their own caches.
const PREFIX = 'pgl-linl-';
const PAGES = `${PREFIX}pages-${VERSION}`;
const ASSETS = `${PREFIX}assets-${VERSION}`;
const STATIC = `${PREFIX}static-${VERSION}`;
const SETTINGS = `${PREFIX}settings`;
const KEEP = [PAGES, ASSETS, STATIC, SETTINGS];
const NETWORK_WAIT_MS = 6000;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const pages = await caches.open(PAGES);
    // The offline page must be saved; the rest is best effort, so one missing page never blocks an update.
    await pages.add(new Request(OFFLINE, { cache: 'reload' }));
    await Promise.allSettled(PRECACHE_PAGES.map((u) => pages.add(new Request(u, { cache: 'reload' }))));
    const assets = await caches.open(ASSETS);
    await Promise.allSettled(PRECACHE_ASSETS.map((u) => assets.add(new Request(u, { cache: 'reload' }))));
    // Pages always come from the network first, so the new version can take over straight away.
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter((n) => n.startsWith(PREFIX) && !KEEP.includes(n));
    // Old pages go with their old scripts: a page kept from an older build could ask for scripts that are gone.
    await Promise.all(names.map((n) => caches.delete(n)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (req.mode === 'navigate') return event.respondWith(page(event));
  if (url.pathname.startsWith(`${BASE}_astro/`)) return event.respondWith(cacheFirst(req, ASSETS));
  if (/^(brand|icons)\//.test(url.pathname.slice(BASE.length))) return event.respondWith(staleWhileRevalidate(event, STATIC));
});

/** The page without its query (What's On keeps its filters there) and with its trailing slash, as it is saved. */
function pageKey(url) {
  const u = new URL(url);
  u.search = '';
  u.hash = '';
  if (!u.pathname.endsWith('/') && !/\.[a-z0-9]+$/i.test(u.pathname)) u.pathname += '/';
  return u.href;
}

/** Saving never breaks a response: a full or evicted cache (iPhones are strict) just saves nothing. */
function put(cache, key, res) {
  return res ? cache.put(key, res).catch(() => {}) : Promise.resolve();
}

async function page(event) {
  const req = event.request;
  const cache = await caches.open(PAGES);
  const network = (async () => {
    const res = (await event.preloadResponse) || (await fetch(req));
    // Only whole, same-site pages are saved (not redirects or the 404 page).
    if (res.status === 200 && res.type === 'basic' && !res.redirected) await put(cache, pageKey(req.url), res.clone());
    return res;
  })();
  event.waitUntil(network.then(() => {}, () => {}));
  try {
    return await Promise.race([network, new Promise((_, reject) => setTimeout(reject, NETWORK_WAIT_MS))]);
  } catch {
    const saved = await cache.match(pageKey(req.url));
    if (saved) return saved;
    // Not saved: give the network a little longer (a slow first visit), then the offline page if it is stalled.
    try {
      return await Promise.race([network, new Promise((_, reject) => setTimeout(reject, NETWORK_WAIT_MS * 1.5))]);
    } catch {
      return (await cache.match(OFFLINE)) || Response.error();
    }
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200 && res.type === 'basic') await put(cache, req, res.clone());
  return res;
}

async function staleWhileRevalidate(event, name) {
  const cache = await caches.open(name);
  const hit = await caches.match(event.request);
  const fresh = fetch(event.request).then(async (res) => {
    if (res.status === 200 && res.type === 'basic') await put(cache, event.request, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(fresh.then(() => {}, () => {}));
    return hit;
  }
  return fresh;
}

/* ---------- Notifications ---------- */

/** Only web addresses open from a notification; anything else opens the app's home page. */
function safeUrl(raw) {
  try {
    const u = new URL(String(raw || ''), self.registration.scope);
    if (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === self.location.hostname)) return u.href;
  } catch {}
  return self.registration.scope;
}

self.addEventListener('push', (event) => {
  // The Worker sends the Declarative Web Push format. Safari 18.4 and later show those by themselves; every other
  // browser (and older Safari) hands them to this handler, which must always show a notification.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { notification: { body: event.data ? event.data.text() : '' } };
  }
  // Safari 18.4+ shows declarative messages itself and wakes this worker only for "mutable" ones, which the Worker
  // never sends. So reaching here always means this handler must show it: Chrome fills in event.notification too, but
  // shows only its generic "updated in the background" notice unless the handler shows one (seen in push-e2e.mjs).
  const n = (data && typeof data.notification === 'object' && data.notification) || data || {};
  const title = String(n.title || 'Provincial Grand Lodge of Linlithgowshire').slice(0, 120);
  const options = {
    body: String(n.body || '').slice(0, 400),
    icon: ICON,
    badge: BADGE,
    lang: 'en-GB',
    dir: 'ltr',
    data: { url: safeUrl(n.navigate || n.url) },
  };
  if (n.tag) options.tag = String(n.tag).slice(0, 64);
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeUrl(event.notification.data && event.notification.data.url);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = windows.find((c) => c.url === url);
    if (same) return same.focus();
    const ours = windows.find((c) => c.url.startsWith(self.registration.scope));
    if (ours && new URL(url).origin === self.location.origin) {
      try {
        await ours.focus();
        return await ours.navigate(url);
      } catch {}
    }
    return self.clients.openWindow(url);
  })());
});

// The phone's push service can replace a subscription. Re-register it with the same choices, which the page saved in
// the pgl-settings cache when reminders were turned on (no names: only the lodge choices).
self.addEventListener('pushsubscriptionchange', (event) => {
  if (!PUSH.workerUrl || !PUSH.vapidPublicKey) return;
  event.waitUntil((async () => {
    const saved = await (await caches.open(SETTINGS)).match(`${BASE}settings.json`);
    if (!saved) return;
    const { tags } = await saved.json();
    const key = Uint8Array.from(atob(PUSH.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    const sub = event.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
    const old = event.oldSubscription ? event.oldSubscription.toJSON() : null;
    await fetch(`${PUSH.workerUrl}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), tags, replaces: old && old.keys ? { endpoint: old.endpoint, auth: old.keys.auth } : undefined }),
    });
  })());
});
