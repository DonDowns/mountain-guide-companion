# Product Specification

## Document status

- Product: Don Downs Mountain Guide Companion
- Phase: 0 — product definition and architecture
- Status: approved Phase 0 architecture baseline
- Runtime implementation: prohibited in this phase
- Pinned upstream source: Don Downs Mountain Guide v15.3.10
- Pinned upstream commit: fb711292b2642c2296eb76c0cfe2531606029609

## Product definition

The Don Downs Mountain Guide Companion is a separate, trip-scoped operational reference for rapid use in the vehicle, at camp, and during a climb. It compresses a verified current-trip plan into three mutually reinforcing artifacts: a short printable Field Guide, a pocket Emergency & Communication Card, and an offline-first PWA.

The Companion answers four questions:

1. Where are we in the plan?
2. What matters right now?
3. What conditions should cause us to reassess or turn around?
4. What do we do if something goes wrong?

It is not a condensed encyclopedia and not a second full Mountain Guide. It does not plan expeditions, authorize route decisions, predict safety, replace emergency services, or confirm communications that an external system has not confirmed.

## Product principles

1. **Zero-connectivity field use.** Zero connectivity from the trailhead onward is an invariant, not a graceful-degradation goal.
2. **Glanceable before comprehensive.** Critical information is recognizable under stress without reading long prose.
3. **One public fact, three presentations.** One canonical public manifest is authoritative. The three artifacts may use different representations but never independent hand-copied fact authorities.
4. **Physical and digital redundancy.** Loss of one artifact does not remove the minimum emergency and plan reference.
5. **Prompt judgment; do not automate authorization.** The product asks for reassessment and comparison. It never returns permission to continue.
6. **Staleness is visible.** Every artifact exposes source, data version, generation time, and verification time.
7. **Private data stays outside public source control.** Initial personal values are handwritten or maintained outside the repository; any later approved PWA private data is device-local only.
8. **Actual conditions govern.** Weather, timing, pace, symptoms, access, and terrain evidence inform human decisions.

## Zero-connectivity invariant

From the trailhead onward, no field-critical workflow may require DNS, a weather service, GitHub, a map tile service, a remote font, a CDN, analytics, an authentication server, an API, or any other network resource. Optional connectivity before departure may refresh verified public data, but connectivity loss must not remove Timeline, Route, decision prompts, Emergency, the communication protocol, provenance, or display-mode functionality.

The cold-starting installed release must carry its complete public facts and identity locally. A failed or absent network is an expected operating condition and must not trigger a blocking retry, login, blank state, or loss of core functionality.

## Intended users

### Primary user

Don Downs, operating the current trip plan in field conditions with limited time, attention, dexterity, light, battery, and connectivity.

### Secondary users

- A climbing partner who needs to understand the immediate plan or emergency protocol.
- A backup-device user who did not perform the original PWA installation.
- A person holding the physical guide or pocket card while the primary phone is unavailable.
- A second-person usability tester who has not memorized the Mountain Guide.

The product must not depend on one person remembering where information is hidden.

## Initial trip design context

Only the following trip facts are accepted in Phase 0:

| Field | Supplied value | Treatment |
| --- | --- | --- |
| Trip area/objectives | Lake Como / Blanca / Ellingwood / Mount Lindsey | Design context; detailed route facts require later verification. |
| Dates | August 19–25, 2026 | Design context. |
| Primary objective | Blanca Peak + Ellingwood Point | User-supplied planning objective. |
| Camp | Lake Como | User-supplied. |
| Transportation | Audi Q5 | User-supplied. |
| Canonical trip timezone | America/Denver | IANA timezone for canonical planning facts. |
| Planned start | 4:15 AM | Explicit user-defined planning fact; never silently recalculated. |
| Turnaround / exit target | 11:30 AM | Explicit user-defined planning target; never silently recalculated or treated as an automatically derived safety cutoff. |

