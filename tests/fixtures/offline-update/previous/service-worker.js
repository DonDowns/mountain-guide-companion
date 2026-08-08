const PREVIOUS_BUNDLE_ID = 'ddmg-companion-0-6-0-candidate-4-data-3cda95d4e6b1-b1';
const CACHE_NAME = `ddmg-companion-release-${PREVIOUS_BUNDLE_ID}-previous`;
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
      bundle_id: PREVIOUS_BUNDLE_ID,
      bundle_manifest_sha256: 'candidate-4-fixture-manifest-sha256',
      bundle_content_sha256: 'candidate-4-fixture-content-sha256',
      installed_at: '2026-08-07T00:00:00.000Z',
      offline_bundle: {
        schema_version: 1,
        bundle_id: PREVIOUS_BUNDLE_ID,
        companion_version: '0.6.0-candidate.4',
        data_version: '1.0.0',
        trip_manifest_sha256: '3cda95d4e6b1d5d7138dd2ca3320501d9b59076a0f9c9cfb3e67117ed5384758',
        entry_count: RESOURCES.length,
        resources: RESOURCES.map(path => ({ path, required: true }))
      }
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
