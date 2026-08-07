# Artifact Matrix

## Architecture summary

The product family has one upstream planning product and three Companion artifacts.

1. **Full Mountain Guide** — upstream planning, research, and historical authority.
2. **Printable Field Guide** — approximately three US Letter pages for robust field reference.
3. **Emergency & Communication Pocket Card** — approximately 3.5 × 5 inches, one page or two-sided, for immediate emergency use.
4. **Companion PWA** — offline-first interactive field reference.

The future public canonical Companion manifest is the only public-fact authority for the three Companion artifacts. The artifacts do not need to contain literal identical JSON bytes; each may use its own presentation or internal representation while deriving every public fact from that manifest. The Mountain Guide is the pinned upstream source for the initial verified facts; it is not queried at field runtime. Private overlays are separate and never become canonical public data.

Every released Companion artifact must expose or internally record the same `data_version`, `source_release`, `source_commit`, canonical manifest SHA-256, and `verified_at`. Automated parity tests must prove the shared manifest hash, and no hand-copied public fact may become an independent authority.

## Responsibility matrix

| Dimension | Full Mountain Guide | Printable Field Guide | Emergency Pocket Card | Companion PWA |
| --- | --- | --- | --- | --- |
| Primary purpose | Planning, research, comparison, long-form context, history, and broad mountain knowledge. | Rapid chronological, route, decision-prompt, and emergency reference when a phone is inconvenient or unavailable. | Immediate 911-first and communication prompts with minimal reading. | Interactive, low-cognitive-load current-trip timeline, route, reassessment, emergency, and local draft/status functions. |
| Medium | Existing website/product. | About three 8.5 × 11-inch pages, waterproof sleeve or waterproof print. | About 3.5 × 5 inches, laminatable, one page or two-sided. | Installed offline-first PWA on primary and backup iPhones. |
| Primary audience | Owner during pre-trip planning and post-trip review. | Owner and partner in the vehicle, at camp, or in the field. | Any party member who needs emergency prompts immediately. | Owner and partner operating the current plan. |
| Cognitive posture | Comprehensive and exploratory. | Compressed and scan-oriented. | Minimal, urgent, large-type. | Contextual and interactive, but never comprehensive. |
| Included information | Road to 50, Mountain Intelligence, history, planning scenarios, research, long-form weather, broad objectives, full context. | Page 1 timeline and decision gates; Page 2 route profile, verified junctions, return/descent considerations; Page 3 emergency and communication protocol; provenance on every page. | CALL 911 FIRST; exact-location reporting prompts; verified public emergency contacts; communication/check-in procedure; provenance; blank private fields. | Current objective/status; timeline; route; decision prompts; emergency; public contacts; device-local private overlay; local status/communication drafts; Daylight/Red display; provenance. |
| Explicitly excluded | Companion-specific private overlay and generated field artifacts unless upstream governance later links them. | Broad planning, complete research/history, archives, non-current objectives, full gear system, long-form weather, interactive logs, private data stored in Git. | Detailed route narrative, planning explanation, broad contacts, live status, automated messaging, dense private information, climb authorization. | Road to 50, Mountain Intelligence, complete summit history, broad expedition planning, research archive, planning comparisons, long-form weather, complete gear system, non-current objectives, encyclopedia functions. |
| Connectivity dependency | May use network in its existing product model; outside Companion Phase 0. | None. | None. | Zero network for all field-critical functions. Optional pre-departure refresh only. |
| Canonical public-fact source | Its own frozen release/source records. | Future trip-manifest data version selected at generation. | Same future trip-manifest data version selected at generation. | Same future trip-manifest version packaged atomically with the release. |
| Private-data handling | Governed by the separate Mountain Guide; not imported automatically. | Initial release uses blank placeholders; personal values are added by hand or otherwise outside the public repository. Automated private-print overlays are deferred. | Initial release uses handwritten values and a blank repository template. Automated private-print overlays are deferred. | Device-local only if later implemented; absent values are labeled unavailable; no default export, telemetry, or source-control path. |
| Update mechanism | Separate Mountain Guide release process. | Regenerate and reprint from a reviewed canonical version. Never silently update physical copies. | Regenerate/reprint or replace handwritten card after verified changes. | Install an atomic shell+dataset release before departure; preserve the prior complete release until update succeeds. |
| Provenance display | Existing Mountain Guide version/release. | On every page: data version, source release/commit, manifest SHA-256, generated time, verified_at, artifact build ID. | Compact identity with data version, source pin, manifest SHA-256, and verified_at on each side. | Persistent/offline identity surface recording data version, source pin, manifest SHA-256, and verified_at. |
| Staleness behavior | Existing product governance. | Age/version is physically visible; old print is replaced or visibly marked during readiness check. | Same; changed contacts require a new verified card. | Always shows installed data version and embedded verification time; never claims current merely because no update is visible. |
| Primary failure fallback | Not a field-critical dependency. | Pocket Card and verified offline PWA. | Field Guide and verified offline PWA. | Field Guide and Pocket Card; backup phone independently installed. |
| Release owner | Mountain Guide repository/release owner. | Companion repository generation/release process after owner review. | Companion repository generation/release process plus owner addition of private values. | Companion repository release process after automated and physical validation. |

## Companion artifact content allocation

### Printable Field Guide

#### Page 1 — Operational Timeline + Decision Gates