Phase 0 must not infer waypoints, route segments, alternate routes, jurisdictions, public contacts, coordinates, elevation, weather locations, or descent durations.

## Time semantics

- Canonical planning dates and times use `America/Denver`.
- `planned_start` remains 4:15 AM and the turnaround/exit planning target remains 11:30 AM unless the owner changes the canonical plan in a new data version.
- The application must never silently recalculate or overwrite either planned value.
- Future `actual_start`, elapsed-time state, and current-phase selection are operational/device-local state rather than canonical planning facts.
- Reload, force quit, reboot, or a changed device clock must not overwrite the planned values.
- Device-clock uncertainty must be labeled and surfaced; it must not be hidden behind automatic phase selection.
- Phase 0 implements no time logic.

## Initial private-data strategy

The initial pre-trip Companion release has no encrypted private-print pipeline. Public source data contains no personal contact, medical, medication, satellite-account, or device information. Personal values on the physical card or guide are handwritten or otherwise added outside the public repository. PWA private data, if later approved and implemented, is device-local only.

Sophisticated private-overlay automation, private-print merging, and related encryption/provisioning work are deferred until after the trip unless a concrete need is separately approved. Public emergency content must remain complete when no private values exist.

## Primary workflows

### 1. Pre-departure readiness

The user:

1. identifies the current canonical trip-data version;
2. refreshes public information when connectivity is available;
3. reviews facts that changed since the prior version;
4. confirms the PWA shell and complete dataset are installed on primary and backup phones;
5. performs offline cold-launch checks;
6. generates/prints the Field Guide and Pocket Card from the same canonical public manifest;
7. verifies that all three artifacts record the same data version, source release/commit, manifest SHA-256, and verified_at;
8. adds private fields locally or by hand;
9. records that physical and device checks were completed.

The product must not call an artifact current solely because an update check succeeded. Readiness is a verified process, not a green state.

### 2. Locate the current plan phase

The user opens Timeline and immediately sees:

- current objective;
- current clock time and elapsed time, clearly distinguished;
- planned start, preserved as the canonical 4:15 AM planning fact;
- user-defined 11:30 AM turnaround/exit planning target;
- current phase;
- next milestone;
- next relevant decision point;
- trip-data version and last-verified time.

If automatic phase selection depends on the device clock, the screen must show that it is an estimate and allow manual phase selection. A wrong or uncertain device clock must not silently move the plan. Actual-start and elapsed-time state remain local and cannot rewrite the canonical planned values.

### 3. Review route information

The user opens Route and sees only current-trip route profile, verified junctions, and documented return/descent considerations. Each alternative, if any, includes source, verification status/date, and uncertainty. Unknown or unverified alternatives are omitted or explicitly labeled; they are never invented.

### 4. Reassess at a decision point

The user sees a compact prompt to compare:

- actual sky and weather evidence;
- wind;
- elapsed time and observed pace;
- terrain and exposure;
- group condition;
- altitude symptoms;
- remaining descent duration;
- access changes or unexpected route evidence.

The output is a reminder to reassess and compare, not a computed answer. No combination of favorable inputs produces authorization.

### 5. Use emergency information

Emergency is reachable immediately. The screen/card begins with CALL 911 FIRST and prompts the user to report:

- exact location;
- mountain;
- route;
- elevation;
- coordinates if available;
- injuries;
- party size;
- weather and conditions.

Jurisdiction is contextual. The product does not claim that one county owns an entire route, and it explains that dispatch determines the responding agency.

### 6. Prepare a communication/status update

The product may later format a local draft from user-selected public facts and device-local private recipients. It must label the result Draft — not sent. It cannot say message sent, rescue requested, rescue activated, or help is on the way without a verified external confirmation for that specific event.

### 7. Switch field display

The user can switch between Daylight and Red display with one action. The selected display persists across Companion screens and relaunch. Display mode changes presentation only; it carries no decision or safety meaning.

## Field operating assumptions

