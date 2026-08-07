# Implementation Roadmap

## Roadmap principles

- Complete one governed phase before expanding scope.
- Do not implement around missing or unverified facts.
- Preserve the existing Mountain Guide repository and pinned source release.
- Keep public canonical data, device-local private data, and handwritten/print-time private data separate.
- Generate all public artifacts from one authoritative canonical manifest; representations may differ, but all record the same manifest hash and identity fields.
- Keep every field-critical path fully usable without network.
- Treat automated and physical validation as separate mandatory evidence.
- Stop rather than invent, silently degrade, or imply safety/authorization.

Complexity estimates are relative:

- **Low:** primarily bounded documentation/configuration.
- **Medium:** multiple representations or meaningful review/testing.
- **High:** cross-artifact logic, deterministic generation, accessibility, or data governance.
- **Very high:** offline lifecycle, device state, security/privacy, and physical field reliability.

## Phase summary

| Phase | Name | Relative complexity | Depends on |
| --- | --- | --- | --- |
| 0 | Product definition | Medium | Owner-supplied scope and source pin |
| 1 | Canonical data schema + verified initial dataset | High | Approved Phase 0 |
| 2 | Printable three-page Field Guide | High | Released candidate schema/data |
| 3 | Emergency Pocket Card | Medium–High | Released candidate schema/data and emergency content hierarchy |
| 4 | Companion PWA shell | High | Approved content architecture and generated artifacts |
| 5 | Offline/runtime hardening | Very high | Functional PWA shell |
| 6 | Automated testing and CI | High | Stable schema/generators/runtime interfaces |
| 7 | Physical field validation | Very high | Release candidate artifacts and target devices |
| 8 | Freeze/tag/release | Medium–High | All prior gates and owner approval |

## Phase 0 — Product definition

### Goal

Define a coherent, bounded, reviewable product and architecture without creating runtime files or production data.

### Deliverables

- README and standing AGENTS governance.
- Product specification.
- Artifact matrix.
- Canonical data architecture proposal.
- Privacy and safety model.
- Verification and release plan.
- Implementation roadmap.
- Repository hygiene rules.

### Dependencies

- Owner-supplied product purpose.
- Mountain Guide v15.3.10 source release and exact commit.
- Initial trip design context.

### Acceptance criteria

- Only the nine allowed documentation/governance files exist outside .git.
- No runtime, PDF, schema, manifest, or production data exists.
- Zero-connectivity, safety, privacy, provenance, staleness, emergency, failure, exclusion, and consistency requirements are explicit.
- The three Companion artifacts have distinct ownership and one public data source.
- Weaknesses and unresolved questions are documented.
- Existing Mountain Guide remains untouched.
- The approved architecture and closeout clarifications are captured in the repository's first baseline commit on main.

### Complexity

Medium: no software implementation, but significant cross-cutting safety, privacy, data, artifact, and offline semantics.

### Stop conditions

- Requirements conflict without a safe design interpretation.
- Source release/commit cannot be verified.
- Requested content requires invented trip facts.
- A private value is proposed for Git.
- Work expands into application/runtime files.

## Phase 1 — Canonical data schema + verified initial dataset

### Goal

Implement the public canonical data contract and populate the first verified, public-safe trip dataset without generating field artifacts.

### Deliverables

- data/trip-manifest.schema.json.
- data/trip-manifest.json.
- source-record convention and initial provenance records.
- validation scripts/tests.
- semantic data diff tooling.
- data-version and compatibility rules.
- public/privacy classification review.
- initial source-verification report.

### Dependencies

- Owner approval of Phase 0.
- Resolved schema/version decisions and the approved durable source-locator convention.
- Verified upstream facts from Mountain Guide v15.3.10 at the pinned commit.
- Official verification sources for any supplemental route/contact/weather reference.
- Canonical America/Denver timezone and owner decision on the remaining data-publication boundary.

### Acceptance criteria

- Contract A, C, E, F, G, and H data-level checks pass.
- Every fact has source coverage and verification status.
- No private values or private-like examples exist.
- 4:15 AM and 11:30 AM are labeled owner-defined planning values with mandatory safety notes.
- No route alternative/contact/jurisdiction fact is invented.
- Draft and release completeness rules are distinct.
- One canonical manifest is authoritative; every artifact will expose or record data_version, source_release, source_commit, manifest SHA-256, and verified_at, and parity tests will prove the shared hash.
- Owner reviews the exact public dataset.

