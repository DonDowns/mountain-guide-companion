import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalRecordGroups, loadManifest } from './validate-manifest.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), '..');
const repositoryOnly = process.argv.includes('--repository-only');

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function parseLabels(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(',').map(label => label.trim()).filter(Boolean);
  }
}

async function main() {
  const policy = JSON.parse(await readFile(resolve(repoRoot, '.github/automation-policy.json'), 'utf8'));
  const manifest = await loadManifest();
  const errors = [];

  if (!repositoryOnly) {
    const branch = process.env.PR_HEAD_REF || git(['branch', '--show-current']);
    const base = process.env.PR_BASE_REF || 'main';
    const labels = new Set(parseLabels(process.env.PR_LABELS_JSON));

    if (base !== 'main') errors.push('automatic merge is allowed only into main');
    if (!policy.approved_branch_prefixes.some(prefix => branch.startsWith(prefix))) {
      errors.push('branch ' + branch + ' does not use an approved project prefix');
    }
    if (process.env.PR_DRAFT === 'true') errors.push('draft pull requests require human review before auto-merge');
    for (const label of policy.human_review_labels) {
      if (labels.has(label)) errors.push('pull request has human-review label ' + label);
    }
  }

  const trackedFiles = new Set(git(['ls-files']).split('\n').filter(Boolean));
  for (const marker of policy.release_hold_markers) {
    if (trackedFiles.has(marker)) errors.push('repository contains release-hold marker ' + marker);
  }

  const records = Object.values(canonicalRecordGroups(manifest)).flat();
  const conflicted = records.filter(record => record.verification_status === 'conflicted');
  if (conflicted.length) errors.push('conflicted canonical records: ' + conflicted.map(record => record.id).join(', '));

  const approvedHoldIds = new Set(policy.approved_scoped_holds.map(hold => hold.canonical_record_id));
  const pending = records.filter(record => record.verification_status === 'pending_external_verification');
  const unapprovedPending = pending.filter(record => !approvedHoldIds.has(record.id));
  if (unapprovedPending.length) errors.push('new unresolved release blockers: ' + unapprovedPending.map(record => record.id).join(', '));

  const missingApprovedHolds = policy.approved_scoped_holds.filter(hold => {
    const record = pending.find(candidate => candidate.id === hold.canonical_record_id);
    return record && hold.drafting_allowed_when_omitted_or_visibly_withheld !== true;
  });
  if (missingApprovedHolds.length) errors.push('approved scoped hold is missing drafting safeguards');
  if (manifest.metadata.external_verification_hold && pending.length === 0) {
    errors.push('external_verification_hold is true without a pending canonical record');
  }

  const requiredChecks = new Set(policy.required_status_checks);
  for (const required of ['Validate repository', 'Auto-merge eligibility']) {
    if (!requiredChecks.has(required)) errors.push('automation policy omits required status check ' + required);
  }

  if (errors.length) throw new Error('Auto-merge policy check failed:\n- ' + errors.join('\n- '));

  console.log('auto_merge_policy=pass');
  console.log('conflicted_records=0');
  console.log('unapproved_release_blockers=0');
  console.log('approved_scoped_holds=' + pending.length);
  if (!repositoryOnly) console.log('approved_branch=' + (process.env.PR_HEAD_REF || git(['branch', '--show-current'])));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
