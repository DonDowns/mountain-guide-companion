# Data Architecture Proposal

## Status and boundary

This document designs the future canonical public data contract. It does not create data/trip-manifest.json, data/trip-manifest.schema.json, production data, or runtime code.

The architecture has two levels of authority:

1. **Pinned upstream authority:** Don Downs Mountain Guide v15.3.10 at commit fb711292b2642c2296eb76c0cfe2531606029609, plus separately identified public source records when a required fact is not present upstream.
2. **Canonical Companion dataset:** one public-safe, trip-specific manifest version from which the Field Guide, Pocket Card, and Companion PWA derive all public facts.

The Companion manifest is canonical only inside the three Companion artifacts. It does not supersede the broader Mountain Guide.

## Proposed future files

- data/trip-manifest.json — canonical public-safe trip dataset.
- data/trip-manifest.schema.json — machine-enforced structural and field validation.

Neither file belongs in Phase 0.

Future supporting generated/release records may include a manifest hash and artifact checksums, but the canonical manifest cannot contain its own cryptographic hash without creating a self-reference. The release manifest owns the canonical-data file hash.

## Canonical-data design rules

1. The canonical manifest contains public-safe data only.
2. Unknown fields are rejected by schema rather than silently retained.
3. Every fact-bearing object references at least one source record.
4. Owner-defined planning values are identified as owner decisions, not external safety facts.
5. Route alternatives are absent unless specifically sourced and verified.
6. Public emergency contacts include a source and verification date.
7. A released manifest is immutable. A change creates a new data version.
8. One canonical public manifest is authoritative for a release. Artifact representations may differ, but every artifact is generated from that manifest and records the same manifest SHA-256.
9. Runtime/local observations never modify canonical data.
10. Schema validity is necessary but not sufficient for release; release-level completeness, safety, privacy, and physical tests also apply.

## Proposed root hierarchy

The future root object should reject additional properties and contain:

| Field | Type | Required | Privacy | Version behavior | Purpose |
| --- | --- | --- | --- | --- | --- |
| schema_version | semantic-version string | Yes | Public | Immutable within file; changes with schema | Identifies the structural contract. |
| data_version | semantic-version string | Yes | Public | Immutable within file; increments for canonical changes | Identifies public trip facts across artifacts. |
| metadata | object | Yes | Public | Immutable within version | Dataset identity, source pin, generation, verification, and state. |
| trip | object | Yes | Public | Immutable within version | Current trip identity and scope. |
| objectives | array of objective objects | Yes | Public | Versioned | Current-trip objectives only. |
| dates | object | Yes | Public | Versioned | Trip date range and time-zone context. |
| camp | object or null | Yes | Public | Versioned | Verified/user-supplied camp identity; null only in draft if absent. |
| transportation | object or null | Yes | Public-safe subset | Versioned | Public-safe vehicle/access description, without private identifiers. |
| planned_start | planning-time object | Yes | Public | Versioned | User-defined planned start. |
| turnaround_target | planning-time object | Yes | Public | Versioned | User-defined planning target with mandatory non-safety semantics. |
| waypoints | array of waypoint objects | Yes | Public | Versioned | Verified current-route waypoints; may be empty only in draft. |
| route_segments | array of segment objects | Yes | Public | Versioned | Verified links between waypoints; may be empty only in draft. |
| decision_points | array of decision-point objects | Yes | Public | Versioned | Neutral reassessment prompts anchored to route/timeline. |
| public_emergency_contacts | array of public-contact objects | Yes | Public | Versioned; strict reverification | Publicly publishable contacts only. |
| communications_protocol | object | Yes | Public | Versioned | Check-in/draft procedure without private recipients. |
| weather_reference_locations | array of reference objects | Yes | Public | Versioned | Locations/sources for pre-departure verification, not live permission. |
| source_records | array of source-record objects | Yes | Public | Append/version; immutable within file | Provenance for every fact. |