### Complexity

High: factual verification, schema design, privacy classification, source traceability, and release semantics are tightly coupled.

### Stop conditions

- Missing/conflicting route or emergency facts.
- Unresolved publication intent.
- A required source is inaccessible or unverifiable.
- Schema permits private fields or unsafe states.
- Two artifacts would require independent public-fact copies.

## Phase 2 — Printable three-page Field Guide

### Goal

Create a deterministic, actual-size, approximately three-page US Letter Field Guide from the canonical public dataset.

### Deliverables

- Page 1 Operational Timeline + Decision Gates.
- Page 2 Route Profile + Junctions + Return/Descent Considerations.
- Page 3 Emergency + Communication Protocol.
- Deterministic print generator and presentation configuration.
- Public print output and checksums.
- Manifest-to-page traceability report.
- Print accessibility and physical test checklist/results.

### Dependencies

- Approved schema and initial dataset candidate.
- Verified timeline/route/emergency fields sufficient for print.
- Selected deterministic print/PDF tooling.
- Approved type, contrast, waterproofing/sleeve assumptions.

### Acceptance criteria

- Contract B, C, E, F, G, H, and print portions of I pass.
- Exactly the approved page organization fits at 100% US Letter size without clipping.
- Every page has provenance.
- Public facts trace only to the canonical dataset.
- Decision prompts imply no authorization.
- Route alternatives show source/status/date/uncertainty.
- Emergency page preserves 911-first hierarchy and location prompts.
- Actual print passes daylight, headlamp, glove, wet-hand, sleeve/waterproof, and second-person review.

### Complexity

High: fixed-page layout, readability, deterministic generation, and content hierarchy interact; a valid PDF is not enough.

### Stop conditions

- Font reduction below approved field minimum is needed to fit.
- A critical fact is omitted or duplicated outside canonical data.
- Page count/content order cannot meet field-readability requirements.
- Physical print, glare, waterproofing, or second-person test fails.

## Phase 3 — Emergency Pocket Card

### Goal

Create the smallest complete, laminatable emergency/communication reference from the same canonical public dataset.

### Deliverables

- 3.5 × 5-inch one-page or two-sided layout.
- CALL 911 FIRST and exact-location reporting hierarchy.
- Verified public contacts and contextual-jurisdiction language.
- Communication/check-in procedure.
- Public blank fields intended only for later handwriting outside the repository/build process.
- Compact provenance.
- Generator, checksum, parity trace, and physical validation evidence.

### Dependencies

- Approved emergency data/protocol.
- Public-contact verification and review policy.
- Pocket-size printer/lamination constraints.
- Decision whether one- or two-sided is legible.

### Acceptance criteria

- Contracts B, C, E, F, G, H, and physical I pass.
- 911-first and all reporting prompts remain legible at actual size.
- No private value appears in the public output.
- No rescue/delivery confirmation language.
- Both sides, if used, identify orientation and provenance.
- Headlamp, daylight, glove, wet-hand, pocket extraction, lamination, and second-person tests pass.

### Complexity

Medium–High: the data transform is small, but extreme space and emergency hierarchy make physical validation demanding.

### Stop conditions

- Required emergency content cannot fit legibly.
- A contact is stale/unverified.
- Lamination/sleeve glare or handling defeats use.
- Private blanks can be mistaken for loaded data.

## Phase 4 — Companion PWA shell

### Goal

Implement the accessible current-trip interaction shell without yet claiming full offline hardening.

### Deliverables

- Timeline, Route, and Emergency destinations.
- Globally persistent Daylight/Red display control.
- Current objective/status and provenance.
- Manual phase selection and user-confirmed elapsed-time model.
- Decision-prompt presentation with no aggregate verdict.
- device-local actual-start/current-phase operational state with visible clock uncertainty and no rewrite of canonical planning facts.
- no initial personal-contact, medical, or sophisticated private-data overlay; that design is deferred until after the trip.
- responsive/accessibility browser tests.

