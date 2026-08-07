import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scope = 'https://companion.test/';
const markerUrl = new URL('__ddmg_complete__.json', scope).href;
const workerSource = await readFile(resolve(repoRoot, 'service-worker.js'), 'utf8');
const constantsMatch = workerSource.match(/const OFFLINE_RELEASE = JSON\.parse\(("(?:[^"\\]|\\.)*")\);/);
if (!constantsMatch) throw new Error('Generated service-worker constants are unavailable');
const release = JSON.parse(JSON.parse(constantsMatch[1]));

class MemoryCache {
  constructor(name, runtime) {
    this.name = name;
    this.runtime = runtime;
    this.entries = new Map();
  }

  key(value) {
    return typeof value === 'string' ? value : value.url;
  }

  async put(request, response) {
    const key = this.key(request);
    this.entries.set(key, {
      bytes: new Uint8Array(await response.arrayBuffer()),
      headers: [...response.headers.entries()],
      status: response.status,
      statusText: response.statusText
    });
    this.runtime.putOrder.push({ cache: this.name, url: key });
  }

  async match(request) {
    const entry = this.entries.get(this.key(request));
    if (!entry) return undefined;
    return new Response(entry.bytes.slice(), {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.headers
    });
  }

  async keys() {
    const resourceUrls = release.resources.map(entry => new URL(entry.path, scope).href);
    if (this.runtime.mutateBeforeVerification && !this.runtime.mutationApplied &&
        resourceUrls.every(url => this.entries.has(url)) && !this.entries.has(markerUrl)) {
      const entry = this.entries.get(resourceUrls[0]);
      entry.bytes = entry.bytes.slice();
      entry.bytes[0] ^= 1;
      this.runtime.mutationApplied = true;
    }
    return [...this.entries.keys()].map(url => ({ url }));
  }

  async delete(request) {
    return this.entries.delete(this.key(request));
  }
}

class MemoryCacheStorage {
  constructor(runtime) {
    this.runtime = runtime;
    this.values = new Map();
  }

  async open(name) {
    if (!this.values.has(name)) this.values.set(name, new MemoryCache(name, this.runtime));
    return this.values.get(name);
  }

  async keys() {
    return [...this.values.keys()];
  }

  async delete(name) {
    this.runtime.deletedCaches.push(name);
    return this.values.delete(name);
  }
}

async function createRuntime({ mutateBeforeVerification = false, windowCount = 0 } = {}) {
  const listeners = new Map();
  const runtime = {
    mutateBeforeVerification,
    mutationApplied: false,
    putOrder: [],
    deletedCaches: [],
    claimed: 0,
    navigated: []
  };
  const caches = new MemoryCacheStorage(runtime);
  const windows = Array.from({ length: windowCount }, (_, index) => ({
    url: `${scope}?tab=${index + 1}`,
    async navigate(url) {
      runtime.navigated.push(url);
      return this;
    }
  }));
  const self = {
    registration: { scope },
    clients: {
      async claim() { runtime.claimed += 1; },
      async matchAll() { return windows; }
    },
    async skipWaiting() {},
    addEventListener(type, listener) { listeners.set(type, listener); }
  };
  const fetchResource = async request => {
    const url = new URL(typeof request === 'string' ? request : request.url);
    const path = decodeURIComponent(url.pathname.replace(/^\//, '')) || 'index.html';
    const localPath = path === release.bundleManifestPath ? 'offline-bundle.json' : path;
    try {
      const bytes = await readFile(resolve(repoRoot, localPath));
      const contentType = localPath.endsWith('.json') ? 'application/json' :
        localPath.endsWith('.pdf') ? 'application/pdf' :
          localPath.endsWith('.js') ? 'text/javascript' :
            localPath.endsWith('.css') ? 'text/css' : 'text/html';
      return new Response(bytes, { status: 200, headers: { 'Content-Type': contentType } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  };
  const context = vm.createContext({
    self,
    caches,
    fetch: fetchResource,
    crypto: webcrypto,
    URL,
    Response,
    TextDecoder,
    Uint8Array,
    Date,
    Math,
    Promise,
    Set,
    Map,
    Error,
    JSON
  });
  vm.runInContext(workerSource, context, { filename: 'service-worker.js' });

  async function dispatch(type, properties = {}) {
    let promise = Promise.resolve();
    let responsePromise;
    const event = {
      ...properties,
      waitUntil(value) { promise = Promise.resolve(value); },
      respondWith(value) { responsePromise = Promise.resolve(value); }
    };
    listeners.get(type)(event);
    if (responsePromise) return responsePromise;
    return promise;
  }

  async function seedPreviousRelease() {
    const name = 'ddmg-companion-release-ddmg-companion-0-6-0-candidate-3-data-3cda95d4e6b1-b1-previous';
    const cache = await caches.open(name);
    await cache.put(new URL('index.html', scope).href, new Response('<h1>Previous Companion</h1>', { headers: { 'Content-Type': 'text/html' } }));
    await cache.put(markerUrl, new Response(JSON.stringify({
      complete: true,
      bundle_id: 'ddmg-companion-0-6-0-candidate-3-data-3cda95d4e6b1-b1',
      bundle_manifest_sha256: 'previous-release-manifest-sha256',
      bundle_content_sha256: 'previous-release-content-sha256',
      installed_at: '2026-08-07T00:00:00.000Z',
      offline_bundle: { schema_version: 1, release_status: 'candidate' }
    }), { headers: { 'Content-Type': 'application/json' } }));
    return name;
  }

  async function workerMessage(type) {
    let result;
    await dispatch('message', {
      data: { type },
      ports: [{ postMessage(value) { result = value; } }]
    });
    return result;
  }

  return { runtime, caches, dispatch, seedPreviousRelease, workerMessage };
}

async function completeCaches(caches) {
  const complete = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith('ddmg-companion-release-')) continue;
    const marker = await (await caches.open(name)).match(markerUrl);
    if (marker && (await marker.json()).complete === true) complete.push(name);
  }
  return complete;
}

const failed = await createRuntime({ mutateBeforeVerification: true });
const failedPrevious = await failed.seedPreviousRelease();
await assert.rejects(failed.dispatch('install'), /Offline cache integrity failed/);
assert.equal(failed.runtime.mutationApplied, true);
assert.deepEqual(await completeCaches(failed.caches), [failedPrevious]);
assert.equal((await failed.workerMessage('VERIFY_OFFLINE_BUNDLE')).complete, false);

const successful = await createRuntime({ windowCount: 2 });
const successfulPrevious = await successful.seedPreviousRelease();
await successful.dispatch('install');
const lastPut = successful.runtime.putOrder.at(-1);
assert.equal(lastPut.url, markerUrl);
assert.equal((await (await (await successful.caches.open(lastPut.cache)).match(markerUrl)).json()).complete, true);
assert.equal((await successful.workerMessage('VERIFY_OFFLINE_BUNDLE')).complete, true);
await successful.dispatch('activate');
assert.equal(successful.runtime.claimed, 1);
assert.equal(successful.runtime.navigated.length, 2);
assert.equal((await completeCaches(successful.caches)).length, 2);
assert.equal((await successful.caches.keys()).includes(successfulPrevious), true);
for (const path of ['generated/field-guide.pdf', 'generated/pocket-card.pdf']) {
  const response = await successful.dispatch('fetch', {
    request: { url: new URL(path, scope).href, mode: 'navigate' }
  });
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
}

const failedActivation = await createRuntime();
const activationPrevious = await failedActivation.seedPreviousRelease();
await failedActivation.dispatch('install');
const currentName = (await completeCaches(failedActivation.caches)).find(name => name !== activationPrevious);
const currentCache = await failedActivation.caches.open(currentName);
await currentCache.delete(new URL('js/companion-ui.js', scope).href);
const unrelatedName = 'unrelated-application-cache';
await (await failedActivation.caches.open(unrelatedName)).put('https://companion.test/unrelated', new Response('keep'));
await assert.rejects(failedActivation.dispatch('activate'), /resource count or membership mismatch/);
assert.equal((await failedActivation.caches.keys()).includes(currentName), false);
assert.equal((await failedActivation.caches.keys()).includes(activationPrevious), true);
assert.equal((await failedActivation.caches.keys()).includes(unrelatedName), true);
assert.equal(failedActivation.runtime.claimed, 0);

console.log('real_service_worker_runtime_test=pass');
console.log('real_runtime.failed_verification_candidate_selectable=0');
console.log('real_runtime.complete_marker_written_after_hash_and_identity_verification=pass');
console.log('real_runtime.explicit_pdf_navigation_preserved=2');
console.log('real_runtime.complete_release_retention_count=2');
console.log('real_runtime.failed_activation_preserved_previous_release=pass');
console.log('real_runtime.failed_activation_unrelated_cache_deletions=0');
console.log('real_runtime.updated_window_clients_navigated=2');
