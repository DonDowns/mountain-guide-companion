import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalRecordGroups, manifestSha256, runValidation } from './validate-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

function exec(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']
  })?.trim();
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function requireFlag(flag) {
  if (!process.argv.includes(flag)) throw new Error('field release requires explicit ' + flag);
}

async function main() {
  const version = option('--version');
  const releaseManifestPath = option('--release-manifest');
  if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new Error('release version must use vMAJOR.MINOR.PATCH');
  if (!releaseManifestPath) throw new Error('--release-manifest is required');
  for (const flag of [
    '--owner-approved',
    '--physical-iphone-passed',
    '--print-passed',
    '--communication-verified',
    '--no-release-blockers'
  ]) requireFlag(flag);

  if (exec('git', ['branch', '--show-current']) !== 'main') throw new Error('release tags may be created only from main');
  if (exec('git', ['status', '--porcelain'])) throw new Error('working tree must be clean');
  exec('git', ['fetch', 'origin', 'main', '--tags']);
  const head = exec('git', ['rev-parse', 'HEAD']);
  if (head !== exec('git', ['rev-parse', 'origin/main'])) throw new Error('local main is not synchronized with origin/main');

  const { manifest } = await runValidation({ silent: true });
  const records = Object.values(canonicalRecordGroups(manifest)).flat();
  const conflicted = records.filter(record => record.verification_status === 'conflicted');
  if (conflicted.length) throw new Error('conflicted canonical records block release');
  const pending = records.filter(record => record.verification_status === 'pending_external_verification');
  if (pending.length && !process.argv.includes('--scoped-holds-omitted')) {
    throw new Error('pending scoped holds require explicit --scoped-holds-omitted confirmation');
  }

  for (const script of ['check:repository', 'check:data', 'check:manifest', 'check:provenance', 'check:privacy', 'check:safety']) {
    exec('npm', ['run', script], { inherit: true });
  }

  const releaseManifest = JSON.parse(await readFile(resolve(repoRoot, releaseManifestPath), 'utf8'));
  const hash = await manifestSha256();
  if (releaseManifest.version !== version) throw new Error('release manifest version mismatch');
  if (releaseManifest.source_commit !== head) throw new Error('release manifest source_commit mismatch');
  if (releaseManifest.canonical_manifest_sha256 !== hash) throw new Error('release manifest canonical hash mismatch');
  if (!releaseManifest.rollback_target || !releaseManifest.artifact_checksums) throw new Error('release manifest lacks rollback target or artifact checksums');

  const repo = JSON.parse(exec('gh', ['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
  const checks = JSON.parse(exec('gh', ['api', 'repos/' + repo + '/commits/' + head + '/check-runs']));
  const ci = checks.check_runs.find(check => check.name === 'Validate repository');
  if (!ci || ci.conclusion !== 'success') throw new Error('validated main CI is not successful for ' + head);

  try {
    exec('git', ['rev-parse', '--verify', 'refs/tags/' + version]);
    throw new Error('tag already exists locally: ' + version);
  } catch (error) {
    if (!String(error.stderr || '').includes('Needed a single revision')) throw error;
  }

  exec('git', ['tag', '-a', version, '-m', 'Mountain Guide Companion field release ' + version], { inherit: true });
  exec('git', ['push', 'origin', version], { inherit: true });
  console.log('release_tag=' + version);
  console.log('release_target=' + head);
  console.log('remote_tag=' + exec('git', ['ls-remote', '--tags', 'origin', 'refs/tags/' + version]));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