- Network service, DNS, remote assets, APIs, and authentication services may be absent for the entire field period.
- The primary phone may be locked, wet, cold, low on power, force-quit, rebooted, or unavailable.
- A backup iPhone may be the only device.
- The user may have gloves, wet fingers, one free hand, reduced dexterity, impaired attention, or elevated stress.
- Screen use occurs in bright sunlight, darkness, headlamp light, wind, precipitation, vehicle/camp conditions, and portrait or landscape orientation.
- The device clock, battery indicator, location reading, and cached information may be wrong or stale.
- A person unfamiliar with the information architecture may need emergency content immediately.
- Printed artifacts may be old, damaged, or disagree with the PWA.

## Information architecture recommendation

The proposed four-item navigation is useful, but Red is a global display state rather than a content destination. Treating it like a screen risks implying that Red contains different plan facts.

Recommended concept for Phase 4 usability validation:

- Persistent destinations: **Timeline | Route | Emergency**
- Persistent global control: **Red display / Daylight display**
- Decision prompts: embedded at relevant Timeline milestones and Route decision points
- Communication/status drafts: available from Timeline and Emergency, not a separate primary destination

This is a design recommendation, not a final implementation decision. Physical one-handed and emergency-access testing must confirm it. Emergency must remain available in one primary action from every screen.

## Primary operational screen concept

### Top status area

The top status area is fixed or immediately visible and contains:

- current objective;
- current time, labeled as device time;
- elapsed time from a user-confirmed start, not merely the planned start;
- planned start;
- user-defined turnaround/exit target with a planning-target label;
- trip-data version;
- generated date/time;
- last-verified date/time.

If elapsed time has not been started or restored, show Not started or Needs confirmation. Do not fabricate elapsed time from the scheduled start.

### Main timeline area

The timeline is chronological and optimized for scanning. It emphasizes:

1. current phase;
2. next milestone;
3. next relevant decision gate.

Past, current, and future phases use text, shape, weight, and spacing—not color alone. Long explanatory detail stays behind a deliberate expansion that remains operable with gloves and keyboard/switch access.

### Decision area

Decision prompts are concise, evidence-oriented, and anchored to a milestone or route segment. Each prompt includes:

- what to observe;
- what plan assumption to compare it with;
- why the comparison matters;
- a neutral reassessment or turnaround consideration;
- the standing statement Actual conditions govern the decision.

The system does not score the inputs, aggregate them into a status, or show a green/red authorization.

### Emergency access

Emergency is visually distinct, always labeled with text, and reachable without scrolling through the timeline. It must not be concealed behind Red display, a menu, authentication, data entry, or network access.

## Usability requirements

### Touch and reach

- Minimum automated mobile reference viewport: 390 × 844, inherited from successful Mountain Guide testing.
- The automated reference does not replace testing on the actual primary and backup iPhones, which must be identified before field release.
- Critical controls: minimum 56 × 56 CSS pixels with at least 8 pixels of separation.
- Secondary controls: minimum 48 × 48 CSS pixels.
- No gesture-only, swipe-only, hover-only, double-tap, or press-and-hold critical action.
- One-handed operation must work from common thumb-reach zones on the target iPhone.
- Emergency and display-mode controls require no precision target.

### Typography and content density

- Critical emergency text: at least 24 CSS pixels on the target viewport.
- Field body text: target 18–20 CSS pixels with generous line height.
- Critical numbers and labels must remain untruncated at 320-pixel and target-iPhone widths.
- Avoid paragraphs in the primary field path; use short labels, prompts, and progressive disclosure.
- Never abbreviate a critical instruction without an adjacent expansion.

### Visibility

- Daylight mode uses maximal contrast, no low-contrast gray critical text, and no glossy/visual effect that reduces sunlight readability.
- Red display uses dark-adapted colors but retains accessible contrast and text hierarchy.
- Meaning never depends on red/green color.
- Support increased text size, bold text, reduced motion, safe-area insets, portrait, and landscape.
- Do not force screen brightness or claim to preserve night vision.

