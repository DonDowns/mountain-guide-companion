import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

async function main() {
  const runtimePaths = [
    'index.html', 'css/companion.css', 'js/companion.js', 'js/companion-ui.js',
    'js/companion-install.js', 'js/companion-state.js', 'js/companion-data.js', 'js/red-bootstrap.js',
    'service-worker.js', 'manifest.webmanifest', 'release.json'
  ];
  const runtime = (await Promise.all(runtimePaths.map(path => readFile(resolve(repoRoot, path), 'utf8')))).join('\n').toLowerCase();
  const { companionData } = await import(pathToFileURL(resolve(repoRoot, 'js/companion-data.js')).href + `?safety=${Date.now()}`);
  const prohibited = [
    'all clear', 'safe to proceed', 'route is safe', 'weather permits', 'approved to continue',
    'go/no-go', 'rescue requested', 'rescue activated', 'help is on the way', 'message sent',
    'call completed', 'recipient notified', 'good to go', 'green light', 'cleared to proceed', 'you may proceed',
    'everything is safe'
  ];
  const found = prohibited.filter(phrase => runtime.includes(phrase));
  const errors = found.map(phrase => `PWA runtime contains prohibited affirmative concept ${JSON.stringify(phrase)}`);
  for (const required of [
    companionData.invariants.weather,
    companionData.invariants.emergency,
    companionData.invariants.jurisdiction,
    'Planning targets remain planning values.',
    'Offline Check confirms the required Companion resources are stored on this phone. It does not evaluate weather, access, terrain, or route conditions.',
    'Each phone must complete its own Offline Check and Airplane Mode test.'
  ]) {
    if (!runtime.includes(required.toLowerCase())) errors.push(`PWA runtime is missing safety boundary ${JSON.stringify(required)}`);
  }
  if (errors.length) throw new Error('PWA safety verification failed:\n- ' + errors.join('\n- '));
  console.log('supplemental_static_pwa_safety_guard=pass');
  console.log('prohibited_affirmative_concepts_found=0');
  console.log('offline_readiness_claims_found=0');
  console.log('call_completion_claims_found=0');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
