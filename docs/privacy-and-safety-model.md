# Privacy and Safety Model

## Purpose

This model defines what the Companion may store, display, generate, and claim. It is a design invariant for the future public repository, all generated artifacts, local PWA state, test data, logs, screenshots, print workflows, and release archives.

The Companion is a field reference and decision-support system. It is not route authorization, rescue guidance, a safety guarantee, a dispatch system, or proof that a communication was delivered.

## Standing principles

- Weather is evidence, not permission.
- Actual conditions govern the decision.
- Call 911 first in an emergency.
- Jurisdiction is contextual; dispatch determines the responding agency.
- A user-defined turnaround/exit target is a planning target, not an automatically derived safety cutoff.
- Absence of an alert is not evidence of safety or currency.
- A locally created message is a draft until a verified external transport confirms delivery.
- A cached or printed artifact exposes its age; it never quietly claims to be current.
- From the trailhead onward, every field-critical function works with zero connectivity and without DNS, live weather, GitHub, map tiles, remote fonts, a CDN, analytics, authentication, external APIs, or external data transfer.
- Canonical planning time uses America/Denver. The 4:15 AM planned start and 11:30 AM turnaround/exit target are explicit owner-defined facts, not values to recalculate silently.

## Threat and misuse model

The design anticipates:

- accidental publication of private contacts or medical/device data;
- private values leaking through fixtures, logs, screenshots, PDFs, CI artifacts, or browser storage exports;
- stale public contacts or route facts appearing current;
- a user interpreting favorable prompts, color, or completion as permission to continue;
- one county/contact being presented as sole route jurisdiction;
- an alternate route being treated as inherently safe;
- a draft message being mistaken for sent;
- a local status log being mistaken for external monitoring;
- a service-worker update mixing incompatible shell and data;
- a backup phone missing private data or the current dataset;
- an offline user being unable to learn that a newer version exists;
- device clock or location readings being wrong;
- emergency instructions being obscured by navigation, authentication, setup, or display mode;
- public-source fields becoming stale after release;
- a second person misreading abbreviations or hidden state under stress.

## Data classification

### A. Public canonical data

Data may enter Git only when it is intentionally public, source-traceable, and reviewed:

- trip title/area, dates, and public objectives;
- public camp and public-safe transportation description;
- verified route, waypoint, segment, junction, and return/descent facts;
- owner-defined planning times that the owner intends to publish;
- neutral decision/reassessment prompts;
- official public emergency contacts;
- public communication procedure without private recipients;
- public weather-reference locations;
- source release/commit, data version, verification dates, public source records, and uncertainty.

Public-safe does not mean safe to rely on indefinitely. Public facts still require provenance and staleness treatment.

### B. Device-local private data

Never committed, synchronized by default, or embedded in public artifacts:

- private phone numbers and email addresses;
- private check-in recipients;
- personal emergency-contact details;
- private medical history and medication lists;
- satellite account identifiers;
- device registration IDs;
- credentials, passwords, access tokens, or session secrets;
- actual-start time, current phase, personal notes, and local status history when they identify the trip/user;
- local draft messages;
- private location history;
- local acknowledgments or dismissed notices.

The initial release does not automate personal contacts, medical information, or other sophisticated private overlays. If such a PWA feature is approved after the trip, it must use a separately named, device-local store rather than fields inside the public manifest. Missing or unreadable local data displays Not available on this device. Sample or placeholder private data is never substituted.

### C. Handwritten / print-time private data

The public repository contains labeled blanks only. For the initial release, the owner may add private values only by hand or maintain them outside the repository and automated artifact process. There is no encrypted private-print pipeline and no automated private print merge.

Private printed copies:

- display the public data version and print time;
- are marked Private — do not distribute;
- are excluded from Git, CI, shared release ZIPs, screenshots, and public PDFs;
- are destroyed/replaced according to the owner's physical privacy practice;
- never become the canonical source for public facts.

### Prohibited data

The following never belongs in this repository in any form:

- real private contact examples;
- real medical/medication fixtures;
- live satellite/device identifiers;
- secrets or credentials;
- private source documents;
- exact private information not deliberately approved for publication.

Synthetic fixtures later used for tests must be unmistakably fictional and must not resemble owner data.

## Data-flow boundaries

### Public build path

Verified public sources → canonical public manifest → deterministic generators → public Field Guide, public Pocket Card template, and PWA public dataset.

Only allowlisted fields can cross this path. Each output carries the same canonical-data hash/version.

### Device-local path

Local actual-start/current-phase input → separate device-local operational store → local rendering.

Any future personal-contact, medical, or sophisticated private overlay is deferred until after the trip and requires a separate design approval.

The local path:

- never writes to the canonical manifest;
- never enters telemetry, analytics, crash reports, console logs, or service-worker cache;
- has an explicit clear-data control with confirmation;
- defines migration behavior between canonical data versions;
- fails closed when corrupt or incompatible;
- requires separate review before any export/backup feature.

### Private print path

Public generated template → handwriting outside the repository/automated build → physical private copy.