### Stress and cognitive load

- One primary question per screen region.
- Current phase, next milestone, and emergency access remain visually stable.
- Avoid confirmation dialogs for read-only navigation.
- Destructive local-data clearing requires explicit confirmation.
- After reboot or cold launch, the app opens to a legible known state and states what must be reconfirmed.

### Battery

- No polling, live maps, background tracking, analytics, or field-time network retries for core operation.
- Avoid animation and unnecessary screen wake locks.
- Location access, if later used, is explicit, optional, and never required to read emergency prompts.
- Provide a low-battery field posture: dim-friendly static screens and an immediate reminder to use physical backups.

## Failure-condition behavior

| Failure condition | Desired behavior |
| --- | --- |
| No signal | All core screens, public contacts, provenance, and display modes remain available. No retry loop or blocked screen. |
| Primary phone dies | Printed Field Guide and Pocket Card retain minimum plan and emergency information; backup phone has independently verified offline install. |
| Backup phone only | Cold launch works offline without prior session state or authentication; private data may be absent and is clearly labeled unavailable. |
| Phone reboots | App shell and complete last-installed dataset load offline; elapsed/current phase requires confirmation if restoration is uncertain. |
| PWA cold-launches offline | It opens directly from installed assets, shows embedded provenance, and does not wait for a network timeout. |
| Service-worker update incomplete | Continue using one complete previously verified release; never mix shell and dataset versions. Show Update incomplete — using installed Trip Data version. |
| Cached data stale | Show embedded version, generated time, last verified, and review state. Do not claim current. |
| Printed guide older than current data | Version/date stamp makes disagreement visible; pre-departure parity check replaces or marks the old print. In field, compare artifacts and use the most recently verified complete set without inventing changes. |
| Gloves reduce touch accuracy | Large separated controls, no precision gestures, and physical backup. |
| Screen wet | Critical functions remain single-tap and separated; avoid swipe/drag dependencies; physical backup available. |
| Direct sunlight | Daylight mode maintains contrast, large type, and unclipped critical content. |
| Night/headlamp use | One-tap persistent Red display; emergency text remains fully legible; mode never changes facts. |
| Battery below critical threshold | Display a neutral battery-conservation reminder and direct the user to physical backups; no field-critical function is disabled. |
| User under stress | Stable navigation, concise prompts, one-action Emergency, no dense planning content. |
| Emergency panel needed immediately | Opens in one primary action, offline, without setup; begins with CALL 911 FIRST and reporting prompts. |
| One artifact disagrees with another | Surface versions and dates; do not merge facts mentally or automatically. Treat as a stop condition for release and a reassessment condition in field. |
| Personal data unavailable | Public emergency procedure remains complete; private fields show Not available on this device rather than blanks that look loaded. |
| Public emergency contact changed | A new verified canonical-data version is required; older artifacts retain visible last-verified dates and must not claim current. |
| Device clock wrong | Label device time; allow manual phase selection; do not derive authorization or silently advance milestones. |
| Location permission denied/unavailable | Exact-location reporting prompts remain; manual location fields and physical map/reference workflow remain possible. |
| Local private store corrupt/unreadable | Fail closed for private values, preserve public content, and never substitute sample data. |
| Print damaged or unreadable | Use Pocket Card or verified offline PWA; pre-departure physical check requires replacement. |

## Explicit exclusions and scope rationale

