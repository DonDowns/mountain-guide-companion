import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

function exec(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    env: options.env || process.env
  })?.trim();
}

function option(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function isRuntimeFile(path) {
  if (path.startsWith('print/') || path.startsWith('pocket-card/') ||
      ['generated/field-guide.html', 'generated/pocket-card.html'].includes(path)) return false;
  return ['.html', '.css', '.js', '.webmanifest'].includes(extname(path).toLowerCase()) ||
    ['app/', 'assets/', 'public/', 'src/'].some(directory => path.startsWith(directory));
}

async function manifestHash() {
  return createHash('sha256').update(await readFile(resolve(repoRoot, 'data/trip-manifest.json'))).digest('hex');
}

function assertProtected(repo) {
  const protection = JSON.parse(exec('gh', ['api', 'repos/' + repo + '/branches/main/protection']));
  const contexts = new Set(protection.required_status_checks?.contexts || []);
  for (const required of ['Validate repository', 'Auto-merge eligibility']) {
    if (!contexts.has(required)) throw new Error('main protection is missing required status check: ' + required);
  }
  if (!protection.enforce_admins?.enabled) throw new Error('main protection does not include administrators');
  if (protection.allow_force_pushes?.enabled || protection.allow_deletions?.enabled) {
    throw new Error('main protection permits force pushes or deletion');
  }
}

async function main() {
  const title = option('--title');
  const purpose = option('--purpose', title);
  const noAutoMerge = process.argv.includes('--no-auto-merge');
  if (!title) throw new Error('Usage: npm run pr:open -- --title "Title" --purpose "Purpose" [--no-auto-merge]');

  exec('gh', ['auth', 'status']);
  if (exec('git', ['status', '--porcelain'])) throw new Error('working tree must be clean before opening a pull request');
  const branch = exec('git', ['branch', '--show-current']);
  if (branch === 'main') throw new Error('create a project branch before opening a pull request');

  exec('git', ['fetch', 'origin', 'main']);
  for (const script of [
    'check:repository', 'check:data', 'check:manifest', 'check:provenance', 'check:privacy', 'check:safety',
    'build:field-guide', 'check:field-guide', 'check:pdf',
    'build:pocket-card', 'check:pocket-card', 'check:pocket-card-pdf',
    'build:pwa', 'build:offline', 'check:pwa', 'check:pwa:privacy', 'check:pwa:safety', 'check:artifact-parity',
    'check:offline', 'check:service-worker', 'build:pages', 'test:offline:logic', 'test:browser', 'test:offline'
  ]) {
    exec('npm', ['run', script], { inherit: true });
  }
  exec(process.execPath, ['scripts/check-pr-policy.mjs'], {
    inherit: true,
    env: { ...process.env, PR_BASE_REF: 'main', PR_DRAFT: 'false', PR_HEAD_REF: branch, PR_LABELS_JSON: '[]' }
  });

  const files = exec('git', ['diff', '--name-only', 'origin/main...HEAD']).split('\n').filter(Boolean);
  if (!files.length) throw new Error('branch has no changes relative to origin/main');
  const dataChanged = files.some(path => path.startsWith('data/'));
  const runtimeChanged = files.some(isRuntimeFile);
  const printChanged = files.some(path => path.startsWith('print/') || path.startsWith('pocket-card/') || path.startsWith('generated/') || /field.guide|pocket.card/i.test(path));
  const manifest = JSON.parse(await readFile(resolve(repoRoot, 'data/trip-manifest.json'), 'utf8'));
  const fieldGuideArtifact = JSON.parse(await readFile(resolve(repoRoot, 'generated/field-guide-artifact.json'), 'utf8'));
  const pocketCardArtifact = JSON.parse(await readFile(resolve(repoRoot, 'generated/pocket-card-artifact.json'), 'utf8'));
  const companionRelease = JSON.parse(await readFile(resolve(repoRoot, 'release.json'), 'utf8'));
  const offlineBundle = JSON.parse(await readFile(resolve(repoRoot, 'offline-bundle.json'), 'utf8'));
  const pending = [];
  const visit = value => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') {
      if (value.id && value.verification_status === 'pending_external_verification') pending.push(value.id);
      Object.values(value).forEach(visit);
    }
  };
  visit(manifest);

  const hash = await manifestHash();
  const body = [
    '## Purpose', '', purpose, '',
    '## Files changed', '', ...files.map(path => '- `' + path + '`'), '',
    '## Validation performed', '',
    '- `npm run check:repository`',
    '- `npm run check:data`',
    '- `npm run check:manifest`',
    '- `npm run check:provenance`',
    '- `npm run check:privacy`',
    '- `npm run check:safety`',
    '- `npm run build:field-guide`',
    '- `npm run check:field-guide`',
    '- `npm run check:pdf`',
    '- `npm run build:pocket-card`',
    '- `npm run check:pocket-card`',
    '- `npm run check:pocket-card-pdf`',
    '- `npm run build:pwa`',
    '- `npm run build:offline`',
    '- `npm run check:pwa`',
    '- `npm run check:pwa:privacy`',
    '- `npm run check:pwa:safety`',
    '- `npm run check:artifact-parity`',
    '- `npm run check:offline`',
    '- `npm run check:service-worker`',
    '- `npm run build:pages`',
    '- `npm run test:offline:logic`',
    '- `npm run test:browser` (Chromium/WebKit, desktop/390×844, install/setup/share/accessibility)',
    '- `npm run test:offline` (Chromium cold launch/zero-request/update/corruption/repair; WebKit offline navigation limitation documented)',
    '- `npm run check:policy`', '',
    'Manifest SHA-256: `' + hash + '` (' + (dataChanged ? 'data changed' : 'data unchanged') + ')', '',
    '## Printable Field Guide', '',
    'Exact artifact: `' + fieldGuideArtifact.artifact_path + '`.', '',
    'Page result: ' + fieldGuideArtifact.page_count + ' US Letter portrait pages.', '',
    'Field Guide PDF SHA-256: `' + fieldGuideArtifact.field_guide_pdf_sha256 + '`.', '',
    'Canonical data version: `' + fieldGuideArtifact.data_version + '`.', '',
    'Artifact status: draft, not a field release.', '',
    '## Emergency & Communication Pocket Card', '',
    'Exact artifact: `' + pocketCardArtifact.artifact_path + '`.', '',
    'Physical result: ' + pocketCardArtifact.page_count + ' portrait sides at ' + pocketCardArtifact.page_size + ' each.', '',
    'Pocket Card PDF SHA-256: `' + pocketCardArtifact.pocket_card_pdf_sha256 + '`.', '',
    'Canonical data version: `' + pocketCardArtifact.data_version + '`.', '',
    'Lily Lake treatment: no coordinate or elevation is printed; the scoped canonical hold remains unchanged.', '',
    'Artifact status: draft, not a field release.', '',
    '## Interactive Companion PWA', '',
    'Candidate Companion version: `' + companionRelease.companion_version + '`.', '',
    'Physical-test distribution URL: `' + companionRelease.pwa_url + '`.', '',
    'Browser result: Chromium and WebKit desktop/mobile interaction, friend install, standalone setup, share privacy, responsive, and accessibility checks pass.', '',
    'Offline browser result: Chromium desktop and 390×844 cold launch, zero-request field operation, previous→new update, interruption, corruption, repair, and local-state survival pass. Playwright WebKit offline navigation remains an explicitly documented engine limitation.', '',
    'Privacy result: pass; optional local fields remain device-local and sharing contains only the public Companion URL.', '',
    'Safety result: pass; Emergency stays one action away and no authorization, rescue, delivery, or field-ready offline claim is made.', '',
    'Offline bundle ID: `' + offlineBundle.bundle_id + '`.', '',
    'Offline bundle: ' + offlineBundle.entry_count + ' required resources / ' + offlineBundle.total_bytes + ' bytes; content SHA-256 `' + offlineBundle.bundle_content_sha256 + '`.', '',
    'Offline status: production service worker, atomic hash-verified cache transaction, coherent active-cache fetches, previous-release retention, real Offline Check, and repair are implemented. Physical iPhone Airplane Mode/force-quit/reboot proof remains outstanding.', '',
    'Deployment status: protected-main candidate Pages deployment requested; no field-release tag.', '',
    '## Release holds', '',
    pending.length ? 'Approved scoped holds: ' + pending.map(id => '`' + id + '`').join(', ') + '.' : 'No pending canonical record.', '',
    'Lily Lake hold: canonical coordinate/elevation remain null and pending; no secondary value appears in the PWA or print artifacts.', '',
    'No new unresolved release blocker or conflicted canonical record was introduced.', '',
    '## Runtime and physical testing', '',
    'Runtime files changed: ' + (runtimeChanged ? 'yes' : 'no') + '.', '',
    'Printable artifact files changed: ' + (printChanged ? 'yes' : 'no') + '.', '',
    runtimeChanged
      ? 'Physical testing is required before field release; this pull request does not assert physical signoff.'
      : 'No browser runtime was introduced. Actual-size print, sleeve/waterproof or lamination, daylight, headlamp, glove, wet-hand, pocket-extraction, and second-person signoff remain mandatory before field release.'
  ].join('\n');

  exec('git', ['push', '-u', 'origin', branch], { inherit: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'mgc-pr-'));
  const bodyPath = join(temporaryDirectory, 'body.md');
  try {
    await writeFile(bodyPath, body);
    const repo = JSON.parse(exec('gh', ['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
    const url = exec('gh', ['pr', 'create', '--repo', repo, '--base', 'main', '--head', branch, '--title', title, '--body-file', bodyPath]);
    console.log('pull_request=' + url);
    if (noAutoMerge) {
      console.log('auto_merge=bootstrap_manual_gate');
      return;
    }
    assertProtected(repo);
    exec('gh', ['pr', 'merge', url, '--auto', '--merge'], { inherit: true });
    console.log('auto_merge=enabled');
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
