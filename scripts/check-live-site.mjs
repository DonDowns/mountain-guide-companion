import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const requestedBase = process.argv[2] || process.env.COMPANION_LIVE_URL || 'https://companion.vondadowns.com/';
const baseUrl = new URL(requestedBase.endsWith('/') ? requestedBase : `${requestedBase}/`);
const expectedPublicBase = 'https://companion.vondadowns.com/';
const attempts = Number(process.env.LIVE_CHECK_ATTEMPTS || 12);
const delayMs = Number(process.env.LIVE_CHECK_DELAY_MS || 10000);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fetchBytes(path) {
  const url = new URL(path, baseUrl);
  const response = await fetch(url, { redirect: 'follow', cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function checkOnce() {
  if (baseUrl.protocol !== 'https:') throw new Error('live Companion URL is not HTTPS');
  const [localBundleBytes, localManifestBytes, releaseBytes, bundleBytes, htmlBytes, webManifestBytes, workerBytes] = await Promise.all([
    readFile(resolve(repoRoot, 'offline-bundle.json')),
    readFile(resolve(repoRoot, 'data/trip-manifest.json')),
    fetchBytes('release.json'),
    fetchBytes('offline-bundle.json'),
    fetchBytes('index.html'),
    fetchBytes('manifest.webmanifest'),
    fetchBytes('service-worker.js')
  ]);
  const release = JSON.parse(releaseBytes.toString('utf8'));
  const bundle = JSON.parse(bundleBytes.toString('utf8'));
  const errors = [];
  if (release.companion_version !== '0.6.0-candidate.5') errors.push('candidate version mismatch');
  if (release.release_status !== 'candidate') errors.push('release status mismatch');
  if (release.pwa_url !== expectedPublicBase) errors.push('public URL contract mismatch');
  if (release.manifest_sha256 !== sha256(localManifestBytes)) errors.push('canonical manifest fingerprint mismatch');
  if (release.bundle_id !== bundle.bundle_id) errors.push('release/offline bundle identity mismatch');
  if (sha256(bundleBytes) !== sha256(localBundleBytes)) errors.push('deployed offline-bundle.json differs from the validated commit');
  if (!htmlBytes.toString('utf8').includes('CANDIDATE')) errors.push('candidate status is not visible in deployed HTML');
  if (!JSON.parse(webManifestBytes.toString('utf8')).start_url) errors.push('deployed web manifest is invalid');
  if (!workerBytes.toString('utf8').includes(release.bundle_id)) errors.push('deployed service worker identity mismatch');
  for (const resource of bundle.resources) {
    const bytes = await fetchBytes(resource.path);
    if (bytes.length !== resource.bytes || sha256(bytes) !== resource.sha256) errors.push(`${resource.path} live integrity mismatch`);
  }
  if (errors.length) throw new Error(errors.join('; '));
  console.log('live_site_integrity=pass');
  console.log('live_url=' + baseUrl.href);
  console.log('candidate_version=' + release.companion_version);
  console.log('release_status=' + release.release_status);
  console.log('bundle_id=' + release.bundle_id);
  console.log('manifest_sha256=' + release.manifest_sha256);
  console.log('verified_resource_count=' + bundle.resources.length);
}

let finalError;
for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    await checkOnce();
    finalError = null;
    break;
  } catch (error) {
    finalError = error;
    if (attempt < attempts) await new Promise(resolvePromise => setTimeout(resolvePromise, delayMs));
  }
}
if (finalError) {
  console.error('live_site_integrity=fail');
  console.error(finalError.message);
  process.exitCode = 1;
}
