/* Generated constants are inserted by scripts/build-offline.mjs. */
const OFFLINE_RELEASE = JSON.parse(__OFFLINE_RELEASE_CONSTANTS__);

const CACHE_PREFIX = `${OFFLINE_RELEASE.cacheNamespace}-release-`;
const COMPLETE_MARKER_PATH = '__ddmg_complete__.json';
const COMPLETE_MARKER_URL = new URL(COMPLETE_MARKER_PATH, self.registration.scope).href;

function cacheInstanceName() {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${CACHE_PREFIX}${OFFLINE_RELEASE.bundleId}-${nonce}`;
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function resourceUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function responseBytes(response) {
  return response.arrayBuffer();
}

async function fetchVerifiedResource(entry) {
  const response = await fetch(resourceUrl(entry.path), { cache: 'reload', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Required offline resource failed: ${entry.path} (${response.status})`);
  const bytes = await responseBytes(response);
  if (bytes.byteLength !== entry.bytes) throw new Error(`Required offline resource size mismatch: ${entry.path}`);
  if (await sha256Hex(bytes) !== entry.sha256) throw new Error(`Required offline resource integrity mismatch: ${entry.path}`);
  return new Response(bytes, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

function verifyBundleShape(bundle) {
  const identityChecks = [
    bundle.bundle_id === OFFLINE_RELEASE.bundleId,
    bundle.companion_version === OFFLINE_RELEASE.companionVersion,
    bundle.data_version === OFFLINE_RELEASE.dataVersion,
    bundle.source_release === OFFLINE_RELEASE.sourceRelease,
    bundle.source_commit === OFFLINE_RELEASE.sourceCommit,
    bundle.trip_manifest_sha256 === OFFLINE_RELEASE.tripManifestSha256,
    bundle.bundle_content_sha256 === OFFLINE_RELEASE.bundleContentSha256,
    bundle.entry_count === OFFLINE_RELEASE.resources.length,
    Array.isArray(bundle.resources) && bundle.resources.length === OFFLINE_RELEASE.resources.length
  ];
  if (!identityChecks.every(Boolean)) throw new Error('Offline bundle identity mismatch');
  const actual = new Map(bundle.resources.map(resource => [resource.path, resource]));
  for (const expected of OFFLINE_RELEASE.resources) {
    const entry = actual.get(expected.path);
    if (!entry || entry.sha256 !== expected.sha256 || entry.bytes !== expected.bytes || entry.role !== expected.role || entry.required !== true) {
      throw new Error(`Offline bundle resource metadata mismatch: ${expected.path}`);
    }
  }
}

async function fetchBundleMetadata() {
  const response = await fetch(resourceUrl(OFFLINE_RELEASE.bundleManifestPath), { cache: 'reload', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`Offline bundle metadata failed (${response.status})`);
  const bytes = await responseBytes(response);
  if (await sha256Hex(bytes) !== OFFLINE_RELEASE.bundleManifestSha256) throw new Error('Offline bundle metadata integrity mismatch');
  const bundle = JSON.parse(new TextDecoder().decode(bytes));
  verifyBundleShape(bundle);
  return bundle;
}

async function readMarker(cache) {
  const response = await cache.match(COMPLETE_MARKER_URL);
  if (!response) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function verifyCache(cacheName, { hashAssets = true } = {}) {
  const cache = await caches.open(cacheName);
  const marker = await readMarker(cache);
  if (!marker || marker.complete !== true || marker.bundle_id !== OFFLINE_RELEASE.bundleId ||
      marker.bundle_manifest_sha256 !== OFFLINE_RELEASE.bundleManifestSha256 ||
      marker.bundle_content_sha256 !== OFFLINE_RELEASE.bundleContentSha256) {
    throw new Error('Complete release marker is missing or has the wrong identity');
  }
  verifyBundleShape(marker.offline_bundle);
  const keys = await cache.keys();
  const expectedUrls = new Set(OFFLINE_RELEASE.resources.map(entry => resourceUrl(entry.path)));
  const assetKeys = keys.map(request => request.url).filter(url => url !== COMPLETE_MARKER_URL);
  if (assetKeys.length !== OFFLINE_RELEASE.resources.length || assetKeys.some(url => !expectedUrls.has(url))) {
    throw new Error('Offline cache resource count or membership mismatch');
  }

  let totalBytes = 0;
  for (const entry of OFFLINE_RELEASE.resources) {
    const response = await cache.match(resourceUrl(entry.path));
    if (!response) throw new Error(`Offline cache is missing ${entry.path}`);
    if (hashAssets) {
      const bytes = await responseBytes(response);
      totalBytes += bytes.byteLength;
      if (bytes.byteLength !== entry.bytes || await sha256Hex(bytes) !== entry.sha256) {
        throw new Error(`Offline cache integrity failed for ${entry.path}`);
      }
    } else {
      totalBytes += entry.bytes;
    }
  }

  const canonicalResponse = await cache.match(resourceUrl('data/trip-manifest.json'));
  const canonical = await canonicalResponse.clone().json();
  const phoneCount = canonical.public_emergency_contacts?.flatMap(contact => contact.phone_numbers || []).length || 0;
  if (canonical.data_version !== OFFLINE_RELEASE.dataVersion ||
      canonical.metadata?.source_release !== OFFLINE_RELEASE.sourceRelease ||
      canonical.metadata?.source_commit !== OFFLINE_RELEASE.sourceCommit ||
      phoneCount !== 6) {
    throw new Error('Canonical manifest identity or emergency-contact count mismatch');
  }
  const canonicalBytes = await responseBytes(canonicalResponse);
  if (await sha256Hex(canonicalBytes) !== OFFLINE_RELEASE.tripManifestSha256) throw new Error('Canonical manifest SHA-256 mismatch');

  const release = await (await cache.match(resourceUrl('release.json'))).json();
  if (release.bundle_id !== OFFLINE_RELEASE.bundleId ||
      release.data_version !== OFFLINE_RELEASE.dataVersion ||
      release.manifest_sha256 !== OFFLINE_RELEASE.tripManifestSha256 ||
      release.offline_bundle_content_sha256 !== OFFLINE_RELEASE.bundleContentSha256) {
    throw new Error('Cached release metadata does not match the active bundle');
  }

  return {
    complete: true,
    bundleId: OFFLINE_RELEASE.bundleId,
    cacheName,
    entryCount: OFFLINE_RELEASE.resources.length,
    totalBytes,
    pdfsPresent: ['generated/field-guide.pdf', 'generated/pocket-card.pdf'].every(path => expectedUrls.has(resourceUrl(path))),
    canonicalManifestPresent: true,
    emergencyPhoneCount: phoneCount,
    identity: {
      dataVersion: OFFLINE_RELEASE.dataVersion,
      sourceRelease: OFFLINE_RELEASE.sourceRelease,
      sourceCommit: OFFLINE_RELEASE.sourceCommit,
      manifestSha256: OFFLINE_RELEASE.tripManifestSha256
    },
    installedAt: marker.installed_at
  };
}

async function completedCaches() {
  const names = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX));
  const records = [];
  for (const name of names) {
    const marker = await readMarker(await caches.open(name));
    if (marker?.complete === true && typeof marker.bundle_id === 'string' && typeof marker.installed_at === 'string') {
      records.push({ name, marker });
    }
  }
  return records.sort((left, right) => right.marker.installed_at.localeCompare(left.marker.installed_at));
}

async function activeCacheName() {
  const record = (await completedCaches()).find(item => item.marker.bundle_id === OFFLINE_RELEASE.bundleId);
  return record?.name || '';
}

async function buildCandidate(reason) {
  const cacheName = cacheInstanceName();
  const cache = await caches.open(cacheName);
  try {
    const bundle = await fetchBundleMetadata();
    for (const entry of OFFLINE_RELEASE.resources) {
      await cache.put(resourceUrl(entry.path), await fetchVerifiedResource(entry));
    }
    const temporaryMarker = {
      complete: true,
      bundle_id: OFFLINE_RELEASE.bundleId,
      bundle_manifest_sha256: OFFLINE_RELEASE.bundleManifestSha256,
      bundle_content_sha256: OFFLINE_RELEASE.bundleContentSha256,
      installed_at: new Date().toISOString(),
      reason,
      offline_bundle: bundle
    };
    await cache.put(COMPLETE_MARKER_URL, new Response(JSON.stringify(temporaryMarker), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    }));
    await verifyCache(cacheName);
    return cacheName;
  } catch (error) {
    await caches.delete(cacheName);
    throw error;
  }
}

