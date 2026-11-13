/* LifeLoop service worker
 * - Share target: receives screenshots / voice notes / text shared from other apps (Android),
 *   keeps them on the device only until the /share screen reads them, then they are deleted.
 * - Push: shows reminder notifications and opens the right case when tapped.
 * - Offline: shows a friendly page when there is no connection. User data is never cached.
 */
const VERSION = 'v2';
const SHELL_CACHE = `lifeloop-shell-${VERSION}`;
const SHARE_CACHE = 'lifeloop-share';
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, '/icons/icon-192.png', '/icons/badge-96.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('lifeloop-shell-') && key !== SHELL_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(event.request));
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
  }
  // Everything else (API calls, assets) goes to the network as usual.
});

async function receiveShare(request) {
  const go = (path) => Response.redirect(new URL(path, self.location.origin).href, 303);
  try {
    const form = await request.formData();
    const cache = await caches.open(SHARE_CACHE);
    for (const old of await cache.keys()) await cache.delete(old);

    const str = (v) => (typeof v === 'string' ? v.slice(0, 8000) : '');
    const meta = { title: str(form.get('title')), text: str(form.get('text')), url: str(form.get('url')), receivedAt: Date.now(), file: null };
    const file = form.getAll('file').find((f) => f && typeof f === 'object' && f.size > 0);
    if (file) {
      if (file.size > 25 * 1024 * 1024) return go('/share?error=too-large');
      await cache.put('/__share/file', new Response(file, { headers: { 'content-type': file.type || 'application/octet-stream' } }));
      meta.file = { name: file.name || 'shared', type: file.type || '', size: file.size };
    }
    await cache.put('/__share/meta', new Response(JSON.stringify(meta), { headers: { 'content-type': 'application/json' } }));
    return go('/share');
  } catch (e) {
    return go('/share?error=read');
  }
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'LifeLoop', body: event.data ? event.data.text() : '' };
  }
  const path = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/dashboard';
  event.waitUntil(
    self.registration.showNotification(data.title || 'LifeLoop', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || undefined,
      // With a tag, a newer reminder replaces the older one; renotify makes it pop up again instead of updating silently.
      renotify: Boolean(data.tag),
      vibrate: [100, 50, 100],
      data: { url: path },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          if ('navigate' in client) await client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});
