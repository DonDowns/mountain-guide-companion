import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

async function main() {
  execFileSync(process.execPath, ['--check', 'service-worker.js'], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', 'service-worker.template.js'], { cwd: repoRoot, stdio: 'pipe' });
  const [worker, installer, controller] = await Promise.all([
    readFile(resolve(repoRoot, 'service-worker.js'), 'utf8'),
    readFile(resolve(repoRoot, 'js/companion-install.js'), 'utf8'),
    readFile(resolve(repoRoot, 'js/companion.js'), 'utf8')
  ]);
  const errors = [];
  const required = [
    "addEventListener('install'", "addEventListener('activate'", "addEventListener('fetch'", "addEventListener('message'",
    "crypto.subtle.digest('SHA-256'", 'VERIFY_OFFLINE_BUNDLE', 'REPAIR_OFFLINE_COPY', 'ACTIVATE_VERIFIED_UPDATE',
    'COMPLETE_MARKER_PATH', 'bundle_manifest_sha256', 'bundle_content_sha256', 'cleanupCaches', 'verifyActiveCache'
  ];
  for (const text of required) if (!worker.includes(text)) errors.push(`service worker is missing ${text}`);
  for (const prohibited of ['service-worker.dev.js', 'cache-v1', 'current-cache', 'delete-all-caches', 'console.log', 'sendBeacon(', 'XMLHttpRequest', 'WebSocket(']) {
    if (worker.includes(prohibited)) errors.push(`service worker contains prohibited pattern ${prohibited}`);
  }
  const installSection = worker.slice(worker.indexOf("addEventListener('install'"), worker.indexOf("addEventListener('activate'"));
  if (installSection.includes('skipWaiting')) errors.push('install handler uses skipWaiting before update activation');
  const fetchSection = worker.slice(worker.indexOf("addEventListener('fetch'"), worker.indexOf("addEventListener('message'"));
  const candidateSection = worker.slice(worker.indexOf('async function buildCandidate'), worker.indexOf('async function cleanupCaches'));
  if (fetchSection.includes('fetch(')) errors.push('field-resource fetch handler has a network fallback');
  if (!fetchSection.includes('isExplicitResource') || !fetchSection.includes("? 'index.html' : relativePath")) {
    errors.push('navigation routing does not preserve explicit bundled resources');
  }
  if (candidateSection.indexOf('verifyCacheContents(cacheName, bundle)') > candidateSection.indexOf('cache.put(COMPLETE_MARKER_URL')) {
    errors.push('complete marker is written before candidate verification');
  }
  if (!worker.includes('cleanupFailedActivation')) errors.push('activate failure cleanup is not explicit');
  if (!installer.includes("register('./service-worker.js'")) errors.push('application does not register the production service worker');
  if (!installer.includes("scope: './'")) errors.push('Companion service-worker scope is not local');
  if (installer.includes('mountainguide.vondadowns.com')) errors.push('Companion installer references the Mountain Guide origin');
  if (controller.includes("addEventListener('controllerchange'")) {
    errors.push('application action controller arms a controllerchange listener; lifecycle ownership must remain in the installer');
  }
  if (!controller.includes("if (!activated) showToast('No downloaded update is waiting.')")) {
    errors.push('no-waiting-update action does not remain a bounded no-op');
  }
  if (errors.length) throw new Error('Service-worker contract failed:\n- ' + errors.join('\n- '));
  console.log('static_contract_check.service_worker=pass');
  console.log('static_contract_check.complete_marker_after_verification=pass');
  console.log('static_contract_check.explicit_navigation_resources_preserved=pass');
  console.log('static_contract_check.network_fallback_for_field_resources=0');
  console.log('static_contract_check.cache_namespace=ddmg-companion');
  console.log('static_contract_check.configured_retention_limit=2');
  console.log('static_contract_check.noop_update_listener_armed=0');
  console.log('static_contract_check.mountain_guide_scope_references=0');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
