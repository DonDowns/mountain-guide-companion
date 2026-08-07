import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseWorkerConstants(source) {
  const match = source.match(/const OFFLINE_RELEASE = JSON\.parse\(("(?:[^"\\]|\\.)*")\);/);
  if (!match) throw new Error('generated service worker constants are missing');
  return JSON.parse(JSON.parse(match[1]));
}

async function main() {
  const [bundleBytes, bundle, release, config, workerSource, manifestBytes] = await Promise.all([
    readFile(resolve(repoRoot, 'offline-bundle.json')),
    readFile(resolve(repoRoot, 'offline-bundle.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'release.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'config/companion.build.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'service-worker.js'), 'utf8'),
    readFile(resolve(repoRoot, 'data/trip-manifest.json'))
  ]);
  const worker = parseWorkerConstants(workerSource);
  const errors = [];
  const requiredPaths = new Set([
    'index.html', 'css/companion.css', 'js/red-bootstrap.js', 'js/companion-data.js',
    'js/companion-state.js', 'js/companion-install.js', 'js/companion-ui.js', 'js/companion.js',
    'manifest.webmanifest', 'icons/companion-icon.svg', 'icons/companion-maskable.svg',
    'data/trip-manifest.json', 'generated/field-guide.pdf', 'generated/pocket-card.pdf', 'release.json'
  ]);
  const paths = bundle.resources.map(resource => resource.path);
  if (new Set(paths).size !== paths.length) errors.push('offline bundle contains duplicate paths');
  if (paths.length !== requiredPaths.size || paths.some(path => !requiredPaths.has(path))) errors.push('offline bundle required-path membership mismatch');
  if (paths.some(path => path.startsWith('/') || path.includes('?') || path.includes('#') || path.includes('://'))) errors.push('offline bundle contains a non-local or stateful resource URL');

  let totalBytes = 0;
  let pdfBytes = 0;
  for (const resource of bundle.resources) {
    const bytes = await readFile(resolve(repoRoot, resource.path));
    totalBytes += bytes.length;
    if (resource.role.endsWith('-pdf')) pdfBytes += bytes.length;
    if (resource.sha256 !== sha256(bytes)) errors.push(`${resource.path} SHA-256 mismatch`);
    if (resource.bytes !== bytes.length) errors.push(`${resource.path} byte-size mismatch`);
    if (resource.required !== true) errors.push(`${resource.path} is not marked required`);
  }
  if (bundle.entry_count !== bundle.resources.length) errors.push('offline bundle entry count mismatch');
  if (bundle.total_bytes !== totalBytes) errors.push('offline bundle total byte count mismatch');
  if (bundle.pdf_bytes !== pdfBytes) errors.push('offline bundle PDF byte count mismatch');
  if (bundle.trip_manifest_sha256 !== sha256(manifestBytes)) errors.push('offline bundle canonical manifest SHA mismatch');

  const coreResources = bundle.resources.filter(resource => resource.path !== 'release.json');
  const contentIdentity = {
    schema_version: config.offline_bundle_version,
    bundle_id: release.bundle_id,
    companion_version: release.companion_version,
    data_version: release.data_version,
    manifest_sha256: release.manifest_sha256,
    source_release: release.source_release,
    source_commit: release.source_commit,
    resources: coreResources
  };
  const contentSha256 = sha256(Buffer.from(JSON.stringify(contentIdentity)));
  if (contentSha256 !== bundle.bundle_content_sha256 || contentSha256 !== release.offline_bundle_content_sha256) {
    errors.push('offline bundle content checksum mismatch');
  }
  for (const [key, expected] of [
    ['bundleId', bundle.bundle_id],
    ['companionVersion', bundle.companion_version],
    ['dataVersion', bundle.data_version],
    ['sourceRelease', bundle.source_release],
    ['sourceCommit', bundle.source_commit],
    ['tripManifestSha256', bundle.trip_manifest_sha256],
    ['bundleContentSha256', bundle.bundle_content_sha256],
    ['bundleManifestSha256', sha256(bundleBytes)]
  ]) {
    if (worker[key] !== expected) errors.push(`service-worker ${key} mismatch`);
  }
  if (worker.resources.length !== bundle.resources.length) errors.push('service-worker resource count mismatch');
  if (JSON.stringify(worker.resources) !== JSON.stringify(bundle.resources)) errors.push('service-worker resource metadata mismatch');
  if (bundle.release_status !== 'candidate' || release.release_status !== 'candidate') errors.push('Phase 6 must remain candidate');
  if (bundle.cache_namespace !== 'ddmg-companion' || worker.cacheNamespace !== 'ddmg-companion') errors.push('Companion cache namespace mismatch');

  if (errors.length) throw new Error('Offline bundle verification failed:\n- ' + errors.join('\n- '));
  const largest = [...bundle.resources].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  console.log('offline_bundle_integrity=pass');
  console.log('bundle_id=' + bundle.bundle_id);
  console.log('bundle_manifest_sha256=' + sha256(bundleBytes));
  console.log('bundle_content_sha256=' + contentSha256);
  console.log('required_resource_count=' + bundle.resources.length);
  console.log('offline_total_bytes=' + totalBytes);
  console.log('offline_pdf_bytes=' + pdfBytes);
  console.log('largest_resources=' + largest.map(item => `${item.path}:${item.bytes}`).join(','));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
