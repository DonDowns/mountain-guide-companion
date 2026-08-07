# Canonical Dataset Verification Report — Phase 1A

## Accepted Phase 1 status

- Branch: `feature/canonical-trip-data-v1`
- Companion baseline: `ec69e9dd8083411f94e5367a00b4c4e25d768601`
- Data version: `1.0.0`
- Schema version: `1.0.0`
- Frozen upstream release: `v15.3.10`
- Frozen upstream commit: `fb711292b2642c2296eb76c0cfe2531606029609`
- External verification date: 2026-08-07
- Release state: Phase 1 canonical dataset accepted; Phase 2 and Phase 3 drafting may proceed, while final field release remains scoped as described below

## Record inventory and status totals

The manifest contains 48 canonical records, unchanged from Phase 1, plus 33 external evidence records. External evidence records are not canonical facts and are excluded from the canonical-record total.

| Canonical status | Count | Meaning in the accepted dataset |
| --- | ---: | --- |
| verified_against_upstream | 32 | Frozen-source value retained; not promoted beyond its supported scope. |
| externally_verified | 15 | Tier 1–3 evidence supports the record for the stated scope. |
| pending_external_verification | 1 | Lily Lake operational trailhead coordinate/elevation remains incomplete. |
| conflicted | 0 | No material authoritative/upstream disagreement remains unresolved. |
| Other enum states | 0 | None used. |

Externally verified records are the two Lake Como access-start concepts, all four route segments, the Mount Lindsey access decision, all three public emergency contacts, and all five weather-reference locations.

## 1. Verified against frozen Mountain Guide

All 48 canonical records still pass read-only comparison to the pinned tag. Trip dates, owner-selected objectives, planning times, camp, transportation, public communications protocol, decision language, upstream route numbers, and all frozen numeric facts remain traceable to `v15.3.10`.

Records not promoted include owner/planning facts, the Lake Como area waypoint, and the three summit waypoints. The latter retain their frozen current-route-reference coordinates and LiDAR elevations while the external differences are disclosed below.

## 2. Authoritatively externally verified

### Emergency contacts

| County | Dispatch/non-emergency | Sheriff office | Official result |
| --- | --- | --- | --- |
| Alamosa | 719-589-5807 | 719-589-6608 | Exact match on county Sheriff page. |
| Huerfano | 719-738-1044 | 719-738-1600 | Exact match on county Sheriff page; public-safety page corroborates dispatch role. |
| Costilla | 719-672-3302 | 719-672-0673 | Exact match on county Sheriff and contact pages. |

All three canonical contacts now have `externally_verified` and `last_externally_verified` 2026-08-07T07:45:17Z. The immutable hierarchy remains: Call 911 first. County references are contextual; dispatch determines the responding agency from the incident location.

### Mount Lindsey access and waiver

Current access is supported for hiking the designated Mount Lindsey route only after executing the Trinchera Blanca Ranch landowner waiver. The waiver portal prohibits deviation from the designated access route, hunting, camping or overnight use, motorized/mechanical/wheeled transport, and drones on ranch property. It states that the route is not maintained or supervised.

CFI corroborates Upper Huerfano/Lily Lake access and private-land constraints. Current CMC and 14ers.com materials corroborate that the Northwest Gully remains an active standard route with a required waiver. The canonical Mount Lindsey route and access-decision records are therefore externally verified. The access state must still be rechecked before leaving service because landowner rules and conditions can change.

### Route profiles

| Canonical route | Start / endpoint | Distance scope | Gain | Difficulty / exposure | Result |
| --- | --- | --- | ---: | --- | --- |
| Lake Como approach from near 8,000 ft | Lower trailhead/start to Lake Como and return | 11.25 mi round-trip | 3,900 ft published cumulative gain | Class 1 / Low | Exact numeric agreement; scope resolved. |
| Lake Como approach from near 8,800 ft | Several 4WD pull-offs to Lake Como and return | 8.5 mi round-trip | 3,100 ft published cumulative gain | Class 1 / Low | Exact numeric agreement; scope resolved. |
| Blanca + Ellingwood from Lake Como | Lake Como, both summits, return to Lake Como | 7 mi round-trip | 3,000 ft published cumulative gain | Class 3 / Considerable | Exact agreement. |
| Mount Lindsey Northwest Gully | Huerfano/Lily Lake trailhead, summit, return | 8.25 mi round-trip | 3,500 ft published cumulative gain | Easy Class 3 / Considerable | Exact agreement. |

The Lake Como ambiguity is resolved precisely: both 11.25 miles and 8.5 miles are round-trip figures. `distance_scope` changed to `round_trip`, and each path now explicitly returns to its start. Neither distance nor gain changed.