## Metadata object

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| trip_id | lowercase stable identifier string | Yes | Pattern-limited; never reused for a different trip. |
| title | non-empty string | Yes | Public-safe; no private names unless intentionally public. |
| language | BCP 47 string | Yes | Initial value expected to be en-US. |
| status | enum | Yes | draft, verified-candidate, or released. No current/safe/approved-to-climb state. |
| public_safe | boolean | Yes | Must equal true for any committed manifest. |
| generated_at | ISO 8601 timestamp with zone | Yes | Dataset-generation time, not artifact-render time. |
| verified_at | ISO 8601 timestamp with zone | Yes for candidate/release | Latest full canonical review time. |
| verification_state | enum | Yes | draft, needs-reverification, verified. |
| source_release | string | Yes | Initial release must equal v15.3.10. |
| source_commit | 40-character lowercase Git SHA | Yes | Initial commit must equal fb711292b2642c2296eb76c0cfe2531606029609. |
| change_summary | non-empty string | Yes after first version | Human-readable public-fact change summary. |
| supersedes_data_version | semantic version or null | Yes | Null only for first version; cannot equal data_version. |
| compatible_artifact_schema | object | Yes | Minimum/maximum supported artifact schema versions. |

The field names source_release, source_commit, data_version, and verified_at are required for the provenance contract. source_release and source_commit live in metadata; data_version remains at the root; verified_at lives in metadata. They should not be duplicated in multiple canonical locations.

## Trip, date, camp, and transportation objects

### trip

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| name | string | Yes | Public trip label. |
| area | string | Yes | Public, user-supplied or verified description. |
| primary_objective_id | objective ID | Yes | Must resolve to one objectives entry. |
| objective_ids | unique array of objective IDs | Yes | Current trip only. |
| source_record_ids | non-empty array of source IDs | Yes | Includes owner-decision source where applicable. |

### dates

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| start_date | ISO 8601 calendar date | Yes | Local trip date. |
| end_date | ISO 8601 calendar date | Yes | Must be on/after start_date. |
| time_zone | IANA time-zone identifier | Yes | Required to interpret local times; the initial canonical value is America/Denver. |
| source_record_ids | non-empty array | Yes | Owner decision or upstream source. |

### camp

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | stable identifier | Yes when object present | Unique. |
| name | string | Yes | Public-safe. |
| description | string or null | No | No invented route/access detail. |
| waypoint_id | waypoint ID or null | No | Must resolve if present. |
| verification_status | enum | Yes | owner-supplied, source-verified, needs-reverification. |
| verified_at | timestamp or null | Conditional | Required when source-verified. |
| source_record_ids | non-empty array | Yes | Provenance. |

### transportation

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| description | string | Yes when object present | Example supplied for initial design: Audi Q5. |
| private_identifiers_included | boolean | Yes | Must equal false. |
| access_assumptions | array of sourced statement objects | No | Empty until verified; never infer road capability. |
| source_record_ids | non-empty array | Yes | Provenance. |

License plate, VIN, tracking IDs, and other private vehicle identifiers are prohibited.

## Objectives

Each objective object contains:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| id | stable identifier | Yes | Unique within manifest. |
| name | string | Yes | Current-trip objective only. |
| role | enum | Yes | primary, secondary, or contextual. No authorized/approved state. |
| description | string or null | No | Concise, public-safe. |
| verification_status | enum | Yes | owner-supplied, source-verified, needs-reverification. |
| verified_at | timestamp or null | Conditional | Required for source-verified. |
| source_record_ids | non-empty array | Yes | All facts traceable. |

The initial primary objective supplied for later verification is Blanca Peak + Ellingwood Point. Mount Lindsey appears only in the supplied trip-area context and must not be promoted to an active objective without owner confirmation.

## Planning-time objects

planned_start and turnaround_target share:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| local_time | 24-hour HH:MM string | Yes | Interpreted with dates.time_zone. |
| basis | enum | Yes | owner-defined-planning-value only for initial release. |
| user_defined | boolean | Yes | Must equal true. |
| derivation | enum | Yes | manual. Automatic safety derivation is prohibited. |
| label | string | Yes | Must say planned start or turnaround/exit planning target. |
| safety_note | string | Yes | Must state that actual weather, exposure, pace, group condition, descent duration, and circumstances govern reassessment. |
| source_record_ids | non-empty array | Yes | Owner-decision record. |

