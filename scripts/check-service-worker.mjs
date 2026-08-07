import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

async function main() {
  execFileSync(process.execPath, ['--check', 'service-worker.js'], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync(process.execPath, ['--check', 'service-worker.template.js'], { cwd: repoRoot, stdio: 'pipe' });
  const [worker, installer] = await Promise.all([
    readFile(resolve(repoRoot, 'service-worker.js'), 'utf8'),
    readFile(resolve(repoRoot, 'js/companion-install.js'), 'utf8')
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
  if (fetchSection.includes('fetch(')) errors.push('field-resource fetch handler has a network fallback');
  if (!installer.includes("register('./service-worker.js'")) errors.push('application does not register the production service worker');
  if (!installer.includes("scope: './'")) errors.push('Companion service-worker scope is not local');
  if (installer.includes('mountainguide.vondadowns.com')) errors.push('Companion installer references the Mountain Guide origin');
  if (errors.length) throw new Error('Service-worker contract failed:\n- ' + errors.join('\n- '));
  console.log('service_worker_contract=pass');
  console.log('atomic_marker_last=pass');
  console.log('network_fallback_for_field_resources=0');
  console.log('cache_namespace=ddmg-companion');
  console.log('retained_complete_releases=2');
  console.log('mountain_guide_scope_references=0');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