### Dependencies

- Approved Phase 0 information architecture.
- Stable schema/data and artifact content model.
- Selected browser/platform baseline and target iPhone models.
- Approved local operational-state lifecycle; sophisticated private-overlay decisions are not a Phase 4 dependency because that capability is deferred.
- Completed Field Guide/Pocket Card content hierarchy as fallback references.

### Acceptance criteria

- Core screens use only packaged public data.
- Emergency is one primary action away from every screen.
- Red display changes presentation only and is reversible/persistent.
- Critical target sizes, text, safe areas, portrait/landscape, increased text, and non-color meaning pass automation.
- Drafts are unmistakably unsent.
- No runtime external dependency exists in a core path.
- The 390 × 844 minimum automated reference viewport passes; identified primary and backup iPhones still require physical validation.
- Contract F and browser portions of I pass.

### Complexity

High: accessible field interaction, state clarity, private/local separation, and stress-oriented hierarchy matter more than ordinary responsive design.

### Stop conditions

- Navigation or display state implies authorization.
- Emergency is hidden or setup-dependent.
- Core facts are copied into runtime code.
- Private store can enter public output/logs.
- Exact target-device behavior remains unknown.

## Phase 5 — Offline/runtime hardening

### Goal

Prove that one complete compatible release survives zero connectivity, force quit, reboot, interrupted update, stale cache, storage pressure, and backup-device use.

### Deliverables

- Versioned/content-hashed asset strategy.
- Service worker with atomic shell/data activation.
- compatibility and release manifests.
- old-release preservation and rollback behavior.
- offline cold-launch and update-interruption tests.
- neutral installed/staleness/update-state surfaces.
- battery-conservation posture.
- primary and backup phone provisioning procedure.

### Dependencies

- Functional PWA shell.
- Stable asset/data compatibility contract.
- Target devices and iOS/browser baseline.
- Approved cache/storage and local operational-state migration rules.

### Acceptance criteria

- Contract D passes on both phones after force quit and reboot in Airplane Mode.
- DNS, live weather, GitHub, map tiles, remote fonts, CDNs, analytics, authentication, external APIs, fetch calls, and all other external data transfer are absent from field-critical paths.
- Interrupted/corrupt update never replaces the last complete release.
- No mixed shell/data activation.
- Stale assets cannot leak across releases.
- provenance matches active bytes.
- update failure never blocks core use or claims currency.
- emergency remains immediately available with missing private/location data.
- representative static-use battery observation passes.

### Complexity

Very high: browser/PWA lifecycle, iOS storage behavior, atomicity, and field failure recovery require real-device evidence.

### Stop conditions

- Offline cold launch fails once on a target device without understood/remediated cause.
- Update can mix versions or erase the prior complete release.
- Browser eviction behavior leaves a partial but plausible interface.
- Backup-device workflow depends on live network from the trailhead onward.

## Phase 6 — Automated testing and CI

### Goal

Make Contracts A–I repeatable for every candidate while preserving the rule that automation does not replace physical testing.

### Deliverables

- schema/referential/release-completeness tests;
- provenance/source coverage;
- artifact parity and deterministic generation;
- privacy/secret/public-field scans;
- safety-language and emergency-integrity checks;
- browser/accessibility/viewport/offline network-block tests;
- 390 × 844 minimum automated mobile-reference tests, while retaining explicit physical-test gates for both identified iPhones;
- service-worker upgrade matrix;
- print geometry/content checks;
- release manifest/checksum verification;
- CI workflow and protected release checks, if a remote/public CI is approved.

### Dependencies

- Stable schema, generators, and runtime interfaces.
- Approved repository/CI privacy posture.
- Curated prohibited/required language rules.
- Test fixtures reviewed as public-safe and synthetic.

### Acceptance criteria

- Contracts A–I have named tests, evidence output, and owners.
- Negative tests demonstrate failures.
- CI has no private secrets/data requirement for core tests.
- generated evidence is privacy-scanned.
- release cannot pass with unresolved critical/high failures.
- physical-test requirements remain explicit/manual gates.

### Complexity

High: cross-artifact semantic parity, offline lifecycle, and safety implication require more than unit tests.

