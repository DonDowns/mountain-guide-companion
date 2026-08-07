import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runValidation } from './validate-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

function normalizedPhone(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';
}

async function main() {
  const { manifest } = await runValidation({ silent: true });
  const [fieldGuide, pocketCard] = await Promise.all([
    readFile(resolve(repoRoot, 'generated/field-guide-artifact.json'), 'utf8').then(JSON.parse),
    readFile(resolve(repoRoot, 'generated/pocket-card-artifact.json'), 'utf8').then(JSON.parse)
  ]);
  const paths = [
    'index.html', 'css/companion.css', 'js/red-bootstrap.js', 'js/companion.js', 'js/companion-ui.js',
    'js/companion-install.js', 'js/companion-state.js', 'js/companion-data.js', 'manifest.webmanifest',
    'release.json', 'config/companion.build.json', 'service-worker.dev.js', 'playwright.config.mjs',
    'tests/companion.spec.mjs', 'tests/visual-audit.spec.mjs', 'tests/accessibility.spec.mjs'
  ];
  const allowedPhones = new Set(manifest.public_emergency_contacts.flatMap(contact => contact.phone_numbers).map(phone => normalizedPhone(phone.e164)));
  const allowedFingerprints = new Set([
    manifest.metadata.source_commit,
    fieldGuide.trip_manifest_sha256,
    fieldGuide.field_guide_pdf_sha256,
    pocketCard.pocket_card_pdf_sha256
  ]);
  const errors = [];
  const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
  const phonePattern = /(?:\+?1[-. ]?)?\(?[2-9][0-9]{2}\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}\b/g;
  for (const path of paths) {
    const content = await readFile(resolve(repoRoot, path), 'utf8');
    let phoneContent = content;
    for (const fingerprint of allowedFingerprints) phoneContent = phoneContent.replaceAll(fingerprint, '');
    if ((content.match(emailPattern) || []).length) errors.push(`${path} contains an email value`);
    for (const match of phoneContent.match(phonePattern) || []) {
      if (!allowedPhones.has(normalizedPhone(match))) errors.push(`${path} contains a non-allowlisted phone value`);
    }
  }
  const release = JSON.parse(await readFile(resolve(repoRoot, 'release.json'), 'utf8'));
  const forbiddenReleaseKeys = ['private_contact', 'actual_start', 'milestones', 'status_note', 'medical', 'device_id', 'token'];
  for (const key of forbiddenReleaseKeys) if (Object.hasOwn(release, key)) errors.push(`release.json contains local/private key ${key}`);
  const stateSource = await readFile(resolve(repoRoot, 'js/companion-state.js'), 'utf8');
  for (const defaultValue of ["name: ''", "phone: ''", "alternate: ''", "note: ''", "statusNote: ''"]) {
    if (!stateSource.includes(defaultValue)) errors.push(`local state lacks empty default ${defaultValue}`);
  }
  if (errors.length) throw new Error('PWA privacy verification failed:\n- ' + errors.join('\n- '));
  console.log('pwa_privacy=pass');
  console.log('allowlisted_public_phone_count=' + allowedPhones.size);
  console.log('private_fixture_values=0');
  console.log('shared_local_state_fields=0');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