- source/data version and verification stamp;
- current-trip objective and user-defined timing anchors;
- chronological phases and milestones;
- decision gates and observation prompts;
- explicit language that actual conditions govern;
- no computed continue/stop result.

#### Page 2 — Route Profile + Junctions + Return/Descent Considerations

- only verified current-route information;
- waypoints and route segments when later verified;
- source/verification notation for route junctions and alternatives;
- known return/descent options, with uncertainty;
- no generic bailout language or implied safe alternative.

#### Page 3 — Emergency + Communication Protocol

- CALL 911 FIRST;
- location-reporting prompts;
- verified public emergency contacts;
- jurisdiction-context language;
- communication/check-in sequence;
- blank/local-only private fields;
- Draft — not sent language for any message template.

### Emergency & Communication Pocket Card

The pocket card contains the smallest complete emergency set:

- CALL 911 FIRST in the largest hierarchy;
- location, mountain, route, elevation, coordinate, injury, party-size, and condition prompts;
- verified public contacts only;
- concise check-in protocol;
- blank/private fields added outside Git;
- explicit absence of rescue or delivery confirmation;
- compact provenance and last-verified date.

It excludes route detail unless a minimal current objective/route label is necessary for accurate location reporting.

### Companion PWA

The PWA adds interaction but not new public facts:

- user-confirmed elapsed-time tracking;
- manual phase selection;
- contextual decision-prompt expansion;
- rapid Timeline/Route/Emergency navigation;
- one-tap persistent Daylight/Red display;
- device-local private overlay and local-only status log;
- draft composition with clear unsent state;
- installed-version and update-state reporting.

It does not depend on live weather, maps, location, messaging, authentication, or a server for core field operation.

## Information excluded from every Companion artifact

| Category | Reason |
| --- | --- |
| Road to 50 | Long-horizon program, not current-trip field operation. |
| Mountain Intelligence | Broad analytical knowledge conflicts with trip scope and glanceability. |
| Complete summit history | Historical reference does not answer an immediate field question. |
| Broad expedition planning | Plan selection occurs before Companion generation. |
| Extensive research notes | Evidence belongs upstream; only verified field facts flow downstream. |
| Planning scenario comparison | Multiple plans create ambiguity and cognitive load in field. |
| Detailed long-form weather analysis | Field use carries age/reference/observation prompts, not a live forecast authority. |
| Complete gear management | Full inventory is a distinct workflow; physical readiness belongs pre-departure. |
| Non-current objectives | They can be mistaken for the active route or plan. |
| Archive/history tools | Repository/release governance owns history; field screens show installed provenance only. |
| General mountain encyclopedia | It expands scope, package size, and decision ambiguity. |

## Public/private placement matrix

| Data class | Full Mountain Guide | Printable Field Guide | Pocket Card | PWA |
| --- | --- | --- | --- | --- |
| Public canonical trip facts | Upstream source or source record. | Generated from manifest. | Generated from manifest. | Packaged from manifest. |
| Private phone/email recipients | Not imported. | Blank public template; owner adds values outside the repository. | Handwritten only for the initial release. | Device-local only if later implemented. |
| Medical/medication information | Never imported to Companion Git. | Optional handwritten content outside the repository, if owner chooses. | Optional handwritten content, if owner chooses and space/privacy review supports it. | Device-local only if a later separately approved feature defines security and deletion. |
| Satellite/device identifiers | Never canonical. | Handwritten outside the repository only if needed. | Handwritten only if needed. | Device-local only if later implemented. |
| Status/check-in history | Not a Companion source. | Not included. | Not included. | Local-only and clearly not transmitted. |
| Public emergency contacts | Verified source record. | Included from manifest. | Included from manifest. | Included from manifest. |

## Update and disagreement rules

1. A Companion release selects exactly one canonical public data version.
2. The Field Guide, Pocket Card, and PWA release must carry the same data version, source provenance, canonical manifest SHA-256, and verified_at; their literal bytes and representations may differ.
3. A public fact change creates a new canonical data version and regenerates all affected artifacts.
4. Private local changes do not change the public data version. They receive a separate local-overlay revision/time if later implemented.
5. A print generated from one data version must not be relabeled after a canonical change; it must be regenerated or visibly retired.
6. The PWA must never mix a new shell with an old dataset or the reverse. Update activation is atomic.
7. If artifacts disagree in field, the system cannot determine truth automatically. Users compare embedded versions and verification dates, then apply actual conditions and the physical emergency protocol. The conflict is a mandatory post-trip/release incident.
8. If artifacts disagree before departure, release/readiness stops until parity is restored.

## Ownership risks

- The Mountain Guide is upstream authority, while the future Companion manifest is downstream canonical data for three artifacts. Documentation must keep those two scopes explicit to avoid declaring two competing global sources of truth.
- Handwritten private copies can diverge from their blank public templates. Each physical copy still needs a visible public data version and print time, and personal values remain outside Git. Automated private-overlay generation is deferred until after the trip unless separately approved.
- Pocket-card space may be insufficient for all public contacts and prompts. Emergency integrity outranks completeness; Phase 3 physical testing decides the final content hierarchy.
- A generated PDF is not proof of physical readability. The release owner must retain evidence from actual size, sleeve/lamination, daylight, headlamp, glove, and second-person tests.