### Stop conditions

- CI requires private production data.
- a test passes only through network access for a core path.
- fixtures resemble owner private data.
- test output exposes private/local state.
- automated result is described as field validation.

## Phase 7 — Physical field validation

### Goal

Validate the complete release candidate on actual devices and physical media under representative operating failures and conditions.

### Deliverables

- primary and backup iPhone evidence;
- Airplane Mode, force-quit, reboot, cold-launch, and interrupted-update results;
- Daylight/Red, sunlight, darkness, headlamp, gloves, wet fingers, one-handed, portrait/landscape, safe-area, accessibility, and battery observations;
- emergency one-action and communication-path test;
- actual-size Field Guide and Pocket Card results;
- sleeve/lamination/waterproof handling;
- second-person usability report;
- defect/remediation log and owner disposition.

### Dependencies

- Complete release candidate and checksums.
- Exact target devices.
- Actual printer, paper/card stock, sleeve/lamination configuration.
- Safe controlled test setting.
- Second-person tester.

### Acceptance criteria

- Every physical checklist item passes or has an explicitly approved non-critical limitation.
- Both phones operate offline after force quit and reboot.
- Critical content is readable/operable in all specified light/dexterity states.
- Emergency procedure is found and understood without coaching.
- artifact versions match.
- The 390 × 844 automated reference evidence is present but is not accepted as a substitute for these two physical-device results.
- communication test distinguishes draft, handoff, sent, and delivered.
- no physical artifact exposes unintended private data.

### Complexity

Very high: real devices, human factors, environment, and physical media cannot be reliably simulated.

### Stop conditions

- any critical content is hard to find/read/operate;
- second person interprets a decision surface as authorization;
- one phone requires live connectivity in a core flow;
- print/card fails under sleeve/lamination/light/handling;
- artifacts disagree;
- emergency or private-data behavior is ambiguous.

## Phase 8 — Freeze/tag/release

### Goal

Promote one exact, fully evidenced candidate to an immutable, recoverable Companion release without modifying the Mountain Guide.

### Deliverables

- owner-approved merge to main;
- annotated Companion release tag;
- ordinary annotated-tag evidence; cryptographic tag signing is outside the initial scope;
- release manifest and all SHA-256 checksums;
- canonical schema/data, three public artifacts, source, tests, and evidence;
- known-limitations and deployment/install/readiness instructions;
- rollback tag/package and verified procedure;
- archived physical validation references.

### Dependencies

- All Contracts A–I passing.
- All critical/high findings resolved.
- Physical validation completed.
- Owner approval of exact commit and hashes.
- Approved publication/deployment destination.

### Acceptance criteria

- main contains only approved release-ready work.
- tag/commit/data/source/artifact hashes agree.
- public/private artifacts are correctly separated.
- release installs and cold-launches offline on both phones.
- print/card versions match the installed PWA.
- rollback package verifies and the rollback procedure is exercised.
- no Mountain Guide file/repository was changed.

### Complexity

Medium–High: implementation is complete, but release integrity and recoverability require disciplined evidence and owner control.

### Stop conditions

- owner has not approved the exact candidate.
- tag/manifest/hash mismatch.
- rollback cannot be demonstrated.
- final package contains private data or unverified facts.
- physical evidence is incomplete.
- deployment would weaken privacy or offline behavior.

## Cross-phase unresolved decisions

Before their dependent phase begins, resolve:

1. target iPhone models and iOS/browser baseline; 390 × 844 is already fixed as the minimum automated reference;
2. source-verification ownership;
3. exact implementation mechanism for preserving local actual-start/elapsed-time state across reload/reboot while surfacing clock uncertainty;
4. verification-age policy by field type;
5. first-release route/public-contact completeness;
6. deterministic print/PDF and PWA toolchain;
7. coordinate/location permission, accuracy, and retention policy;
8. one- versus two-sided pocket card;
9. final persistent navigation after physical usability testing;
10. repository visibility, remote, CI, deployment, and final tag naming; tags are ordinary annotated tags and cryptographic signing is outside the initial scope;
11. after the trip, whether a sophisticated device-local private overlay should be designed and what security, migration, deletion, and backup-phone rules it would require.