This is the only supported initial private-print path. Private values must not be written to the repository workspace or retained by a build service. Any automated or encrypted private-print workflow is deferred until after the trip and requires separate approval.

## Time-state boundary

- America/Denver is the canonical timezone for planning facts.
- The planned 4:15 AM start and 11:30 AM turnaround/exit target remain canonical until changed through a new data version.
- Actual start, elapsed time, and current phase are local operational state and cannot overwrite the plan on reload or reboot.
- Device-clock uncertainty is shown rather than hidden behind automatic phase selection.
- Phase 0 defines these rules but implements no time logic.

## Emergency model

### Mandatory hierarchy

The first critical instruction is:

**CALL 911 FIRST**

The emergency surface then prompts:

1. Exact location
2. Mountain
3. Route
4. Elevation
5. Coordinates, if available
6. Injuries
7. Party size
8. Weather and current conditions

No optional feature can appear above or block this sequence.

### Location integrity

- Device coordinates are optional evidence, not a prerequisite.
- Label coordinates with source and time when available.
- If location permission is denied or unavailable, preserve manual prompts.
- Never invent or interpolate a location and present it as measured.
- Never hide uncertainty about route, elevation, or coordinate accuracy.

### Jurisdiction integrity

- Public contacts may include contextual coverage notes.
- Do not state that one county necessarily owns an entire route.
- Do not automatically choose a responding agency and imply authority.
- Dispatch determines the responding agency.
- 911-first remains valid when jurisdiction is uncertain.

### Rescue and delivery integrity

The Companion may show only events it can substantiate.

Allowed local states:

- Draft prepared — not sent
- Copied to clipboard — not sent
- Opened in messaging app — delivery not confirmed
- Saved on this device
- No confirmation available

Prohibited without exact external confirmation:

- Rescue requested
- Rescue activated
- Help is on the way
- Message sent
- Message delivered
- Dispatch notified
- Search and rescue contacted

Even an external application's handoff is not delivery proof. A later integration requires explicit confirmation semantics, timeout/error handling, and a documented transport boundary.

### Emergency availability

Emergency content must:

- be packaged with the release;
- work offline on cold launch;
- be reachable in one primary action;
- remain readable in Daylight and Red display;
- require no authentication, local profile, or prior data entry;
- work when private data is absent;
- exist on the Field Guide and Pocket Card;
- include provenance and contact-verification age.

## Safety-language invariants

### Required language concepts

- Decision gate
- Reassessment prompt
- Turnaround consideration
- Under these conditions, reassess…
- Compare current conditions with…
- Consider remaining descent duration…
- Actual conditions govern the decision.
- Weather is evidence, not permission.

### Prohibited authorization language

- Go/No-Go matrix
- Safe to proceed
- All clear
- Route is safe
- Weather permits
- Approved to continue
- You should summit
- Safe to climb

Equivalent phrasing is also prohibited, including icons, badges, colors, sounds, scores, or completion states that communicate permission.

### Prohibited system behavior

- no green/red climb decision;
- no score that aggregates conditions into continue/stop;
- no check-list completion state labeled ready, cleared, approved, or safe;
- no automated turnaround time presented as authoritative;
- no claim that the absence of warnings is favorable;
- no silent hiding of expired/unverified facts;
- no use of Red display to imply danger status;
- no route recommendation generated from incomplete conditions.

### User-defined target semantics

The 11:30 AM turnaround/exit target is stored and displayed as:

- user-defined;
- a planning target;
- subject to actual weather, route exposure, pace, group condition, descent duration, and current circumstances.

The product may prompt an earlier reassessment because conditions differ. It does not calculate that 11:30 is safe, nor does it imply that reaching a point before 11:30 authorizes continuation.

## Decision-prompt model

A decision prompt contains:

1. **Observation:** what is actually visible/experienced now.
2. **Comparison:** which plan assumption or remaining requirement to compare.
3. **Uncertainty:** what is unknown or changing.
4. **Consideration:** reassessment/turnaround/descent-duration language.
5. **Invariant:** actual conditions govern.

No prompt writes a final state. User selections, if later supported, remain local observations and are not converted to authorization.

Prompts may cover:

- sky and weather evidence;
- wind;
- elapsed time and observed pace;
- terrain/exposure;
- group condition;
- altitude symptoms;
- remaining descent duration;
- access or route changes.

Medical content remains limited to recognizing that symptoms require reassessment/emergency action according to approved wording. The repository must not contain personal medical history or pretend to diagnose.

## Route uncertainty model

### Terminology

Prefer:

- known return option;
- known descent option;
- route junction;
- retreat consideration;
- verified alternative, if explicitly verified.

Do not use bailout as if an alternate route is automatically safe.

### Inclusion requirements

Any route alternative included later must have:

- a stable ID;
- source record;
- verification status;
- last verified date;
- explicit relationship to the active route;
- uncertainty/condition notes;
- no safe-route claim.

If an alternative is not verified, omit it from field artifacts or label it unavailable/needs reverification in a non-release draft. The interface must never construct alternatives from map geometry, generic route knowledge, or a language model.

