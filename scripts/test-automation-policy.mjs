import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const policyScript = resolve(repoRoot, 'scripts/check-pr-policy.mjs');

function runPolicy({ branch = 'feature/policy-test', labels = [] } = {}) {
  return spawnSync(process.execPath, [policyScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PR_BASE_REF: 'main',
      PR_DRAFT: 'false',
      PR_HEAD_REF: branch,
      PR_LABELS_JSON: JSON.stringify(labels)
    }
  });
}

function requirePass(result, context) {
  if (result.status !== 0) throw new Error(context + ' should pass:\n' + result.stderr);
}

function requireFail(result, context) {
  if (result.status === 0) throw new Error(context + ' should fail closed');
}

requirePass(runPolicy(), 'approved feature branch');
requirePass(runPolicy({ branch: 'fix/policy-test' }), 'approved fix branch');
requirePass(runPolicy({ branch: 'docs/policy-test' }), 'approved docs branch');
requirePass(runPolicy({ branch: 'automation/policy-test' }), 'approved automation branch');
requireFail(runPolicy({ branch: 'release/policy-test' }), 'unapproved branch prefix');

for (const label of [
  'human-review-required',
  'release-hold',
  'data-conflict',
  'privacy-hold',
  'safety-hold'
]) {
  requireFail(runPolicy({ labels: [label] }), 'human-review label ' + label);
}

console.log('automation_policy_tests=pass');
console.log('approved_prefix_cases=4');
console.log('blocked_prefix_cases=1');
console.log('blocked_label_cases=5');
