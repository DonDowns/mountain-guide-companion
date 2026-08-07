# AGENTS.md — Don Downs Mountain Guide Companion

## Mission

Build and maintain a separate, trip-scoped, zero-connectivity field companion to the Don Downs Mountain Guide. Optimize for rapid reference under cold, wind, darkness, bright sunlight, wet conditions, gloves, stress, low battery, and backup-device use.

## Repository boundary

1. Never modify the existing Mountain Guide from this repository.
2. Treat Mountain Guide release v15.3.10 and commit fb711292b2642c2296eb76c0cfe2531606029609 as the pinned upstream source for the initial Companion.
3. Do not create a remote, push, publish, deploy, or open a pull request without explicit owner instruction.
4. During Phase 0, create documentation and repository-governance files only. Do not create runtime code, manifests, service workers, PDFs, or production data.

## Branch and release governance

1. Once implementation begins, main is production/release-ready only.
2. Perform implementation on a named feature or release branch.
3. Do not merge directly to main without owner approval.
4. Do not rewrite or delete prior release history.
5. Every release must have a version, ordinary annotated Git tag, immutable source commit, artifact checksums, canonical-data version, provenance stamp, verification evidence, and rollback target.
6. Cryptographic tag signing is out of scope unless deliberately approved later.

## Fact and provenance rules

1. Never fabricate route facts, waypoints, contacts, jurisdictions, weather locations, descent options, or alternatives.
2. Every public fact must derive from the future canonical public manifest and have a traceable source record.
3. One canonical public manifest is authoritative. Generated artifacts may use different representations, but no hand-copied public fact may become an independent authority.
4. Every released artifact must expose or internally record the same `data_version`, `source_release`, `source_commit`, canonical manifest SHA-256, and `verified_at`; automated parity tests must prove the hash identity.
5. Treat upstream facts as pinned to the stated Mountain Guide release; do not silently import facts from a later branch or live site.
6. When facts disagree or lack verification, show the conflict or uncertainty and stop release work. Do not guess.
7. Source records use durable project/repository, release, commit, file/path, and semantic record/field/section locators. Line ranges are supplemental only and never the sole locator.

## Privacy rules

1. Never store private phone numbers, private email addresses, medical history, medication lists, personal emergency contacts, satellite account identifiers, device registration IDs, private check-in recipients, passwords, access tokens, or other non-public personal data in Git.
2. Public canonical data may be committed only after privacy classification and review.
3. Device-local private data must remain local, be clearly labeled, and never be exported or logged by default.
4. Handwritten or private print-time fields must use blank placeholders in repository artifacts.
5. Logs, screenshots, fixtures, tests, crash reports, and sample data must follow the same privacy rules as production files.
6. For the initial pre-trip release, personal physical-card values are handwritten or added outside the public repository; do not build an encrypted private-print pipeline.
7. Any future PWA private data is device-local only. Sophisticated private-overlay automation is post-trip/deferred unless a concrete need is separately approved.

## Safety-language invariants

1. Weather is evidence, not permission.
2. Actual conditions govern the decision.
3. Use decision gate, reassessment prompt, turnaround consideration, known return option, known descent option, route junction, retreat consideration, or verified alternative.
4. Never use Go/No-Go matrix, safe to proceed, all clear, route is safe, weather permits, approved to continue, you should summit, or safe to climb.
5. Never produce a green/red climb authorization or imply that satisfying prompts authorizes continuation.
6. A user-defined turnaround target is not an automatically derived safety cutoff.
7. The Companion is not rescue guidance and does not guarantee safety.
8. Call 911 first in an emergency. Jurisdiction is contextual; dispatch determines the responding agency.
9. Never claim rescue requested, rescue activated, help is on the way, or message sent unless an external system has actually confirmed that exact event.
10. Future SMS or email controls create drafts only unless a separate, verified transport explicitly confirms delivery.

## Offline field-operation rules

1. Zero-connectivity operation from the trailhead onward is an invariant.
2. Do not add a runtime network dependency to Timeline, Route, Decision prompts, Emergency, Communication protocol, provenance, or display-mode operation.
3. No field-critical workflow may require DNS, a weather service, GitHub, map tiles, a remote font, a CDN, analytics, an authentication server, an API, or any other network resource.
4. A PWA cold launch after force quit or reboot must work offline on both primary and backup target iPhones before release.
5. Service-worker updates must be atomic and must not leave a mixed-version shell and dataset.
6. Never hide staleness. Show embedded data version and verification age even when offline.
7. Physical Field Guide and Pocket Card remain required fallbacks; automation never replaces physical testing.

## Time semantics

1. The canonical trip timezone is `America/Denver`.
2. The planned start remains 4:15 AM and the user-defined turnaround/exit planning target remains 11:30 AM.
3. Neither planned value may be silently recalculated or overwritten on reload/reboot.
4. Future actual-start, elapsed-time, and current-phase values are operational/device-local state, not canonical planning facts.
5. Surface device-clock uncertainty rather than hiding it. Do not implement time logic during Phase 0.

## Field usability rules

1. Design for one-handed use, gloves, wet fingers, stress, daylight, darkness, headlamp use, portrait/landscape, and safe-area insets.
2. Critical touch targets must be large, separated, and operable without precision gestures.
3. Do not make color the only carrier of meaning.
4. Red display is a persistent, one-tap global display state, not route authorization.
5. Emergency information must be reachable immediately and must not depend on prior setup, connectivity, or a complex navigation path.
6. Battery conservation is a functional requirement.
7. Use 390 × 844 as the minimum automated mobile reference viewport. This does not replace physical testing on the identified primary and backup iPhones.

## Required verification contracts

Later implementation must keep these contracts green:

- A — Schema Completeness
- B — Artifact Parity
- C — Source Provenance
- D — Zero-Dependency Field Runtime
- E — Privacy
- F — Safety Language
- G — Staleness
- H — Emergency Integrity
- I — Touch/Visibility

Automated checks supplement but never replace physical-device, print, waterproofing, communication-path, and second-person usability testing.

## Stop conditions

Stop and request review when:

- a required fact is missing or conflicts with another source;
- a private value would enter Git or a generated public artifact;
- an artifact cannot be derived from the canonical dataset;
- offline cold launch cannot be demonstrated;
- an update can produce mixed-version artifacts;
- safety language implies authorization or rescue confirmation;
- a route alternative lacks source and verification;
- physical validation reveals an unreadable, unreachable, or ambiguous critical workflow;
- the requested work would modify the existing Mountain Guide.
