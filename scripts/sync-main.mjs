import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');

function exec(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe']
  })?.trim();
}

function option(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function sleep(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

function runIdFrom(check) {
  return check.detailsUrl?.match(/\/actions\/runs\/(\d+)/)?.[1] || '';
}

function infrastructureFailure(repo, checks) {
  for (const check of checks) {
    if (['STARTUP_FAILURE', 'STALE'].includes(check.conclusion)) return { check, runId: runIdFrom(check) };
    const runId = runIdFrom(check);
    if (!runId || !['FAILURE', 'CANCELLED'].includes(check.conclusion)) continue;
    try {
      const run = JSON.parse(exec('gh', ['run', 'view', runId, '--repo', repo, '--json', 'conclusion,jobs,status']));
      if (!run.jobs?.length || run.jobs.every(job => !job.startedAt)) return { check, runId };
      let logs = '';
      try {
        logs = exec('gh', ['run', 'view', runId, '--repo', repo, '--log-failed']);
      } catch (error) {
        logs = String(error.stderr || error.message);
      }
      if (/runner was not acquired|failed to acquire|internal server error|artifact service|pages backend/i.test(logs)) {
        return { check, runId };
      }
    } catch {
      // If GitHub cannot return run metadata, report the check as a test failure rather than guessing.
    }
  }
  return null;
}

async function main() {
  const pr = option('--pr');
  const timeoutSeconds = Number(option('--timeout-seconds', '1800'));
  const pollSeconds = Number(option('--poll-seconds', '15'));
  if (!pr) throw new Error('Usage: npm run main:sync -- --pr <number-or-url>');
  if (exec('git', ['status', '--porcelain'])) throw new Error('working tree must be clean before synchronizing main');
  const repo = JSON.parse(exec('gh', ['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
  const deadline = Date.now() + timeoutSeconds * 1000;
  let infrastructureRetryUsed = false;

  while (Date.now() < deadline) {
    const view = JSON.parse(exec('gh', [
      'pr', 'view', pr, '--repo', repo,
      '--json', 'state,mergeStateStatus,mergedAt,mergeCommit,statusCheckRollup,url'
    ]));
    if (view.state === 'MERGED') {
      console.log('pull_request_merged=' + view.url);
      console.log('merge_commit=' + view.mergeCommit.oid);
      break;
    }
    if (view.state === 'CLOSED') throw new Error('pull request closed without merging: ' + view.url);

    const completedFailures = view.statusCheckRollup.filter(check =>
      check.status === 'COMPLETED' && check.conclusion && !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(check.conclusion)
    );
    if (completedFailures.length) {
      const infrastructure = infrastructureFailure(repo, completedFailures);
      if (infrastructure && !infrastructureRetryUsed && infrastructure.runId) {
        console.log('github_infrastructure_failure=' + infrastructure.check.name);
        console.log('infrastructure_retry=1_of_1');
        exec('gh', ['run', 'rerun', infrastructure.runId, '--repo', repo, '--failed'], { inherit: true });
        infrastructureRetryUsed = true;
        await sleep(pollSeconds * 1000);
        continue;
      }
      if (infrastructure) throw new Error('GitHub infrastructure hold after one bounded retry: ' + infrastructure.check.name);
      throw new Error('validation or policy failure requires human review: ' + completedFailures.map(check => check.name).join(', '));
    }

    console.log('waiting_for_merge=' + view.mergeStateStatus);
    await sleep(pollSeconds * 1000);
  }

  const finalView = JSON.parse(exec('gh', ['pr', 'view', pr, '--repo', repo, '--json', 'state,url']));
  if (finalView.state !== 'MERGED') throw new Error('timed out waiting for pull request merge: ' + finalView.url);

  exec('git', ['fetch', '--prune', 'origin'], { inherit: true });
  exec('git', ['switch', 'main'], { inherit: true });
  exec('git', ['pull', '--ff-only', 'origin', 'main'], { inherit: true });
  exec('npm', ['ci'], { inherit: true });
  for (const script of [
    'check:repository', 'check:data', 'check:manifest', 'check:provenance', 'check:privacy', 'check:safety',
    'build:field-guide', 'check:field-guide', 'check:pdf',
    'build:pocket-card', 'check:pocket-card', 'check:pocket-card-pdf',
    'build:pwa', 'build:offline', 'check:pwa', 'check:pwa:privacy', 'check:pwa:safety', 'check:artifact-parity',
    'check:offline', 'check:service-worker', 'test:offline:logic', 'test:browser', 'test:offline'
  ]) {
    exec('npm', ['run', script], { inherit: true });
  }
  exec('npm', ['run', 'check:policy', '--', '--repository-only'], { inherit: true });
  if (exec('git', ['status', '--porcelain'])) throw new Error('working tree is not clean after main synchronization');
  console.log('main_head=' + exec('git', ['rev-parse', 'HEAD']));
  console.log('working_tree=clean');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
