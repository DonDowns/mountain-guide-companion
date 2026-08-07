# Verification and Release Plan

## Purpose

This plan defines the evidence required to move the Companion from implemented drafts through a tagged field release. It does not authorize publication or deployment.

Automation detects repeatable defects. It never replaces physical iPhone, print, waterproofing, communication-path, or second-person field-use tests.

## Quality-gate model

| Gate | Question | Minimum evidence | Stop condition |
| --- | --- | --- | --- |
| V0 — Architecture | Is the product boundary coherent and safe to implement? | Approved Phase 0 documents; contradictions/risks resolved or explicitly accepted. | Competing source authority, private-data ambiguity, runtime work requested before approval. |
| V1 — Canonical data | Are structure, facts, provenance, privacy, and versions valid? | Schema tests, source coverage, semantic diff, privacy review, owner verification. | Fabricated/unverified fact, missing source, private value, unclear planning-target semantics. |
| V2 — Physical artifacts | Do print/card outputs preserve required facts and readability? | Deterministic generation, parity checks, actual-size print/headlamp/glove/waterproof tests. | Overflow, missing emergency prompt, inconsistent fact/version, illegible critical content. |
| V3 — PWA shell | Does the interaction model work accessibly at target viewports? | Browser/accessibility tests, no-network static analysis, target-device review. | Critical control unreachable, authorization implication, network-dependent core path. |
| V4 — Offline hardening | Does one complete release survive field failures and upgrades? | Airplane/force-quit/reboot/cold-launch/update-interruption evidence on both phones. | Mixed-version activation, blocked offline emergency, prior complete release lost. |
| V5 — Release candidate | Do all artifacts and contracts agree? | Contracts A–I, checksums, browser/print/physical evidence, adversarial review. | Any open critical/high finding or artifact disagreement. |
| V6 — Owner release | Is the candidate approved, tagged, recoverable, and ready? | Owner approval, main merge approval, ordinary annotated tag, release manifest, rollback drill. | No approval, no rollback, wrong source/data version, unreviewed private artifact. |

## Required consistency contracts

### Contract A — Schema Completeness

**Invariant:** Required canonical fields exist, validate, and have release-level completeness.

Future tests:

- validate against the pinned JSON Schema version;
- reject additional properties;
- verify semantic versions, dates, times, timestamps, Git SHA, URLs, IDs, enums, and numeric ranges;
- verify unique IDs and referential integrity;
- require one primary objective and planning-time semantics;
- distinguish draft-allowed empty arrays from release minimums;
- reject missing provenance on fact-bearing objects.

### Contract B — Artifact Parity

**Invariant:** One canonical public manifest is authoritative. Field Guide, Pocket Card, and PWA may use different representations, but they derive public facts from that manifest and identify the same manifest hash.

Future tests:

- record canonical manifest SHA-256 in each build;
- compare every public value/string to its manifest path;
- reject artifact-owned public fact constants;
- verify all artifacts expose or record the same data_version, source_release, source_commit, manifest SHA-256, and verified_at;
- generate twice and compare deterministic outputs, allowing only explicitly normalized metadata;
- semantic diff each artifact against the previous release.

### Contract C — Source Provenance

**Invariant:** Every artifact identifies the canonical data and its sources through durable, semantically meaningful provenance.

Future tests:

- require Mountain Guide v15.3.10 and exact commit for the initial dataset;
- resolve every source_record_id;
- require upstream project/repository, release, commit, repository-relative path, and semantic record/field/section locators when applicable;
- treat line ranges as optional supplemental navigation, never as the sole source locator;
- require official source/retrieval/verification dates for public contacts and route facts;
- require verification date, status, method, and public-safe notes;
- require owner-decision classification for planned times;
- visually verify provenance on every print page, card side, and relevant PWA screen.

### Contract D — Zero-Dependency Field Runtime

**Invariant:** From the trailhead onward, all field-critical functions work with zero connectivity and no external data transfer.

