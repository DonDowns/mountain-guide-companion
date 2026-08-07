# Repository Automation

## Normal development workflow

After the Phase 1B bootstrap, routine development is repository-local and hands-off:

1. Synchronize clean `main` with `origin/main` using fast-forward-only Git operations.
2. Create a branch using `feature/`, `fix/`, `docs/`, or `automation/`.
3. Make the scoped change and run all local contracts.
4. Commit with an ordinary non-rewritten commit.
5. Run `npm run pr:open -- --title "Title" --purpose "Purpose"`.
6. The helper validates, pushes, creates the PR body, checks the hold policy, and enables native auto-merge.
7. GitHub requires both `Validate repository` and `Auto-merge eligibility` on an up-to-date branch.
8. Run `npm run main:sync -- --pr <number-or-url>` to wait, classify failures, fast-forward local `main`, and revalidate it.

The helper-generated PR body includes purpose, changed files, validation, manifest hash, offline bundle identity/size/checksum, browser/offline results, privacy and safety results, release holds, runtime scope, and physical-test disposition. Phase 5 adds the generated offline build, integrity/worker/transaction contracts, and adversarial browser matrix to both PR opening and post-merge main synchronization.

## Merge policy and protected holds

Native GitHub auto-merge never bypasses branch protection. A PR is eligible only when:

- its head uses an approved project prefix;
- it is not a draft;
- all required checks pass against current `main`;
- GitHub reports no conflict;
- none of the human-review labels in `.github/automation-policy.json` is present;
- no release-hold marker file is tracked;
- no canonical record is `conflicted`;
- every pending canonical record is an explicitly approved scoped hold; and
- privacy and safety validators pass without warning.

The approved Lily Lake pending record is drafting-compatible only when the coordinate/elevation is omitted or visibly withheld. It is not permission to print a secondary value or make an emergency-location claim.

`main` requires pull requests, current required checks, and resolved conversations. Protection includes administrators, disables force pushes and deletion, and permits an administrator to edit the rule for a genuine emergency repair rather than permanently locking out the owner.

## Test failure versus GitHub infrastructure failure

`scripts/sync-main.mjs` treats a failed validator or policy check as a test failure and stops for human review. It classifies runner startup failure, an unacquired runner, GitHub internal-server failure, and pre-test artifact/Pages infrastructure failure separately.

An identified infrastructure failure receives one automatic failed-run retry. A second infrastructure failure becomes an infrastructure hold. Application failures are never automatically rerun, and the helper never loops indefinitely.

## Field-release tagging

Routine merges are automatic; field-release tags are not. No tag is created during Phase 1B.

Future tagging uses `npm run release:tag` with a version, complete release manifest, and explicit flags confirming owner approval, physical testing on both iPhones, print validation, communication verification, no blockers, and omission of any approved scoped hold from artifacts that do not require it.

The helper verifies clean synchronized `main`, successful CI on the exact commit, all local contracts, canonical hash parity, artifact checksums, rollback target, and tag nonexistence before creating and pushing an annotated tag.

## Future GitHub Pages deployment

Phase 1B does not enable Pages, create a CNAME, or add runtime assets. When Phase 4 creates the PWA, add a Pages workflow that:

- runs only for a successful `CI` workflow on `main` or a separately approved release event;
- rebuilds from the exact validated commit rather than an arbitrary branch tip;
- reruns runtime, parity, privacy, safety, staleness, and offline contracts;
- uploads one immutable Pages artifact and deploys through the GitHub Pages environment;
- treats Pages backend or artifact-service failure as infrastructure, with one bounded retry; and
- configures no custom domain until the owner separately chooses and verifies one.

Candidate domains remain `companion.vondadowns.com` and `fieldguide.vondadowns.com`; neither is configured in this phase.

## Bootstrap sequence

The repository began with Phase 0 on `main` and Phase 1 on a feature branch. A narrow CI prerequisite was added to the Phase 1 branch so the canonical dataset could pass hosted validation before merge. Phase 1 then merged first. This automation branch was created from that updated `main`, preserving Phase 0 → Phase 1 → automation history and preventing the bootstrap from omitting canonical data.

## Workflow smoke-test record

On 2026-08-07, the Phase 1B closeout used a documentation-only `automation/workflow-smoke-test` branch to exercise local validation, commit, push, helper-generated pull request, both required hosted checks, native auto-merge, fast-forward-only `main` synchronization, and final clean-tree validation. This durable record replaces a disposable marker file and adds no application fact or runtime behavior.