turnaround_target must reject labels or notes containing safe cutoff, approved, all clear, or permission language. The initial 11:30 AM value is not a model-derived boundary.

The initial canonical planning facts are a 04:15 planned start and an 11:30 turnaround/exit planning target in America/Denver. They must not be silently recalculated from sunrise, forecast, device location, or device time. Future actual_start, elapsed-time, and current-phase values are local operational state: reload or reboot must not overwrite the canonical plan, and clock uncertainty must remain visible. Phase 0 implements no time logic.

## Waypoints

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| id | stable identifier | Yes | Unique; referenced by segments. |
| name | string | Yes | Verified public label. |
| kind | enum | Yes | trailhead, camp, junction, landmark, objective, return-point, other. |
| latitude | number or null | No | If present: −90 to 90; source required. |
| longitude | number or null | No | If present: −180 to 180; source required. |
| elevation | measurement object or null | No | Unit explicit; source and uncertainty required. |
| sequence | non-negative integer | Yes | Unique within an itinerary branch. |
| field_note | short string or null | No | Factual, concise, non-authorizing. |
| verification_status | enum | Yes | verified, needs-reverification, or omitted-from-release. |
| verified_at | timestamp or null | Conditional | Required for verified. |
| uncertainty_note | string or null | Conditional | Required when uncertainty is material. |
| source_record_ids | non-empty array | Yes | Provenance. |

A draft may contain an empty waypoint array. A release candidate for a Route artifact must satisfy later release-level minimum completeness; schema validation alone does not invent missing waypoints.

## Route segments

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| id | stable identifier | Yes | Unique. |
| from_waypoint_id | waypoint ID | Yes | Must resolve. |
| to_waypoint_id | waypoint ID | Yes | Must resolve and differ from from ID. |
| order | non-negative integer | Yes | Deterministic route ordering. |
| segment_type | enum | Yes | ascent, traverse, descent, approach, return, connector. |
| summary | short string | Yes | Verified factual description. |
| exposure_note | string or null | No | Sourced; no safety guarantee. |
| timing_reference | duration/range object or null | No | Planning reference only; must expose basis and uncertainty. |
| known_return_option_ids | array of segment/option IDs | Yes | Empty unless explicitly verified. |
| verification_status | enum | Yes | verified or needs-reverification. |
| verified_at | timestamp or null | Conditional | Required for verified. |
| uncertainty_note | string or null | Conditional | Required for incomplete/variable facts. |
| source_record_ids | non-empty array | Yes | Provenance. |

The schema does not contain a generic bailout field. Known return/descent options require a separate sourced object or segment and cannot be described as automatically safe.

## Decision points

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| id | stable identifier | Yes | Unique. |
| title | string | Yes | Uses Decision gate, Reassessment prompt, or Turnaround consideration. |
| anchor_type | enum | Yes | time, waypoint, route-segment, phase, or manual. |
| anchor_id | ID or null | Conditional | Must resolve for waypoint/segment/phase anchor. |
| observation_prompts | non-empty array of strings | Yes | Sky, wind, evidence, elapsed time, pace, terrain/exposure, group, altitude symptoms, descent duration, access changes as relevant. |
| comparison_prompts | non-empty array | Yes | References plan assumptions without calculating authorization. |
| reassessment_text | string | Yes | Neutral; actual conditions govern. |
| prohibits_authorization | boolean | Yes | Must equal true. |
| source_record_ids | non-empty array | Yes | Provenance for any factual threshold or route reference. |

No score, traffic-light state, pass/fail result, or continue recommendation belongs in this object.

## Public emergency contacts

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| id | stable identifier | Yes | Unique. |
| name | string | Yes | Official/public organization or service. |
| contact_type | enum | Yes | emergency, dispatch-context, land-manager, road/access, weather-source, other-public. |
| phone | public phone string or null | No | E.164-preferred representation plus display format; verified public. |
| sms_supported | boolean or unknown | Yes | Must not infer. |
| availability_note | string or null | No | Sourced; avoids guarantee. |
| jurisdiction_context | string | Yes | Contextual only; dispatch determines response. |
| verified_at | ISO timestamp | Yes | Contact-specific verification. |
| review_after | ISO date or null | No | Only if owner approves a review policy; not invented. |
| source_record_ids | non-empty array | Yes | Official public source required. |