async function cleanupCaches() {
  const allNames = await caches.keys();
  const companionNames = allNames.filter(name => name.startsWith(CACHE_PREFIX));
  const complete = await completedCaches();
  const current = complete.find(record => record.marker.bundle_id === OFFLINE_RELEASE.bundleId);
  const previous = complete.find(record => record.marker.bundle_id !== OFFLINE_RELEASE.bundleId);
  const keep = new Set([current?.name, previous?.name].filter(Boolean).slice(0, OFFLINE_RELEASE.retentionCount));
  await Promise.all(companionNames.filter(name => !keep.has(name)).map(name => caches.delete(name)));
}

async function verifyActiveCache() {
  const cacheName = await activeCacheName();
  if (!cacheName) throw new Error('No complete cache exists for the active release');
  return verifyCache(cacheName);
}

function incompleteResult(error) {
  return {
    complete: false,
    bundleId: OFFLINE_RELEASE.bundleId,
    error: error instanceof Error ? error.message : String(error),
    recovery: 'Reconnect to the internet and retry Companion update/install.'
  };
}

async function sendResult(event, operation) {
  const port = event.ports?.[0];
  if (!port) return;
  try {
    port.postMessage(await operation());
  } catch (error) {
    port.postMessage(incompleteResult(error));
  }
}

self.addEventListener('install', event => {
  event.waitUntil(buildCandidate('service-worker-install'));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await verifyActiveCache();
    await cleanupCaches();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;
  const relativePath = decodeURIComponent(requestUrl.pathname.slice(scopeUrl.pathname.length)) || 'index.html';
  const requestedPath = event.request.mode === 'navigate' ? 'index.html' : relativePath;
  if (!OFFLINE_RELEASE.resources.some(entry => entry.path === requestedPath)) return;

  event.respondWith((async () => {
    const cacheName = await activeCacheName();
    if (!cacheName) return new Response('Offline resources incomplete', { status: 503 });
    const response = await (await caches.open(cacheName)).match(resourceUrl(requestedPath));
    return response || new Response('Offline resource missing', { status: 503 });
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'VERIFY_OFFLINE_BUNDLE') {
    event.waitUntil(sendResult(event, verifyActiveCache));
  }
  if (event.data?.type === 'REPAIR_OFFLINE_COPY') {
    event.waitUntil(sendResult(event, async () => {
      const cacheName = await buildCandidate('user-requested-repair');
      await cleanupCaches();
      return verifyCache(cacheName);
    }));
  }
  if (event.data?.type === 'GET_OFFLINE_RELEASE') {
    event.waitUntil(sendResult(event, async () => ({
      complete: true,
      bundleId: OFFLINE_RELEASE.bundleId,
      bundleManifestSha256: OFFLINE_RELEASE.bundleManifestSha256
    })));
  }
  if (event.data?.type === 'ACTIVATE_VERIFIED_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
});