Future tests:

- static scan for runtime remote dependencies;
- reject field-critical DNS, live-weather, GitHub, map-tile, remote-font, CDN, analytics, authentication, external-API, fetch, and equivalent network dependencies;
- intercept/fail all network and run Timeline, Route, Decision prompts, Emergency, communication protocol, provenance, and display-mode flows;
- cold launch from installed assets after force quit;
- reboot and launch in Airplane Mode;
- confirm no network timeout blocks rendering;
- confirm optional refresh failure leaves the complete installed version operational;
- test on primary and backup iPhones.

### Contract E — Privacy

**Invariant:** No private value enters source control, public build, logs, screenshots, fixtures, or release archives.

Future tests:

- allowlist canonical fields and reject private-key names;
- secret scanning and repository-history scanning;
- phone/email/identifier review;
- scan generated PDFs, metadata, source maps, logs, screenshots, and caches;
- prove public generators cannot import local private storage;
- verify private print templates contain blanks only and the initial procedure is handwriting/outside-repository only;
- reject an automated or encrypted private-print pipeline in the initial release;
- human publication-intent review.

### Contract F — Safety Language

**Invariant:** No route authorization, all-clear, safe-to-go, false rescue/delivery confirmation, or false-current language appears.

Future tests:

- exact/variant banned-phrase scan;
- structured review of labels, icons, colors, badges, scores, sounds, and completion states;
- assert decision prompts do not return an aggregate verdict;
- require Weather is evidence, not permission and actual-conditions language;
- require user-defined planning-target label for 11:30;
- require dispatch-context language;
- second-person semantic review.

### Contract G — Staleness

**Invariant:** Cached and printed artifacts expose version and age clearly.

Future tests:

- assert data version, generated time, and last-verified time on all artifacts;
- assert the PWA says installed version, not current version, when offline;
- simulate review-after crossing if an owner-approved policy exists;
- compare old print/new PWA and require visible mismatch;
- ensure failed update does not alter provenance of the installed release;
- test wrong device clock labels/behavior.
- verify canonical America/Denver, 4:15 AM, and 11:30 AM planning facts survive reload/reboot unchanged while actual-start/elapsed state stays local and clock uncertainty remains visible.

### Contract H — Emergency Integrity

**Invariant:** 911-first guidance and exact-location reporting remain complete and immediate.

Future tests:

- require CALL 911 FIRST;
- require location, mountain, route, elevation, coordinates-if-available, injuries, party size, and weather/conditions prompts;
- assert Emergency is one primary action away and available offline;
- assert public contacts are verified and dated;
- assert no jurisdiction monopoly claim;
- assert drafts and handoffs do not claim sent/rescue/help;
- verify both display modes and physical artifacts.

### Contract I — Touch/Visibility

**Invariant:** Critical controls are reachable, readable, and unclipped at target iPhone viewports and in physical conditions.

Future tests:

- critical 56 × 56 and secondary 48 × 48 target geometry;
- spacing and overlap checks;
- 390 × 844 minimum automated reference viewport and confirmed target-iPhone viewports;
- confirm the automated reference does not substitute for physical tests on the identified primary and backup iPhones;
- portrait, landscape, safe-area, and increased-text checks;
- no page-level horizontal overflow;
- Daylight/Red contrast and non-color meaning;
- keyboard/switch semantics and accessible names;
- physical glove, wet-finger, sunlight, darkness, and headlamp tests.

## Static validation

Run on every implementation branch:

- Markdown/style/link checks for governance docs;
- file allowlist during Phase 0;
- schema lint and canonical instance validation from Phase 1 onward;
- prohibited file/private data scan;
- source release/commit pin check;
- durable source-locator and verification-status checks;
- unsafe-language scan;
- runtime remote-URL/import scan;
- public-fact duplicate scan outside the manifest;
- generated-artifact reproducibility check;
- package manifest/checksum verification.

Static checks fail closed but do not establish factual correctness.

## Schema and data tests