911-first guidance is structural and is not replaced by a contact list. A release with zero verified public emergency contacts may still carry 911-first prompts, but the absence must be explicit and release review must decide whether that is acceptable.

## Communications protocol

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| check_in_steps | ordered non-empty array | Yes | Public procedure, not private recipients. |
| overdue_steps | ordered array | Yes | Neutral escalation procedure; no rescue confirmation. |
| draft_templates | array | No | Templates contain placeholders, not private values. |
| delivery_semantics | enum | Yes | draft-only for initial design. |
| confirmation_rule | string | Yes | Never claim sent/rescue/help without external confirmation. |
| private_recipient_source | enum | Yes | device-local or handwritten-only. |
| source_record_ids | non-empty array | Yes | Owner decision/protocol provenance. |

## Weather reference locations

Each object contains a stable ID, public label, source URL/identifier, geographic context if verified, purpose, verified_at, uncertainty note, and source_record_ids.

These records identify pre-departure evidence sources. They do not store an evergreen forecast and do not authorize field decisions. Any snapshot later packaged must carry observation/forecast time, retrieval time, valid period, source, age, and an explicit statement that actual conditions govern.

## Source records

Every source record contains:

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| id | stable identifier | Yes | Unique and referenced. |
| source_type | enum | Yes | mountain-guide-release, owner-decision, official-public-source, map, field-verification, other-reviewed-public. |
| title | string | Yes | Human-readable. |
| publisher | string or null | No | Required for official source where available. |
| upstream_project | string or null | Conditional | Stable project identity; required for repository-backed sources. |
| upstream_repository | public HTTPS URL or stable repository identifier, or null | Conditional | Required for repository-backed sources; never a local checkout path. |
| source_release | string or null | Conditional | Required when an upstream release exists. |
| source_commit | Git SHA or null | Conditional | Required for repository-backed sources. |
| public_url | HTTPS URL or null | No | Public source only. |
| source_path | string or null | Conditional | Durable repository-relative path; required for a repository file source. |
| semantic_locator | string | Yes | Stable record, field, section, or heading locator that remains meaningful when line numbers move. |
| line_range | string or null | No | Supplemental convenience only; never the sole locator or authority. |
| retrieved_at | timestamp or null | No | Required for web source. |
| verification_date | timestamp | Yes | Human verification date/time. |
| verification_status | enum | Yes | owner-supplied, verified, needs-reverification, or rejected. |
| verification_method | enum/string | Yes | owner-confirmed, repository-diff, official-site-check, physical-check, cross-source, other-documented. |
| privacy_classification | enum | Yes | Must equal public for committed manifest. |
| uncertainty_note | string or null | No | Required for material uncertainty. |
| notes | string or null | No | Public-safe. |

At least one record pins:

- source_release: v15.3.10
- source_commit: fb711292b2642c2296eb76c0cfe2531606029609

## Privacy classification

### A. Public canonical data

Allowed in the manifest after review:

- public trip identity and dates;
- public objectives, camp, and public-safe transportation description;
- verified route/waypoint/segment facts;
- user-defined planning times that the owner intends to publish;
- neutral decision prompts;
- official public emergency contacts;
- public communication procedure without private recipients;
- public weather-reference locations;
- provenance and verification records.

### B. Device-local private data

Never part of the manifest:

- personal phone/email recipients;
- private check-in contacts;
- medical history and medications;
- satellite account/device identifiers;
- local actual-start time, current phase selection, notes, status history;
- display preference if linked to an identifiable profile;
- any token, password, or credential.

The initial release does not automate personal contact, medical, or similar private overlays. If a future PWA adds private data after the trip, it must remain device-local in a separate design and must not reuse the public manifest export path.

### C. Handwritten / print-time private data

