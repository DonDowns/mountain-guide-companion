# Companion Offline Architecture

## Status and boundary

Phase 5 implements the Companion's zero-connectivity runtime architecture. Phase 6 publishes that exact architecture as `0.6.0-candidate.1` for physical testing. Candidate deployment is not a tag or field release. Automated browser evidence remains technical evidence only; physical iPhone installation, force-quit, reboot, Airplane Mode, PDF, readability, and second-person tests remain release gates.

The configured origin is `https://companion.vondadowns.com/`. The Companion service worker registers at `./service-worker.js` with scope `./`, can control only its own origin and path scope, and cannot control the separate `https://mountainguide.vondadowns.com/` origin.

## Generated bundle and identity

`npm run build:pwa` derives runtime data and candidate release metadata from the canonical manifest. `npm run build:offline` then hashes the actual required files and generates:

- `offline-bundle.json`, the explicit resource inventory;
- `service-worker.js`, the production worker with the exact bundle identity, metadata, resource list, and expected offline-manifest hash embedded.

The deterministic bundle identifier combines the Companion version, the canonical manifest fingerprint, and the offline-bundle version. Cache instance names add a bounded nonce only to distinguish a repair or retry of the same bundle. Ambiguous names such as `cache-v1` are not used.

The explicit field bundle contains the application HTML, CSS, local bootstrap, generated canonical data, state/install/UI/controller modules, web manifest, both local icons, exact canonical trip manifest, Field Guide PDF, Pocket Card PDF, and final `release.json`. `offline-bundle.json` and `service-worker.js` are deliberately outside their own resource list to avoid circular hashing. The worker verifies the offline-manifest file before downloading resources and stores its verified identity and SHA-256 in the cache completion marker.

Each resource record includes its package-relative path, SHA-256, byte size, and role. The bundle also records Companion version, data version, source release, source commit, canonical-manifest SHA-256, generated time, bundle ID, bundle version, entry count, total bytes, PDF bytes, and a content checksum over bundle identity plus required resource records. Hashes are generated from actual bytes and are never maintained by hand.

## Atomic install transaction

Installation is marker-last and fail-closed:

1. Fetch `offline-bundle.json` without using an HTTP cache.
2. Verify its exact SHA-256 against the value embedded in the worker.
3. Validate bundle identity, canonical identity, resource metadata, expected count, and paths.
4. Create a candidate cache in the unique `ddmg-companion-release-` namespace.
5. Fetch each required response and reject non-OK responses.
6. Verify each response byte size and SHA-256 with Web Crypto before caching it.
7. Write a synthetic `__ddmg_complete__.json` marker only after all required responses are cached.
8. Re-read and verify the complete candidate cache.

Any fetch, response, hash, count, identity, cache-write, or quota failure rejects installation and removes only that incomplete candidate. A previously active complete release is left untouched. The install handler never calls `skipWaiting`.

## Activation, retention, and rollback

Activation re-verifies the current bundle before claiming clients. Only then does cleanup run. The retention policy keeps at most two complete Companion caches: the newest complete cache for the current bundle and the newest complete cache for one distinct prior bundle. Incomplete or obsolete caches in the Companion namespace are removed after a successful activation. Unrelated cache namespaces are never enumerated for deletion.

The last known-complete release therefore remains operational while a candidate downloads and verifies. A verified update waits for an explicit Restart to use update action. If the candidate fails, the existing worker and release continue. Rollback in this phase is the retained prior complete cache behavior; release-level rollback to a tagged package remains a later gate.

## Deterministic fetch behavior

The worker handles only same-origin requests within its own scope. Field-critical resolution is active-cache-only:

| Request | Resolution |
| --- | --- |
| navigation and root HTML | verified active cache's `index.html` |
| JavaScript and CSS | exact listed response in the verified active cache |
| web manifest and icons | exact listed response in the verified active cache |
| canonical trip data and generated runtime data | exact listed response in the verified active cache |
| `release.json` | exact listed response in the verified active cache |
| Field Guide and Pocket Card PDFs | exact listed response in the verified active cache |

If a listed response is missing, the worker returns a local 503 response instead of using the network. It never substitutes a network response into an active release. Unlisted requests are not intercepted. Normal field use therefore cannot mix old and new shell, code, styling, data, metadata, or PDFs.