### Positive tests

- minimum valid draft;
- complete initial trip candidate;
- source records for owner decisions and pinned upstream facts;
- route object with verified uncertainty;
- public contact with contextual jurisdiction;
- planning target with mandatory non-safety note.

### Negative tests

- unknown field;
- private contact/medical/device field;
- malformed release/commit/version/timestamp;
- missing source;
- repository source missing project/repository/path/semantic locator, or using a line range as its only locator;
- unresolved waypoint/segment/decision reference;
- duplicate ID;
- out-of-range coordinate;
- route alternative without verification/uncertainty;
- turnaround target labeled as a safety cutoff;
- contact without verified_at;
- authorization/rescue/delivery claim;
- needs-reverification critical fact in a release candidate.

### Semantic diff

Every candidate produces a machine-readable and human-readable diff:

- added/removed/changed public fact;
- changed source/provenance;
- changed verification time;
- changed objective/route/timing/contact;
- affected artifacts and required physical re-test.

## Browser tests

Later browser automation covers:

- first launch and normal navigation;
- Timeline current/next/decision hierarchy;
- manual phase selection and elapsed-time confirmation;
- Route verified/uncertainty presentation;
- Emergency one-action access from every screen;
- Daylight/Red one-tap persistent state;
- no color-only meaning;
- communication draft — not sent semantics;
- unavailable private-data state;
- canonical provenance and installed-version display;
- storage corruption/incompatibility surface;
- increased text and reduced motion;
- 390 × 844 minimum automated reference, target iPhone, and representative desktop/backup viewports;
- portrait/landscape/safe-area simulations;
- no clipped critical text/control and no unintended horizontal overflow;
- console/network error review.

Browser automation cannot certify outdoor readability, glove operation, waterproofing, or second-person comprehension.

## Offline test matrix

| Scenario | Procedure | Pass criterion |
| --- | --- | --- |
| No network after install | Install candidate, enable Airplane Mode, navigate all core flows. | No blocked/empty core flow and no network timeout gate. |
| Force quit | In Airplane Mode, force quit and cold launch. | Complete installed shell/data and emergency open immediately. |
| Reboot | Reboot phone in Airplane Mode, launch from icon. | Same complete installed release; no prior online session required. |
| Backup phone | Provision separately, repeat offline cold launch. | Independent operation; private data absence is explicit. |
| Storage pressure/eviction | Simulate supported cache/storage loss conditions. | Product reports unavailable/incomplete rather than showing partial facts; physical fallback is documented. |
| Optional refresh failure | Attempt pre-departure refresh with blocked/flaky network. | Installed complete release remains intact and version unchanged. |
| Wrong device clock | Set incorrect time/date where feasible. | Device time is labeled; phase requires confirmation; provenance remains embedded. |
| Location denied | Deny permission/offline. | Emergency reporting prompts work and no location is invented. |

## Service-worker upgrade tests

The release shell, canonical dataset, and critical assets form one atomic compatibility unit.

Test:

1. old complete release → successful new complete release;
2. old complete release → interrupted new download;
3. old complete release → corrupt new asset;
4. compatible shell-only patch;
5. incompatible schema/data change;
6. skip one or more releases;
7. browser closed during install/activate;
8. device offline before activation;
9. low storage during update;
10. cache contains an unrelated/older same-named asset.

Pass criteria:

- the old complete release remains usable until the new set verifies;
- no mixed-version shell/data becomes active;
- provenance matches active bytes;
- failed candidates are not labeled installed;
- update retry is optional and does not block field use;
- rollback to the last complete tagged release is documented.

Prefer content-hashed or versioned runtime asset URLs and a release manifest over relying only on a cache-name change.

## Artifact parity tests

For each canonical fact:

- map manifest path → Field Guide location → Pocket Card location, if in its allowlist → PWA location;
- verify exact semantic equivalence after approved formatting;
- ensure no artifact adds a route/contact/time fact;
- ensure omission is intentional and matrix-approved;
- ensure each representation exposes or records the same data_version, source_release, source_commit, manifest SHA-256, and verified_at;
- prove every representation references the same authoritative manifest hash;
- compare generated artifacts with the previous release for unexpected drift.

An artifact matrix and generated traceability report are release evidence.

## Privacy tests

- tracked-file and full-history secret scan before public release;
- canonical-schema allowlist;
- explicit forbidden-key scan;
- synthetic-fixture verification;
- PDF/image metadata review;
- screenshot/log/source-map scan;
- PWA storage inspection for namespace separation;
- clear-local-data flow;
- corrupt/missing private-data behavior;
- public build executed in an environment with no private directory access;
- attempted private-field injection into generators must fail;
- confirm the initial private-print procedure is handwriting/outside-repository only and excluded from release artifacts;
- reject automated/encrypted private-print handling and sophisticated personal-data overlays until separately approved after the trip.

## Safety-language tests

Maintain a centrally reviewed list of prohibited exact phrases and semantic patterns. Scan source, canonical data, generated text, accessibility labels, alt text, metadata, print output, and screenshots.

Manual adversarial review asks:

- Does any favorable color/icon imply permission?
- Does completing a checklist imply readiness or safety?
- Does a time target look like an official cutoff?
- Does an alternate route look automatically safer?
- Does lack of an alert look like all clear?
- Does a copy/handoff look like sent?
- Does a county/contact look exclusively responsible?
- Does a stale artifact look current?
- Does Red display look like emergency state?

Any yes/ambiguous answer blocks release.

## Print validation

### Automated

- Field Guide fixed US Letter geometry and exactly three pages with no overflow/clipping;
- Pocket Card exactly two portrait pages at 3.5 × 5 inches with no overflow/clipping;
- page-number/provenance stamp on every page;
- font-size and contrast threshold;
- no orphaned decision/emergency heading;
- all required Field Guide sections;
- pocket-card 3.5 × 5-inch geometry, side/order markers, and required emergency content;
- canonical-data traceability and PDF checksum;
- no private values in public outputs/metadata.

The Phase 2 Field Guide implements these checks through `npm run build:field-guide`, `npm run check:field-guide`, and `npm run check:pdf`. CI installs pinned Python print dependencies plus Poppler, rebuilds the committed HTML/PDF/artifact record, renders three color and three grayscale page images, and rejects generated byte drift. The generated HTML, PDF, and artifact record are source-controlled release artifacts; temporary renders are ignored until an approved stable visual baseline exists.

The Phase 3 Pocket Card implements `npm run build:pocket-card`, `npm run check:pocket-card`, and `npm run check:pocket-card-pdf`. CI proves exact two-side geometry, manifest/contact/milestone parity, empty private fields, Lily Lake omission, PDF checksum identity, 9.5-point essential text, and six color/grayscale/low-light renders. The generated Pocket Card HTML, PDF, and artifact record are source-controlled; verification renders remain ignored temporary evidence.

### Physical

- print at 100% actual size, not fit-to-page;
- measure page/card dimensions;
- test waterproof sleeve and/or waterproof printing;
- read at arm's length in daylight;
- read by headlamp in darkness;
- operate while wearing expected gloves;
- wet-finger handling;
- fold/lamination/sleeve edge and glare review;
- pocket extraction/orientation;
- second-person location of CALL 911 FIRST and reporting prompts;
- mark/rewrite handwritten private fields;
- compare version stamps with both phones.

## Physical iPhone validation checklist

Run on both the primary and backup iPhone:

