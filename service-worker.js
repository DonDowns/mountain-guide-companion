/* Generated constants are inserted by scripts/build-offline.mjs. */
const OFFLINE_RELEASE = JSON.parse("{\"cacheNamespace\":\"ddmg-companion\",\"bundleId\":\"ddmg-companion-0-6-0-candidate-10-data-3cda95d4e6b1-b1\",\"companionVersion\":\"0.6.0-candidate.10\",\"dataVersion\":\"1.0.0\",\"sourceRelease\":\"v15.3.10\",\"sourceCommit\":\"fb711292b2642c2296eb76c0cfe2531606029609\",\"tripManifestSha256\":\"3cda95d4e6b1d5d7138dd2ca3320501d9b59076a0f9c9cfb3e67117ed5384758\",\"bundleContentSha256\":\"ace75d0f1befd2dc107233cef965add96575168024a32575d6fe6a628c53e2a0\",\"bundleManifestSha256\":\"f947ee6f293d62252ab43d9f5c4b226a27cfe79a189e75a56567a368e79b6169\",\"bundleManifestPath\":\"offline-bundle.json\",\"generatedAt\":\"2026-08-11T13:37:49Z\",\"retentionCount\":2,\"resources\":[{\"path\":\"index.html\",\"sha256\":\"486ec14d05321e8fd8afc0e05ec58f8434cb70fd1841e2231e1fa9f9e31c9580\",\"bytes\":15202,\"role\":\"application-shell\",\"required\":true},{\"path\":\"css/companion.css\",\"sha256\":\"061e56f8fb54b6e3c1c1068537122b8cd62e790f91f05f7f6c13eef28e0f7ca1\",\"bytes\":25790,\"role\":\"application-style\",\"required\":true},{\"path\":\"js/red-bootstrap.js\",\"sha256\":\"30ff676ecdb95d595f308eadf055d20fdd9b8c83489c79213382192f1850913c\",\"bytes\":659,\"role\":\"display-bootstrap\",\"required\":true},{\"path\":\"js/companion-data.js\",\"sha256\":\"8b43d093177ca32aead1b01e76c6b758b3211edf94a886201b3a59f8ba646071\",\"bytes\":14656,\"role\":\"canonical-runtime-data\",\"required\":true},{\"path\":\"js/companion-state.js\",\"sha256\":\"723e586f87c8771517b576a14fdf3103e1e94a1116c286ab86aa1d888412d2b9\",\"bytes\":6400,\"role\":\"device-local-state\",\"required\":true},{\"path\":\"js/companion-help.js\",\"sha256\":\"3aa8e2f75abf5e514b056de4900eb18506a428b8f392d1f73230388c75e821c2\",\"bytes\":17798,\"role\":\"offline-help-and-support\",\"required\":true},{\"path\":\"js/companion-install.js\",\"sha256\":\"b0fd5ba54bb1d23d5e82172f518a6021b456123b4e6ea434c69fead4b1dc96f5\",\"bytes\":8618,\"role\":\"install-and-offline-control\",\"required\":true},{\"path\":\"js/companion-ui.js\",\"sha256\":\"3db2969086e3fc8d452684822a2b914f954e25c34dbf5c0e5f2ee880af1cf333\",\"bytes\":31727,\"role\":\"application-ui\",\"required\":true},{\"path\":\"js/companion.js\",\"sha256\":\"7c0461c4103ba5dc30553dd8f2c3b93eb90f0efe1d7d0ad65d6e57e3425da130\",\"bytes\":19515,\"role\":\"application-controller\",\"required\":true},{\"path\":\"manifest.webmanifest\",\"sha256\":\"09478c96d3a113d18ca7a597d211735793a67e40ab7936761e487768d102897f\",\"bytes\":672,\"role\":\"web-app-manifest\",\"required\":true},{\"path\":\"icons/companion-icon.svg\",\"sha256\":\"bb419adde3ab2112434ddae94a11ee5bcb40cba7399771dd51a315fef4547871\",\"bytes\":494,\"role\":\"application-icon\",\"required\":true},{\"path\":\"icons/companion-maskable.svg\",\"sha256\":\"67ccb079c74c2a4f9fceb278e13d4720fc7e043a861a39989e3531623a21525f\",\"bytes\":475,\"role\":\"maskable-application-icon\",\"required\":true},{\"path\":\"data/trip-manifest.json\",\"sha256\":\"3cda95d4e6b1d5d7138dd2ca3320501d9b59076a0f9c9cfb3e67117ed5384758\",\"bytes\":58645,\"role\":\"canonical-manifest\",\"required\":true},{\"path\":\"generated/field-guide.pdf\",\"sha256\":\"3ac4b8b512637d99d44263ae5ab97d75650a06bf75b0b65797cd585329517523\",\"bytes\":12662,\"role\":\"field-guide-pdf\",\"required\":true},{\"path\":\"generated/pocket-card.pdf\",\"sha256\":\"99fbd6b99b3ccaa641bbfc7f5d68244728e22985c373c44db870088b74226958\",\"bytes\":5844,\"role\":\"pocket-card-pdf\",\"required\":true},{\"path\":\"release.json\",\"sha256\":\"8066ca2a0b2d5059c7ab8609923a3f6c9ecbcee86e3428f70c3fcd99a516d238\",\"bytes\":914,\"role\":\"release-metadata\",\"required\":true}]}");

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