| Excluded category | Why it remains in the full Mountain Guide |
| --- | --- |
| Road to 50 | It is a long-horizon objective/history program, not current-trip field information. |
| Mountain Intelligence | Broad intelligence and research increase field cognitive load and require different update patterns. |
| Complete summit-history database | Historical records do not answer the four immediate field questions. |
| Broad expedition planning | Planning choices belong upstream; the Companion consumes one approved trip plan. |
| Extensive research notes | Long-form evidence belongs with source analysis, not the field interface. |
| Planning scenario comparison | Scenario selection must be completed before canonical Companion data is generated. |
| Detailed long-form weather analysis | Weather refresh and analysis belong pre-departure; the Companion carries references, age, and observation prompts, not a live forecast dependency. |
| Complete gear-management system | Full inventory management is a separate planning workflow; only later-verified critical field reminders may be candidates. |
| Non-current mountain objectives | They create ambiguity about the active trip and increase accidental misuse. |
| Archive/history tools | Release history belongs in repository governance; field screens show only current installed provenance and necessary comparison data. |
| General mountain encyclopedia functions | They conflict with low cognitive load, current-trip scope, and offline package size discipline. |

Additional exclusions:

- route authorization or automated continue/turnaround result;
- rescue dispatch, rescue tracking, or implied emergency-service integration;
- live weather, live maps, or live location as a core dependency;
- private contact or medical database in Git;
- automatic jurisdiction selection presented as authoritative;
- unverified alternate/return routes;
- silent background update of field facts;
- editing the Mountain Guide from this repository.

## Definition of success

Phase 0 succeeds when:

- the product boundary and three-artifact architecture are internally consistent;
- the future public canonical-data contract is sufficiently defined to implement without inventing fields;
- public, device-local, and print-time private data are unambiguously separated;
- zero-connectivity behavior and failure fallbacks are specified;
- safety and emergency claims have testable invariants;
- scope exclusions prevent the Companion from becoming a second Mountain Guide;
- staleness, source authority, and artifact disagreement are visible and actionable;
- implementation phases have clear stop conditions;
- no runtime or production data has been created.

The implemented product later succeeds only when:

- all Contracts A–I pass;
- primary and backup iPhones cold-launch offline after force quit and reboot;
- all three artifacts derive public facts from one authoritative manifest and record the same manifest SHA-256, data version, source release/commit, and verified_at;
- critical controls and text pass target-viewport and physical field tests;
- printed artifacts pass daylight, headlamp, glove, wet-hand, waterproofing, and second-person tests;
- no private value enters Git or public output;
- the owner reviews and approves the release;
- a tagged release and rollback target exist.

## Known architectural weaknesses and review questions

1. **Offline staleness cannot be discovered remotely.** An offline artifact cannot know that a newer canonical dataset exists elsewhere. Mitigation is visible embedded provenance, an explicit pre-departure parity ritual, verification-age policy, and physical cross-check—not a false current indicator.
2. **Current phase cannot be trusted from schedule alone.** Planned time and actual progress can diverge, and the device clock can be wrong. Manual confirmation/selection is required.
3. **Private-data availability differs across artifacts and devices.** The initial release uses handwritten physical-card values outside the repository and no encrypted print pipeline. Any later PWA private feature remains device-local and requires separate post-trip design for lifecycle, deletion, and backup-device provisioning.
4. **Red display persistence has state semantics.** It must synchronize across screens without implying a safety state and must not make daylight recovery difficult.
5. **Source granularity requires schema implementation.** Phase 0 now requires durable upstream project/repository, release, commit, path, and semantic record/field/section locators, with line ranges supplemental only. Phase 1 must encode and validate that approved structure.
6. **Artifact generation tooling is not selected.** The architecture requires deterministic generation but does not yet choose a renderer for print/PDF or a web stack.
7. **Exact target devices and browser versions need confirmation.** The minimum automated reference is fixed at 390 × 844, but touch, safe-area, install, physical, and offline-upgrade criteria still require the actual primary and backup iPhone models and supported iOS baseline.
8. **Verification-age policy is not yet approved.** Different fields may require different review intervals; the product must not invent expiry windows.
9. **Public emergency contacts are intentionally absent.** They require later source verification, jurisdiction-neutral wording, and a re-verification policy.
10. **Navigation remains a testable proposal.** Three destinations plus a global Red toggle is recommended, but Phase 4/7 testing must validate reachability and comprehension.