- exact model, iOS version, browser/PWA engine, storage state, and battery health recorded;
- install from approved release;
- launch online once;
- Airplane Mode;
- force quit;
- offline cold launch;
- device reboot then offline cold launch;
- Timeline, Route, Emergency, communication protocol, provenance, and display-mode flows;
- Daylight display in direct sunlight;
- Red display in darkness and by headlamp;
- gloves;
- wet fingers/screen;
- one-handed portrait;
- landscape;
- safe areas/notch/home indicator;
- increased text, bold text, reduced motion, VoiceOver/switch/keyboard where applicable;
- battery-use observation over a representative static-use period;
- battery-below-critical posture;
- location permission denied;
- wrong device time;
- interrupted update;
- emergency screen from each location/state;
- private data absent/present/cleared/corrupt;
- actual communication path test with explicit draft/handoff/delivery distinctions;
- second-person usability without coaching.

Record evidence and defects. Automation is not a substitute.

## Release branching and tagging

1. Implementation occurs on named branches.
2. main becomes release-ready/production only once implementation begins.
3. No direct merge without explicit owner approval.
4. A release candidate includes all three public artifacts, source, tests, evidence, canonical data/schema, release manifest, and checksums.
5. Resolve findings on the branch; rerun all affected automated and physical tests.
6. Owner approves the exact commit and artifact hashes.
7. Merge by the approved method.
8. Create an annotated release tag with product, semantic version, canonical data version, schema version, source release/commit, and release-manifest hash.
9. Archive the release evidence and prior rollback target.
10. Do not silently replace tagged assets.

Tag naming should distinguish Companion releases from Mountain Guide releases, for example companion-v1.0.0, subject to owner approval.

Release tags are ordinary annotated Git tags. Cryptographic tag signing is outside the initial scope unless the owner approves it later.

## Release manifest

The release manifest records:

- Companion version and commit;
- schema and canonical data versions;
- canonical data SHA-256;
- pinned Mountain Guide source release/commit;
- generator versions;
- every artifact path, byte count, and SHA-256;
- automated test results;
- physical device/print validation record IDs;
- owner approval reference;
- release/tag time;
- rollback release/tag;
- public/private artifact classification;
- known limitations.

## Rollback strategy

Rollback means returning to the last complete, verified, tagged Companion release—not reconstructing files ad hoc.

Requirements:

- retain prior shell, canonical data, Field Guide, Pocket Card, manifest, checksums, and evidence;
- keep the last complete PWA caches until candidate activation succeeds;
- verify rollback package hashes before use;
- if a sophisticated device-local private overlay is approved after the trip, identify whether its migration is backward compatible;
- never roll private values into a public package;
- mark withdrawn/defective releases without deleting history;
- regenerate/replace physical artifacts if rollback changes public data;
- repeat offline cold-launch and artifact-parity checks after rollback.

Rollback triggers:

- mixed/incomplete PWA activation;
- critical privacy leak;
- unsafe/ambiguous language;
- incorrect emergency contact or route fact;
- artifact disagreement;
- offline cold-launch failure;
- critical physical-readability defect.

## Required release evidence

- approved product/data/privacy architecture;
- semantic canonical-data diff;
- source/provenance coverage report;
- Contracts A–I results;
- browser/accessibility/offline/service-worker logs;
- generated artifact parity trace;
- public/private scans;
- desktop/target-device screenshots where useful;
- primary and backup iPhone checklists;
- actual-size Field Guide and Pocket Card validation;
- waterproofing/headlamp/glove/wet-finger notes;
- communication-path test;
- second-person usability report;
- adversarial safety-language review;
- owner approval;
- release manifest/checksums/tag/rollback verification.

## Unresolved release-policy decisions

1. Exact target iPhone models, iOS versions, and minimum supported platform.
2. Exact CI provider and whether a public repository is approved.
3. Final tag naming; release tags are ordinary annotated tags and cryptographic signing is outside the initial scope.
4. Verification-age policy by data type.
5. Required contact/route completeness for first field release.
6. Who performs and signs independent second-person and source verification.
7. Post-trip decision on whether a sophisticated device-local private overlay is needed and, if approved, its security, provisioning, and rollback/migration policy.
8. PWA artifact storage/release packaging decisions; the Field Guide and Pocket Card PDFs are source-controlled generated release artifacts as of Phases 2 and 3.