The committed print template contains labeled blanks only. For the initial release, private values are added by hand or maintained outside the repository and automated build. There is no encrypted private-print pipeline and no automated private print merge. Any future automation is a separately approved, post-trip design problem and must never place private values in Git, CI, logs, screenshots, public PDFs, or release archives.

## Immutable and mutable values

### Immutable within a released data version

- all canonical manifest bytes;
- schema_version and data_version;
- pinned source release and commit;
- each source record and verification timestamp;
- trip facts, planning values, contacts, prompts, and route records;
- change summary and supersession link.

### Mutable only through a new canonical data version

- trip dates/objectives;
- planned start or turnaround target;
- route/waypoint facts;
- public contacts;
- communication protocol;
- weather reference locations;
- provenance or uncertainty corrections.

### Runtime mutable and local-only

- actual start/elapsed time;
- manual current-phase selection;
- local notes and status log;
- private recipients/data;
- display mode;
- dismissed notices.

Runtime state can reference a canonical data version but never rewrite it.

## Validation layers

### 1. Structural schema validation

- required fields and exact types;
- additionalProperties false throughout;
- semantic-version, date, time, timestamp, URL, SHA, ID, and enum patterns;
- numeric coordinate/elevation bounds and explicit units;
- string length limits suitable for artifacts;
- unique IDs and no duplicate array items.

### 2. Referential validation

- objective IDs resolve;
- segment waypoint IDs resolve;
- decision anchors resolve;
- every source_record_id resolves;
- no orphan source record unless deliberately marked dataset-level;
- no circular or impossible segment reference.

### 3. Release completeness

Drafts may carry empty route/contact arrays. A release candidate must meet artifact-specific minimum content, including:

- one primary objective;
- usable dates/time zone;
- planning times with user-defined semantics;
- route/timeline content sufficient for the generated artifact;
- 911-first emergency structure;
- source coverage for every fact;
- verified_at values and no needs-reverification item on a critical path unless explicitly blocked from release.

### 4. Provenance validation

- initial source release/commit exact match;
- each factual leaf/object has a source;
- web records have retrieval and verification dates;
- owner decisions are not mislabeled as official facts;
- route alternatives have source, status, date, and uncertainty.

### 5. Privacy validation

- only allowlisted public fields;
- secret/credential/private-pattern scanning;
- fixture, log, screenshot, and generated-output scanning;
- reject local paths, private emails/numbers, tokens, device IDs, medical/medication keys, and private recipient fields.

Pattern scanning supplements human review; it cannot prove a value is public.

### 6. Safety-language validation

- reject prohibited authorization/all-clear phrases;
- reject green/red decision status fields;
- reject rescue/delivery confirmation claims;
- require Weather is evidence, not permission in relevant artifacts;
- require actual-conditions and planning-target language;
- require 911-first and reporting prompts;
- require contextual-jurisdiction wording.

### 7. Artifact parity

- generated public strings and values trace to manifest paths;
- representations may differ by artifact, but all three expose or record data_version, source_release, source_commit, manifest SHA-256, and verified_at from the one authoritative manifest/release record;
- parity tests prove that all three reference the same manifest hash;
- no artifact-owned copy of a public fact;
- transformations are formatting-only and deterministic.

## Versioning rules

### Schema version

- Major: breaking field/semantic change.
- Minor: backward-compatible optional/additive capability.
- Patch: clarification or constraint correction with no instance-shape break.

### Data version

- Major: different trip identity, primary plan, or route model that invalidates prior artifact assumptions.
- Minor: changed verified planning value, route fact, public contact, objective, or communication protocol that requires regenerated artifacts.
- Patch: non-semantic copy/provenance correction that does not change a field decision; still regenerates checksums and artifacts.

No released version is edited in place. Corrections supersede.

### Artifact version/build identity

Each artifact records:

- artifact type and renderer version;
- artifact build ID;
- canonical data version;
- canonical data SHA-256 from the release manifest;
- source Mountain Guide release/commit;
- artifact generated_at;
- canonical verified_at.

The PWA shell version is distinct from the canonical data version. Compatibility rules prevent an unsupported shell/data combination.

