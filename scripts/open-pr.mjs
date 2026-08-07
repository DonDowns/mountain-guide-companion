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
  for (const script of ['check:repository', 'check:data', 'check:manifest', 'check:provenance', 'check:privacy', 'check:safety']) {
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
  const manifest = JSON.parse(await readFile(resolve(repoRoot, 'data/trip-manifest.json'), 'utf8'));
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
    '- `npm run check:policy`', '',
    'Manifest SHA-256: `' + hash + '` (' + (dataChanged ? 'data changed' : 'data unchanged') + ')', '',
    'Privacy result: pass; no non-allowlisted private value detected.', '',
    'Safety result: pass; no prohibited authorization or false confirmation detected.', '',
    '## Release holds', '',
    pending.length ? 'Approved scoped holds: ' + pending.map(id => '`' + id + '`').join(', ') + '.' : 'No pending canonical record.', '',
    'No new unresolved release blocker or conflicted canonical record was introduced.', '',
    '## Runtime and physical testing', '',
    'Runtime files changed: ' + (runtimeChanged ? 'yes' : 'no') + '.', '',
    runtimeChanged
      ? 'Physical testing is required before field release; this pull request does not assert physical signoff.'
      : 'Physical testing is not required for this non-runtime merge; field-release physical signoff remains mandatory.'
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