Network access is used only for browser-managed update discovery and explicit repair while connected. There is no polling loop, live weather, API, CDN, remote font, analytics, authentication, map tile, telemetry, or remote release-metadata dependency.

## Offline Check and repair

Offline Check sends `VERIFY_OFFLINE_BUNDLE` to the controlling production worker. The worker verifies:

- active bundle and cache identity;
- completion marker and expected resource count;
- every required response's byte size and SHA-256;
- release metadata and canonical data identity;
- data version, source release, source commit, and canonical-manifest hash;
- parseable canonical data with all six public emergency numbers;
- Timeline, Route, and Emergency runtime resources;
- both local PDFs;
- absence of a mixed release identity.

The application also confirms that Timeline, Route, and Emergency rendered from the packaged data. Success is reported only as `OFFLINE RESOURCES VERIFIED`; any discrepancy is `OFFLINE RESOURCES INCOMPLETE`. Both are followed by the boundary: “This verifies local Companion resources only. It does not verify mountain conditions, access, weather, or route safety.”

Repair Offline Copy is an explicit connected action. It requests an update, builds and verifies a fresh same-bundle cache, changes the selected active cache only after completion, and reruns Offline Check. Repair never clears or migrates device-local operational/private state.

## Update and local-state isolation

Update discovery is separate from current field operation. Neutral UI may say New Companion version available, Update downloaded, or Restart to use update. It does not call the installed release unsafe and there is no revocation mechanism.

The version-2 local-state schema contains selected objective, actual starts, milestone checks, Red Display, local status, bounded optional private fields, and setup evidence. Migration from schema version 1 preserves those values but does not promote the former structural check into a Phase 5 offline verification. Offline verification is recorded against the exact installed bundle ID. A service-worker update or cache repair does not read, serialize, cache, log, transmit, or delete local state.

Red Display is applied by a synchronous local bootstrap and remains presentation-only. Emergency content, the 911-first instruction, reporting prompts, dispatch guidance, and six public agency numbers are packaged locally. Telephone links can open a dial intent; the Companion never claims that a call succeeded or rescue was activated.

## Storage assumptions and failures

The setup surface reports `navigator.storage.estimate()` when supported and labels it as an estimate. Browser persistence is not guaranteed, and Phase 5 does not request persistent storage. The current build report records exact bundle size, PDF contribution, and largest resources.

Logic and browser failure tests cover missing JavaScript, missing canonical data, missing PDFs, wrong release identity, integrity corruption, and simulated low-storage/quota failure. Each case fails the candidate, preserves the prior complete release, and avoids a partial completion marker.

## Automated evidence and limits

Chromium desktop and 390×844 tests cover online install, verified Offline Check, offline reload, new-page cold launch, persisted-profile browser close/reopen, Timeline, Route, Emergency, Red restoration, both PDFs, zero field-critical server requests, update interruption, previous-to-new activation, corrupt caches, repair, local-state preservation, and bounded cleanup.

Playwright WebKit remains in the normal desktop and 390×844 runtime/accessibility matrix. Its service-worker-controlled offline navigation currently terminates with a Playwright WebKit internal error, so that scenario is recorded as a browser-engine/test-infrastructure limitation rather than a pass. Chromium coverage is not weakened.

## Physical-device checklist still required

Run this checklist separately on the primary iPhone, backup iPhone, and at least one friend/second-person iPhone if available. Candidate deployment does not mark any item passed:

1. Install from Safari with Add to Home Screen.
2. Open once while connected and complete Offline Check.
3. Force quit the Companion.
4. Turn on Airplane Mode and ensure Wi-Fi is off.
5. Cold relaunch from the Home Screen.
6. Open Timeline, Route, and Emergency.
7. Verify Red Display and both PDFs.
8. Verify actual-start, milestone, and private-data persistence.
9. Reboot and cold relaunch offline.
10. Exercise a previous-release update and interrupted update/recovery where practical.
11. Record device model, OS/browser version, storage state, screenshots/notes, and second-person observations.

The in-app Airplane Mode test mark is a local user attestation only. It is offered only after the eleven-step instruction list is displayed and is never set by automation.
