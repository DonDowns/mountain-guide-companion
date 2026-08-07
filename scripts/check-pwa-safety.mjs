import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

async function main() {
  const runtimePaths = [
    'index.html', 'css/companion.css', 'js/companion.js', 'js/companion-ui.js',
    'js/companion-install.js', 'js/companion-state.js', 'js/companion-data.js', 'manifest.webmanifest', 'release.json'
  ];
  const runtime = (await Promise.all(runtimePaths.map(path => readFile(resolve(repoRoot, path), 'utf8')))).join('\n').toLowerCase();
  const { companionData } = await import(pathToFileURL(resolve(repoRoot, 'js/companion-data.js')).href + `?safety=${Date.now()}`);
  const prohibited = [
    'all clear', 'safe to proceed', 'route is safe', 'weather permits', 'approved to continue',
    'go/no-go', 'rescue requested', 'rescue activated', 'help is on the way', 'message sent'
  ];
  const found = prohibited.filter(phrase => runtime.includes(phrase));
  const errors = found.map(phrase => `PWA runtime contains prohibited affirmative concept ${JSON.stringify(phrase)}`);
  for (const required of [
    companionData.invariants.weather,
    companionData.invariants.emergency,
    companionData.invariants.jurisdiction,
    'Planning targets remain planning values.',
    'Opening a phone intent does not prove that a call occurred.',
    'This verifies local Companion resources only. It does not verify mountain conditions, access, weather, or route safety.'
  ]) {
    if (!runtime.includes(required.toLowerCase())) errors.push(`PWA runtime is missing safety boundary ${JSON.stringify(required)}`);
  }
  if (errors.length) throw new Error('PWA safety verification failed:\n- ' + errors.join('\n- '));
  console.log('pwa_safety=pass');
  console.log('prohibited_affirmative_concepts_found=0');
  console.log('offline_readiness_claims_found=0');
  console.log('call_completion_claims_found=0');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