The Blanca/Ellingwood route source allows either a Class 3 connecting ridge or descent to the standard trail before reascending. The canonical traverse remains optional. No Little Bear objective, alternate objective, or unsourced descent was added.

### Lake Como road and parking

- Approximately 8,000 feet is the lower published trailhead/start where ordinary 2WD access gives way to the rougher road context.
- Approximately 8,800 feet represents several popular 4WD pull-offs about 3.25 road miles higher, not one surveyed parking point.
- A high-clearance small 4WD may reach higher under favorable conditions, but parking becomes sparse and the road becomes substantially harder above approximately 10,000 feet.
- No Audi Q5 suitability or vehicle authorization is stated. Vehicle and parking choices remain human decisions based on actual conditions and clearance.
- Temporary/date-specific trailhead reports were reviewed but deliberately excluded from the immutable manifest.

### Weather reference locations

| Reference | NWS result | Context |
| --- | --- | --- |
| Lake Como | PUB 61,36 | Area/weather point, not exact campsite. |
| Blanca Peak | PUB 62,37 | Summit forecast reference. |
| Ellingwood Point | PUB 62,37 | Summit forecast reference. |
| Mount Lindsey | PUB 64,37 | Summit forecast reference. |
| Great Sand Dunes | PUB 62,44 | Friday visit/weather context, not a climbing objective. |

Each exact frozen coordinate resolved through the NWS Points API to a usable forecast endpoint. No current or future forecast value was added to the immutable manifest. NPS corroborates an approximately 8,200-foot general Visitor Center/campground/dunefield weather context for Great Sand Dunes.

## 3. Secondary-source corroboration only

### Lily Lake operational point

The official Forest Service material verifies NFSR 580 Upper Huerfano Road, NFST 1308 Lily Lake, and the public access corridor, but not a single parking/trailhead coordinate or elevation.

- 14ers.com: 37.62361, -105.47278 at 10,700 ft.
- Climb13ers: approximately 37.623486, -105.472903 at 10,725 ft.

These likely describe nearly the same operational area but differ in exact point and elevation. They were not averaged, selected, or copied into the canonical waypoint. Latitude, longitude, and elevation remain null.

### Lake Como point

The July 2026 GNIS coordinate for Lake Como is 37.5695982, -105.5140623, which rounds to the frozen 37.56960, -105.51406 area reference. A secondary topographic representation gives approximately 11,749 feet, one foot below the frozen/current route stop value of 11,750 feet. The difference is non-material; the frozen value remains unchanged.

### Modern summit reference values

Current 14ers.com peak pages exactly match the frozen coordinate/elevation pairs and label the elevations as LiDAR values. Because official GNIS points and the USGS named-summit elevation table use different representations, the summit waypoints remain `verified_against_upstream` rather than being promoted as authoritative navigation points.

## 4. Pending external verification

`waypoint-lily-lake-trailhead` is the only pending canonical record. Its latitude, longitude, and elevation remain null because an authoritative single operational point/elevation was not established.

This is a final-release verification item, not a Phase 2 or Phase 3 drafting blocker. Phase 2 may proceed because an authoritative Lily Lake coordinate/elevation is not required to design the Field Guide. The Field Guide and Pocket Card may be drafted without it, and an artifact that does not require the coordinate/elevation may omit it entirely. Phase 2 must omit or visibly withhold the unresolved value. No released artifact may print it as an authoritative field fact.

If a secondary point is ever used temporarily for development or visualization, it must be clearly noncanonical, traceable to its secondary source, excluded from release output, and never used for an emergency-location claim. Omitting the point until authoritative verification is preferred.

## 5. Conflicted

There are no canonical records marked `conflicted`.

Authoritative and upstream representations do differ, but the differences are not material for the stated field-reference use and were not used to choose replacement values:

| Location | Frozen route/reference value | Official external representation | Disposition |
| --- | --- | --- | --- |
| Blanca Peak coordinate | 37.57753, -105.48569 | GNIS 37.5775609, -105.4855987 | Small non-material point difference; frozen value retained. |
| Ellingwood Point coordinate | 37.58257, -105.49248 | GNIS 37.5824644, -105.4926087 | Small non-material point difference; frozen value retained. |
| Mount Lindsey coordinate | 37.58389, -105.44490 | GNIS 37.583803, -105.4446957 | Small non-material point difference; frozen value retained. |
| Blanca elevation | 14,350-ft LiDAR route reference | USGS map-era table 14,345 ft | Five-foot method/era difference; frozen value retained. |
| Ellingwood elevation | 14,057-ft LiDAR route reference | USGS map-era table 14,042 ft | Fifteen-foot method/era difference; frozen value retained. |
| Lindsey elevation | 14,055-ft LiDAR route reference | USGS map-era table 14,042 ft | Thirteen-foot method/era difference; frozen value retained. |
| Great Sand Dunes elevation context | 8,200-ft general weather context | NPS FAQ 8,170-ft Visitor Center | Different scope; general weather context retained. |

