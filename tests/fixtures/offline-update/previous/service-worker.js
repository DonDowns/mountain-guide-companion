const CACHE_NAME = 'ddmg-companion-release-fixture-phase4-old-complete';
const MARKER_URL = new URL('__ddmg_complete__.json', self.registration.scope).href;
const RESOURCES = ['index.html', 'fixture-app.js'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const path of RESOURCES) {
      const response = await fetch(new URL(path, self.registration.scope), { cache: 'reload' });
      if (!response.ok) throw new Error(`Previous fixture resource failed: ${path}`);
      await cache.put(new URL(path, self.registration.scope), response);
    }
    await cache.put(MARKER_URL, new Response(JSON.stringify({
      complete: true,
      bundle_id: 'fixture-phase4-old-complete',
      installed_at: '2026-08-07T00:00:00Z'
    }), { headers: { 'Content-Type': 'application/json' } }));
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  const path = event.request.mode === 'navigate' ? 'index.html' : url.pathname.split('/').pop();
  if (!RESOURCES.includes(path)) return;
  event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(new URL(path, self.registration.scope))));
});
