# Don Downs Mountain Guide Companion

## Product purpose

The Don Downs Mountain Guide Companion is a separate, trip-scoped field-reference product for rapid use in the vehicle, at camp, and during a climb. It is designed to answer four questions with very low cognitive load:

1. Where are we in the plan?
2. What matters right now?
3. What conditions should cause us to reassess or turn around?
4. What do we do if something goes wrong?

The Companion is not a second full Mountain Guide. It will eventually consist of three coordinated artifacts: a printable three-page Field Guide, a pocket-sized Emergency & Communication Card, and an offline-first Companion PWA. One canonical public manifest is authoritative for all public trip facts. The artifacts may transform those facts into different formats; they do not need to contain identical JSON bytes.

## Relationship to the Mountain Guide

The existing Don Downs Mountain Guide remains a separate, frozen upstream product and must not be modified from this repository.

- Source release: v15.3.10
- Source commit: fb711292b2642c2296eb76c0cfe2531606029609
- Live site: https://mountainguide.vondadowns.com/

The Companion dataset is a public-safe, trip-specific derivative of that pinned source release plus any later, explicitly verified supplemental source records. It does not silently replace the Mountain Guide as the authority for broader planning content.

## Current phase

Phase 2 produces the first draft Printable Field Guide while preserving the approved Phase 0 architecture and Phase 1 canonical dataset. The deterministic build generates exactly three US Letter portrait pages:

1. Operational Timeline + Decision Gates.
2. Route Profile Summary + Return Considerations.
3. Emergency + Communication.

The generated HTML, PDF, and non-circular artifact checksum record are source-controlled release artifacts. They are rebuilt from `data/trip-manifest.json`; the HTML/CSS template contains no independent canonical trip facts. No browser runtime, Pocket Card, PWA, service worker, network dependency, or deployment is introduced in Phase 2.

This Field Guide is a draft, not a field release. The Lily Lake operational trailhead point remains `pending_external_verification`. Its unresolved coordinate/elevation is visibly withheld, and any artifact that requires that value remains blocked from final field release until authoritative verification. Actual-size physical print, sleeve/waterproof, daylight, headlamp, glove, wet-hand, and second-person tests also remain release gates.

## Zero-connectivity requirement

Zero-connectivity operation from the trailhead onward is an invariant. Every field-critical Companion workflow must work without DNS, weather services, GitHub, map tiles, remote fonts, a CDN, analytics, an authentication server, an API, or any other network resource. Network access may be used before departure to refresh or verify public information, but losing connectivity must never remove core functionality or become a prerequisite for:

- reading the timeline or route;
- finding the next milestone or decision prompt;
- opening emergency instructions;
- reading public emergency contacts already packaged with the trip;
- viewing the communication protocol;
- using daylight or red display;
- comparing artifact versions and provenance.

The physical Field Guide and Emergency Pocket Card are independent fallbacks for phone loss, battery failure, reboot, cache failure, and high-stress use.

## Canonical identity and artifact parity

One canonical public manifest is the authority for public trip facts. No hand-copied fact in the Field Guide, Pocket Card, or PWA may become an independent source of truth. Every future released artifact must expose or internally record the same:

- `data_version`;
- `source_release`;
- `source_commit`;
- canonical manifest SHA-256;
- `verified_at`.

Automated release tests must prove that all three released artifacts reference the same canonical manifest hash.

## Initial private-data strategy

The initial pre-trip release will not include an encrypted private-print pipeline or private-overlay automation. The public repository contains no personal medical/contact information. Personal physical-card information is handwritten or otherwise added outside this repository, and any future PWA private data is device-local only. More sophisticated private-overlay automation is deferred until after the trip unless a concrete need is separately approved.

## Safety posture

The Companion provides decision-support prompts, not route authorization. It never declares that a route is safe, weather permits travel, a party should continue, or rescue has been activated.

Standing principles:

- Weather is evidence, not permission.
- Actual conditions govern the decision.
- Call 911 first in an emergency.
- Dispatch determines the responding agency.
- A turnaround target is a user-defined planning target, not an automatically derived safety cutoff.

## Initial design context

The first planned Companion is scoped to the Lake Como / Blanca / Ellingwood / Mount Lindsey trip of August 19–25, 2026.

- Primary objective: Blanca Peak + Ellingwood Point
- Camp: Lake Como
- Transportation: Audi Q5
- Canonical trip timezone: America/Denver
- Planned start: 4:15 AM, an explicit planning fact that is never silently recalculated
- Turnaround / exit target: 11:30 AM, a user-defined planning target that is never silently recalculated

Phase 1 records the source-supported trip facts, qualifications, and unresolved verification states in `data/trip-manifest.json`. It does not add unsourced route, waypoint, jurisdiction, contact, or weather facts.

Any future `actual_start`, elapsed time, or current-phase selection is operational, device-local state rather than a canonical planning fact. Reload or reboot must not overwrite the planned values, and uncertainty in the device clock must be visible rather than hidden. Phase 1 implements no runtime time logic.

## Verification and release conventions

- The minimum automated mobile reference viewport is 390 × 844, inherited from successful Mountain Guide testing. It does not replace testing on the actual primary and backup iPhones, which must be identified and physically tested before field release.
- Companion releases use ordinary annotated Git tags. Cryptographic tag signing is out of scope unless deliberately approved later.

## Canonical-data validation

The Phase 1 checks use the local Node.js runtime and have no package dependencies:

```sh
npm run check:data
npm run check:manifest
npm run check:provenance
npm run check:privacy
npm run check:safety
npm run check:repository
npm run check:policy -- --repository-only
```

## Printable Field Guide build

Install the pinned Python packages in `requirements-print.txt` and Poppler, then run:

```sh
npm run build:field-guide
npm run check:field-guide
npm run check:pdf
```

The build is fail-closed on canonical parity, Lily Lake hold semantics, artifact identity, exact three-page geometry, printable bounds, essential type size, public-contact allowlisting, prohibited safety language, and rendered-page integrity. `check:pdf` renders all pages in color and grayscale to ignored temporary files for visual review. CI rebuilds the committed outputs and fails if their bytes drift.

The canonical manifest hash is lowercase SHA-256 over the exact bytes of `data/trip-manifest.json`, including whitespace and the final newline. It is deliberately not embedded in the manifest. The aggregate runner computes it twice and requires the results to match.

## Architecture documents

- docs/product-specification.md — product definition, workflows, usability, failure behavior, exclusions, and success.
- docs/artifact-matrix.md — ownership and boundaries across the Mountain Guide and three Companion artifacts.
- docs/data-architecture-proposal.md — proposed public canonical schema, provenance, versioning, validation, and consumption.
- docs/privacy-and-safety-model.md — public/private separation, emergency integrity, prohibited claims, and route/weather uncertainty.
- docs/verification-and-release-plan.md — automated contracts, offline and upgrade testing, physical validation, release, and rollback.
- docs/implementation-roadmap.md — phased implementation from schema through physical field validation and release.
- docs/source-ledger.md — fact-group provenance, source locators, verification status, and qualifications.
- docs/data-verification-report.md — Phase 1 inventory, verification results, exclusions, and owner-review questions.
- docs/repository-automation.md — protected branch, CI, auto-merge, synchronization, release-tagging, and future Pages policy.
- docs/field-guide-design.md — Phase 2 page architecture, manifest-only fact flow, typography, print geometry, provenance, Lily Lake withholding, grayscale behavior, and release gates.

## Repository status

The public repository is `DonDowns/mountain-guide-companion`. Phase 0, Phase 1, and the Phase 2 draft Field Guide are on protected `main` after their respective automated workflows complete. Nothing is deployed. Routine repository development uses required GitHub Actions checks and conservative native auto-merge. Field release, tagging, and physical signoff remain human gates; Phase 3 has not started.