async function verifyCacheContents(cacheName, bundle, { hashAssets = true } = {}) {
  const cache = await caches.open(cacheName);
  verifyBundleShape(bundle);
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
    installedAt: ''
  };
}

async function verifyCache(cacheName, options = {}) {
  const cache = await caches.open(cacheName);
  const marker = await readMarker(cache);
  if (!marker || marker.complete !== true || marker.bundle_id !== OFFLINE_RELEASE.bundleId ||
      marker.bundle_manifest_sha256 !== OFFLINE_RELEASE.bundleManifestSha256 ||
      marker.bundle_content_sha256 !== OFFLINE_RELEASE.bundleContentSha256) {
    throw new Error('Complete release marker is missing or has the wrong identity');
  }
  const result = await verifyCacheContents(cacheName, marker.offline_bundle, options);
  return { ...result, installedAt: marker.installed_at };
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
    await verifyCacheContents(cacheName, bundle);
    const completeMarker = {
      complete: true,
      bundle_id: OFFLINE_RELEASE.bundleId,
      bundle_manifest_sha256: OFFLINE_RELEASE.bundleManifestSha256,
      bundle_content_sha256: OFFLINE_RELEASE.bundleContentSha256,
      installed_at: new Date().toISOString(),
      reason,
      offline_bundle: bundle
    };
    await cache.put(COMPLETE_MARKER_URL, new Response(JSON.stringify(completeMarker), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    }));
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
  const previous = complete
    .filter(record => record.marker.bundle_id !== OFFLINE_RELEASE.bundleId)
    .slice(0, Math.max(0, OFFLINE_RELEASE.retentionCount - (current ? 1 : 0)));
  const keep = new Set([current?.name, ...previous.map(record => record.name)].filter(Boolean));
  await Promise.all(companionNames.filter(name => !keep.has(name)).map(name => caches.delete(name)));
}

async function cleanupFailedActivation() {
  const companionNames = (await caches.keys()).filter(name => name.startsWith(CACHE_PREFIX));
  for (const name of companionNames) {
    const marker = await readMarker(await caches.open(name));
    if (marker?.bundle_id === OFFLINE_RELEASE.bundleId || marker?.complete !== true) {
      await caches.delete(name);
    }
  }
  await cleanupCaches();
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
    const replacingPreviousRelease = (await completedCaches())
      .some(record => record.marker.bundle_id !== OFFLINE_RELEASE.bundleId);
    try {
      await verifyActiveCache();
    } catch (error) {
      await cleanupFailedActivation();
      throw error;
    }
    await cleanupCaches();
    await self.clients.claim();
    if (replacingPreviousRelease) {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(windows.map(client => client.navigate(client.url)));
    }
  })());
});

self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin || !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;
  const relativePath = decodeURIComponent(requestUrl.pathname.slice(scopeUrl.pathname.length)) || 'index.html';
  const isExplicitResource = OFFLINE_RELEASE.resources.some(entry => entry.path === relativePath);
  const requestedPath = event.request.mode === 'navigate' && !isExplicitResource ? 'index.html' : relativePath;
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