The five cross-artifact identity fields are data_version, source_release, source_commit, canonical manifest SHA-256, and verified_at. An artifact may expose them visibly, embed them, or record them in its release evidence as its format permits. It must not maintain a hand-copied competing value.

## Standard provenance stamp

Minimum visible form:

```text
Trip Data v1.x
Based on Mountain Guide v15.3.10
Source commit fb711292b2642c2296eb76c0cfe2531606029609
Generated: date/time with zone
Last verified: date/time with zone
```

Compact artifacts may abbreviate the commit visually, but the complete value remains available in a machine-readable or expanded release record. The data version and last-verified time must never be hidden.

## Staleness model

### What can be known offline

- installed/printed data version;
- source release/commit;
- embedded generation and verification times;
- optional approved review-after date;
- local device time, labeled as device time;
- whether the shell and dataset are internally compatible.

### What cannot be known offline

- whether a newer canonical version exists elsewhere;
- whether a public contact or route fact changed after verification;
- whether the device clock is correct;
- whether a forecast remains representative;
- whether another physical artifact was replaced.

Therefore the product never shows Current merely because no update was detected. It shows Installed Trip Data version and verification age. Pre-departure parity and physical comparison are mandatory.

If an owner-approved review_after policy is later added, crossing it changes the label to Needs reverification. It does not calculate safety or erase the data.

## Artifact consumption

### Field Guide generator

- reads the canonical manifest and schema-approved presentation configuration;
- creates three fixed-page sections;
- refuses unresolved references or critical needs-reverification fields;
- adds provenance to every page;
- contains no independently maintained trip facts.

### Pocket Card generator

- selects only emergency-integrity fields through an explicit allowlist;
- adds blank private placeholders;
- uses the same public contact objects and provenance;
- fails rather than silently dropping required 911/location prompts.

### Companion PWA

- packages the canonical manifest atomically with a compatible shell;
- treats manifest data as read-only;
- stores private/local state in a separate namespace keyed to data_version;
- loads core content from installed assets without DNS, live weather, GitHub, map tiles, remote fonts, CDNs, analytics, authentication, external APIs, or any other field-critical network dependency;
- shows an incompatibility/error surface while preserving the last complete release if activation fails.

## Data update workflow

1. **Trigger:** owner change, source update, contact verification, route correction, or scheduled review.
2. **Pin:** record the exact upstream release/commit and source snapshot.
3. **Classify:** decide whether each value is public canonical, device-local private, handwritten/print-time private, or prohibited.
4. **Verify:** use the source-record method; record uncertainty and verification time.
5. **Edit on a branch:** update the future manifest and sources; never edit released bytes.
6. **Validate:** schema, references, provenance, privacy, safety language, and staleness rules.
7. **Diff:** produce a semantic public-fact change report against the prior data version.
8. **Generate:** create all three artifact representations from the one canonical candidate manifest.
9. **Parity check:** verify values, data hash/version, source pin, and provenance across artifacts.
10. **Automated runtime/print checks:** offline, service-worker upgrade, target viewport, accessibility, and fixed-page layout.
11. **Physical validation:** primary/backup phones, reboot/cold launch, light, gloves, wet hands, printing, waterproofing, communication path, and second-person use.
12. **Owner approval:** resolve all findings and approve the candidate.
13. **Release:** merge by approval, tag, checksum, archive evidence, and retain rollback release.
14. **Departure readiness:** install both phones, print public templates, add any private values by hand outside the repository, verify artifact parity, then enter field with no network dependency.

## Open decisions for Phase 1

1. Exact schema draft and JSON Schema version.
2. Minimum route/contact completeness for candidate versus release.
3. Field-specific verification-age/review-after policy.
4. Public transportation-detail boundary.
5. Canonical handling of multiple trip days and objective-specific timelines.
6. Coordinate/elevation source priority and uncertainty representation.
7. Public emergency-contact verification owners and sources.
8. Post-trip decision on whether to design a sophisticated device-local private overlay, including lifecycle, migration, backup-device provisioning, encryption, deletion, and no-cloud posture.
9. Artifact compatibility range representation.
10. Deterministic generator/tooling choices.
