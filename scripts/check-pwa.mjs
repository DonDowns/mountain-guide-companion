import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { runValidation } from './validate-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

function requireText(content, value, label, errors) {
  if (!content.includes(value)) errors.push(`${label} is missing ${JSON.stringify(value)}`);
}

async function main() {
  const [{ manifest }, release, buildConfig, packageJson, webManifest, html, css, generated] = await Promise.all([
    runValidation({ silent: true }),
    readFile(resolve(repoRoot, 'release.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'config/companion.build.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'package.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'manifest.webmanifest'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'index.html'), 'utf8'),
    readFile(resolve(repoRoot, 'css/companion.css'), 'utf8'),
    import(pathToFileURL(resolve(repoRoot, 'js/companion-data.js')).href + `?check=${Date.now()}`)
  ]);
  const { companionData, releaseMetadata } = generated;
  const manifestHash = await sha256(resolve(repoRoot, 'data/trip-manifest.json'));
  const errors = [];

  if (packageJson.version !== buildConfig.companion_version || release.companion_version !== buildConfig.companion_version) {
    errors.push('package, build, and release candidate versions must match exactly');
  }

  for (const [key, expected] of [
    ['data_version', manifest.data_version],
    ['manifest_sha256', manifestHash],
    ['source_release', manifest.metadata.source_release],
    ['source_commit', manifest.metadata.source_commit],
    ['verified_at', manifest.metadata.verified_at],
    ['release_status', 'candidate']
  ]) {
    if (release[key] !== expected) errors.push(`release.json ${key} mismatch`);
    if (releaseMetadata[key] !== expected) errors.push(`generated release metadata ${key} mismatch`);
  }
  if (companionData.identity.manifestSha256 !== manifestHash) errors.push('PWA data manifest SHA mismatch');
  if (companionData.identity.dataVersion !== manifest.data_version) errors.push('PWA data version mismatch');
  if (companionData.objectives.length !== 3 || companionData.routes.length !== 4 || companionData.decisions.length !== 5) {
    errors.push('PWA canonical objective/route/decision count mismatch');
  }
  if (companionData.contacts.flatMap(contact => contact.phones).length !== 6) errors.push('PWA public contact count mismatch');
  if (companionData.communication.milestones.length !== 9) errors.push('PWA milestone count mismatch');
  if (companionData.lilyLake.latitude !== null || companionData.lilyLake.longitude !== null || companionData.lilyLake.elevationFt !== null) {
    errors.push('PWA contains a Lily Lake coordinate/elevation');
  }
  if (webManifest.display !== 'standalone' || webManifest.start_url !== './' || webManifest.icons.length < 2) {
    errors.push('web manifest install/display contract mismatch');
  }

  for (const required of [
    'Mountain Guide Companion', 'Set Up This Phone', 'Companion Home', 'Continue in Browser', 'Home', 'Timeline', 'Route', 'Emergency', 'Red',
    '↑ Top', 'CALL 911 FIRST', 'Three Companion Artifacts', 'Test version', 'Help &amp; Diagnostics',
    'Copy Problem Report', 'Copy Feature Request', 'Check for New Shared Information', 'not yet a field release'
  ]) requireText(html.toLowerCase(), required.toLowerCase(), 'index.html', errors);
  for (const required of ['env(safe-area-inset-bottom)', 'min-height: 48px', '[data-display="red"]', 'overflow-x: hidden']) {
    requireText(css, required, 'companion.css', errors);
  }

  const sourceFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repoRoot, encoding: 'utf8'
  }).split('\0').filter(path => path.endsWith('.js') && ![
    'js/companion-data.js', 'service-worker.js', 'service-worker.template.js',
    'tests/fixtures/offline-update/previous/service-worker.js',
    'tests/fixtures/offline-update/previous/fixture-app.js'
  ].includes(path));
  const sourceText = (await Promise.all(sourceFiles.map(path => readFile(resolve(repoRoot, path), 'utf8')))).join('\n');
  requireText(sourceText.toLowerCase(), 'install for offline use', 'PWA browser-install UI', errors);
  for (const requiredRuntime of [
    'change objective', 'resume objective', 'replace with current time', 'copy message', 'share message',
    'marked locally at', 'confirm delivery in the sending app', 'share canceled. milestone unchanged.',
    'companion problem report', 'companion feature request', 'replay tutorial'
  ]) requireText(sourceText.toLowerCase(), requiredRuntime, 'PWA field-usability runtime', errors);
  for (const prohibitedRuntime of ['fetch(', 'XMLHttpRequest', 'WebSocket(', 'EventSource(', 'sendBeacon(', 'https://fonts.', 'https://cdn.']) {
    if (sourceText.includes(prohibitedRuntime)) errors.push(`PWA runtime contains network dependency ${prohibitedRuntime}`);
  }
  const sw = await readFile(resolve(repoRoot, 'service-worker.js'), 'utf8');
  for (const requiredWorkerBehavior of ['caches.open', "addEventListener('fetch'", 'respondWith(', 'VERIFY_OFFLINE_BUNDLE']) {
    if (!sw.includes(requiredWorkerBehavior)) errors.push(`Companion service worker is missing ${requiredWorkerBehavior}`);
  }

  const templateText = [html, css, sourceText].join('\n');
  const canonicalLiterals = [
    manifest.data_version, manifest.metadata.source_release, manifest.metadata.source_commit, manifestHash,
    ...manifest.objectives.map(item => item.name),
    ...manifest.planning_times.map(item => item.local_time),
    ...manifest.public_emergency_contacts.flatMap(contact => contact.phone_numbers.map(phone => phone.e164))
  ];
  for (const literal of canonicalLiterals) {
    if (templateText.includes(literal)) errors.push(`hand-maintained PWA source duplicates canonical literal ${JSON.stringify(literal)}`);
  }

  if (errors.length) throw new Error('PWA structural verification failed:\n- ' + errors.join('\n- '));
  console.log('pwa_structure=pass');
  console.log('runtime_network_dependencies=0');
  console.log('canonical_template_literals=0');
  console.log('objective_count=3');
  console.log('route_count=4');
  console.log('decision_gate_count=5');
  console.log('public_phone_count=6');
  console.log('milestone_count=9');
  console.log('lily_secondary_coordinates_found=0');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
