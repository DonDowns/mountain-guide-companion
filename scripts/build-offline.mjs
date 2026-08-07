import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

const resourceDefinitions = [
  ['index.html', 'application-shell'],
  ['css/companion.css', 'application-style'],
  ['js/red-bootstrap.js', 'display-bootstrap'],
  ['js/companion-data.js', 'canonical-runtime-data'],
  ['js/companion-state.js', 'device-local-state'],
  ['js/companion-install.js', 'install-and-offline-control'],
  ['js/companion-ui.js', 'application-ui'],
  ['js/companion.js', 'application-controller'],
  ['manifest.webmanifest', 'web-app-manifest'],
  ['icons/companion-icon.svg', 'application-icon'],
  ['icons/companion-maskable.svg', 'maskable-application-icon'],
  ['data/trip-manifest.json', 'canonical-manifest'],
  ['generated/field-guide.pdf', 'field-guide-pdf'],
  ['generated/pocket-card.pdf', 'pocket-card-pdf'],
  ['release.json', 'release-metadata']
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function entryFor([path, role]) {
  const bytes = await readFile(resolve(repoRoot, path));
  return { path, sha256: sha256(bytes), bytes: bytes.length, role, required: true };
}

function assertIdentity(release, config) {
  if (release.companion_version !== config.companion_version) throw new Error('release/config Companion version mismatch');
  if (release.release_status !== config.release_status || config.release_status !== 'candidate') {
    throw new Error('Phase 6 release status must remain candidate');
  }
  if (release.offline_bundle_version !== config.offline_bundle_version) throw new Error('offline bundle version mismatch');
  if (!release.bundle_id?.startsWith(`${config.cache_namespace}-`)) throw new Error('bundle identity is outside the Companion cache namespace');
}

async function main() {
  const [config, baseRelease, template] = await Promise.all([
    readFile(resolve(repoRoot, 'config/companion.build.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'release.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'service-worker.template.js'), 'utf8')
  ]);
  assertIdentity(baseRelease, config);

  const coreDefinitions = resourceDefinitions.filter(([path]) => path !== 'release.json');
  const coreResources = await Promise.all(coreDefinitions.map(entryFor));
  const contentIdentity = {
    schema_version: config.offline_bundle_version,
    bundle_id: baseRelease.bundle_id,
    companion_version: baseRelease.companion_version,
    data_version: baseRelease.data_version,
    manifest_sha256: baseRelease.manifest_sha256,
    source_release: baseRelease.source_release,
    source_commit: baseRelease.source_commit,
    resources: coreResources
  };
  const contentSha256 = sha256(Buffer.from(JSON.stringify(contentIdentity)));
  const release = {
    ...baseRelease,
    offline_bundle_content_sha256: contentSha256,
    offline_bundle_entry_count: resourceDefinitions.length
  };
  await writeFile(resolve(repoRoot, 'release.json'), JSON.stringify(release, null, 2) + '\n');

  const resources = await Promise.all(resourceDefinitions.map(entryFor));
  const totalBytes = resources.reduce((total, resource) => total + resource.bytes, 0);
  const pdfBytes = resources.filter(resource => resource.role.endsWith('-pdf')).reduce((total, resource) => total + resource.bytes, 0);
  const offlineBundle = {
    schema_version: config.offline_bundle_version,
    bundle_id: release.bundle_id,
    cache_namespace: config.cache_namespace,
    companion_version: release.companion_version,
    data_version: release.data_version,
    source_release: release.source_release,
    source_commit: release.source_commit,
    trip_manifest_sha256: release.manifest_sha256,
    bundle_content_sha256: contentSha256,
    generated_at: release.generated_at,
    release_status: release.release_status,
    entry_count: resources.length,
    total_bytes: totalBytes,
    pdf_bytes: pdfBytes,
    retention: { current_complete: 1, previous_complete: 1 },
    resources
  };
  const bundleText = JSON.stringify(offlineBundle, null, 2) + '\n';
  const bundleManifestSha256 = sha256(Buffer.from(bundleText));
  await writeFile(resolve(repoRoot, 'offline-bundle.json'), bundleText);

  const workerConstants = {
    cacheNamespace: config.cache_namespace,
    bundleId: release.bundle_id,
    companionVersion: release.companion_version,
    dataVersion: release.data_version,
    sourceRelease: release.source_release,
    sourceCommit: release.source_commit,
    tripManifestSha256: release.manifest_sha256,
    bundleContentSha256: contentSha256,
    bundleManifestSha256,
    bundleManifestPath: 'offline-bundle.json',
    generatedAt: release.generated_at,
    retentionCount: 2,
    resources
  };
  if (!template.includes('__OFFLINE_RELEASE_CONSTANTS__')) throw new Error('service-worker template placeholder is missing');
  const worker = template.replace('__OFFLINE_RELEASE_CONSTANTS__', JSON.stringify(JSON.stringify(workerConstants)));
  await writeFile(resolve(repoRoot, 'service-worker.js'), worker);

  const largest = [...resources].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  console.log('offline_bundle_build=pass');
  console.log('bundle_id=' + release.bundle_id);
  console.log('bundle_manifest_sha256=' + bundleManifestSha256);
  console.log('bundle_content_sha256=' + contentSha256);
  console.log('offline_entry_count=' + resources.length);
  console.log('offline_total_bytes=' + totalBytes);
  console.log('offline_pdf_bytes=' + pdfBytes);
  console.log('largest_resources=' + largest.map(item => `${item.path}:${item.bytes}`).join(','));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