No coordinate or elevation was averaged. If a later navigation-grade requirement makes any difference operationally material, the affected record must be moved to `conflicted` and release work stopped pending owner resolution.

## 6. Deliberately excluded

- Current or saved forecast values.
- Time-sensitive fire restrictions, trailhead condition reports, and one-day road closures.
- A claim that no closure can arise before the August trip; current access must be rechecked.
- Audi Q5 capability, suitability, or authorization.
- Exact Lake Como campsite coordinates.
- A Lily Lake coordinate/elevation chosen from secondary sources.
- Little Bear, individual Blanca/Ellingwood alternatives, Mount Lindsey ridge variant as the selected route, or new objectives.
- Bailouts, shortcuts, escape routes, water sources, shelters, or unsourced descents.
- Partners, personal recipients, private phone/email, lodging access details, signed waiver contents, medical data, or device/account identifiers.
- Any runtime, HTML, CSS, PWA, service worker, PDF, image, Field Guide, or Pocket Card work.

## Exact manifest changes from external evidence

1. Updated `metadata.verified_at` to 2026-08-07T07:45:17Z.
2. Added 33 non-canonical `external_sources` evidence records with tier, URL, dates, fact, linked canonical IDs, and notes.
3. Promoted the near-8,000-ft and near-8,800-ft Lake Como access-start records to `externally_verified` without adding coordinates.
4. Changed both Lake Como route scopes from unspecified to `round_trip`, added the return start waypoint to each path, clarified route notes, and promoted both records.
5. Promoted the unchanged Blanca/Ellingwood and Mount Lindsey route records.
6. Promoted the Mount Lindsey access decision.
7. Promoted all three contact records and set their external-verification timestamps.
8. Promoted all five weather-reference records for NWS reference-point usability.

No canonical coordinate, elevation, distance, gain, class, exposure, phone number, trip date, planning time, objective, recommendation, or safety decision changed.

## Privacy, safety, provenance, and release posture

- Public phone values remain limited to the six official county numbers.
- No private email, personal recipient, medical/medication field, secret, account/device identifier, or local user path entered the repository.
- Required weather-evidence, 911-first, dispatch, actual-conditions, and planning-target invariants remain intact.
- No score, route authorization, rescue confirmation, or delivery confirmation was added.
- External evidence is linked to canonical records but is not a second source of truth.
- Phase 1 is accepted with one pending Lily Lake location record.
- `external_verification_hold` remains true as a scoped final-release hold for an artifact that requires the unresolved Lily Lake coordinate/elevation; it does not block Phase 2 or Phase 3 drafting.
- Nothing has been pushed, published, deployed, or advanced into Phase 2.

## Validation and hash procedure

The dependency-free validator now checks the minimal `external_sources` model, verifies that every evidence record points to canonical records, prevents ID collisions, and requires every `externally_verified` canonical record to have linked tier 1–3 evidence. It does not perform network calls during validation.

SHA-256 covers the exact `data/trip-manifest.json` bytes, including whitespace and the final newline. The aggregate runner calculated it twice with identical results:

`3cda95d4e6b1d5d7138dd2ca3320501d9b59076a0f9c9cfb3e67117ed5384758`

The manifest validator locks the latitude, longitude, and elevation triples shared by the Lake Como, Blanca, Ellingwood, and Mount Lindsey waypoint and weather-reference records. Each pair must remain exactly equal. Their verification statuses intentionally differ because waypoint records represent the pinned route dataset while weather-reference records carry separate external evidence for their weather-reference purpose. Numeric equality does not collapse those distinct record purposes or evidence states.

Final checks:

- `npm run check:data`: pass, including validation, provenance, privacy, safety, and repeated hash.
- `npm run check:manifest`: pass; 48 canonical records and 33 external evidence records.
- `npm run check:provenance`: pass; frozen tag resolves to the pinned commit and all locators compare.
- `npm run check:privacy`: pass; six allowlisted public phone values and zero private values.
- `npm run check:safety`: pass; five decision prompts and zero prohibited affirmative concepts.
- All 3 JSON files parsed; all 5 `.mjs` files passed `node --check`; `git diff --check` passed.
- Mountain Guide HEAD remained `49cc745d7481145ad64877fcc6a550d4a102d62a`, the authority tag remained pinned, and staged, unstaged, and untracked state remained empty.