### Changed access/route facts

A change creates a new canonical data version. Old artifacts retain their visible dates. In field, an unexpected route/access change triggers reassessment; the product does not improvise a route.

## Weather and staleness model

### Weather role

Weather information is evidence for human reassessment. It is not permission and is not a core live dependency.

The canonical dataset may later contain weather-reference locations and source metadata. A packaged pre-departure snapshot, if approved, must include:

- source;
- observation/forecast issue time;
- retrieval time;
- valid period;
- geographic reference;
- verification time;
- age/expiration semantics approved by the owner;
- Weather is evidence, not permission.

### Offline limit

Once offline, the Companion cannot know whether a source changed. Therefore it:

- shows the embedded age and valid period;
- does not show live/current unless it has a timestamped verified basis;
- never treats a failed update as evidence that nothing changed;
- asks the user to compare actual sky, wind, and conditions;
- preserves the last complete verified release rather than partial new data.

### Printed staleness

Every page/card side carries visible provenance. A pre-departure check compares all copies to the selected data version. Old print is replaced or visibly retired. An old physical artifact cannot update itself and must never use evergreen wording.

## Communication/status model

### Public protocol

The canonical manifest may describe:

- check-in steps;
- overdue-response procedure;
- public emergency escalation sequence;
- public template text with placeholders.

It contains no private recipients.

### Local status logging

If implemented later, a status entry is:

- saved on this device only;
- timestamped with labeled device time;
- associated with an installed data version;
- not monitoring, broadcasting, or delivery;
- deletable;
- available offline;
- clearly absent on an unprovisioned backup device.

### Draft creation

A draft:

- is assembled locally;
- includes only user-selected public facts and device-local private recipient/content;
- is labeled Draft — not sent;
- remains unsent after copy or external-app handoff;
- avoids automatic repeated sends;
- never changes the emergency hierarchy.

## Display-mode safety

### Daylight mode

- maximal outdoor contrast;
- large text and controls;
- no subtle gray critical information;
- no red/green status semantics;
- no automatic mode change based on ambient sensors.

### Red display

- one-tap global state;
- persistent across Companion screens;
- reversible with one action;
- readable and distinguishable without color alone;
- no content difference from Daylight mode;
- no implication of emergency, route status, or authorization;
- does not claim to preserve night vision.

Emergency content remains complete in both modes.

## Privacy verification requirements

Future automated checks scan:

- tracked files;
- Git history before release;
- generated artifacts;
- canonical data;
- schema examples and test fixtures;
- screenshots and visual-test snapshots;
- build logs and error reports;
- service-worker cache lists;
- browser storage export paths;
- PDF metadata;
- source maps and bundles.

Checks include:

- allowlist validation for canonical fields;
- secret scanning;
- private-key-name scanning;
- phone/email review;
- local absolute path review;
- synthetic-fixture markers;
- assertion that private overlays cannot be imported by public generators.

Human privacy review remains mandatory because automated pattern detection cannot determine publication intent.

## Safety verification requirements

Future checks:

- scan exact and semantic variants of prohibited language;
- assert required 911/location prompts in all emergency artifacts;
- assert decision prompts have no aggregate status output;
- assert the turnaround target includes user-defined/planning language;
- assert jurisdiction notes name dispatch as decision-maker;
- assert drafts remain unsent;
- assert route alternatives have provenance/status/date/uncertainty;
- assert provenance appears on every print page/card side and relevant PWA surfaces;
- visually verify that color, icons, and hierarchy do not imply permission.

Second-person review is mandatory; a test suite cannot reliably detect every implication.

## Incident and stop rules

Release work stops when:

- private data enters any tracked/generated/public path;
- a critical contact is unverified or conflicts with another source;
- a route fact or alternative lacks provenance;
- emergency instructions become conditional on network/local data;
- a communication state overclaims delivery;
- a decision surface implies authorization;
- a stale artifact is visually indistinguishable from the candidate;
- an incomplete update can replace the last complete offline release;
- primary or backup device physical tests fail;
- artifacts disagree on a public fact or data version.

An incident record must preserve:

- affected version/artifact;
- what leaked or conflicted;
- discovery method;
- containment;
- correction in a new version;
- whether prior public artifacts require withdrawal/destruction;
- owner disposition.

Never rewrite a released artifact to hide the incident.

## Unresolved privacy/safety questions

1. After the trip, whether any medical/medication data should exist even device-locally; the current default is no.
2. After the trip, whether a sophisticated device-local private overlay is needed and what encryption, deletion, migration, and backup-device controls it would require.
3. After the trip, whether any automated private-print workflow is worth its leakage risk; handwriting is the only supported initial method.
4. Which public emergency contacts are necessary, who verifies them, and at what interval.
5. Whether location coordinates should be captured, shown, or stored locally, and how accuracy/time are communicated.
6. How semantic safety-language review will detect implied authorization beyond exact banned phrases.
7. What local operational status retention and clear-data defaults are appropriate.
8. Which implementation mechanism will preserve actual-start/elapsed-time state across reload and reboot while surfacing device-clock uncertainty.
