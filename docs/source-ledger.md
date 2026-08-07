# Canonical Data Source Ledger

## Scope and authority

This ledger summarizes the canonical fact groups and the Phase 1A evidence in `data/trip-manifest.json`. It is a review aid, not a second source of truth. The JSON manifest owns the canonical values.

Frozen-source inspection used Mountain Guide release `v15.3.10` at commit `fb711292b2642c2296eb76c0cfe2531606029609` through read-only Git object access. External verification was performed on 2026-08-07 for the August 2026 trip context. No value from current Mountain Guide `main` was imported.

Status meanings:

- `verified_against_upstream`: the canonical value matches the frozen release; current real-world truth is not implied.
- `externally_verified`: tier 1–3 evidence supports the record for the stated scope.
- `pending_external_verification`: authoritative verification remains incomplete; final release is blocked only for an artifact that requires the unresolved fact.
- `conflicted`: a material authoritative/upstream disagreement is unresolved.

Evidence tiers:

- Tier 1 — responsible government agency, public authority, or primary landowner/access authority.
- Tier 2 — CFI or another established organization directly documenting the access arrangement.
- Tier 3 — established route reference used only where responsible agencies do not publish the needed route-profile detail.
- Tier 4 — secondary corroboration only; never sufficient by itself for `externally_verified`.

## Frozen Mountain Guide ledger

| Canonical group | Frozen source locator | Frozen status | Phase 1A outcome |
| --- | --- | --- | --- |
| Trip, dates, camp, transportation, objectives | `js/trips.js`, `tripSeedLakeComo()` | verified_against_upstream | Retained; these are owner/planning facts, not external claims. |
| Timezone and weather reference values | `js/core.js`, `WEATHER_LOCATIONS` | verified_against_upstream | Five weather-reference records externally verified for NWS point usability; frozen numeric values retained. |
| Route profiles | `js/core.js`, `ROUTE_PROFILES` records `como0`, `elli3`, `lind1` | verified_against_upstream | All four route records externally verified. Lake Como distance scope resolved as round-trip without changing distance or gain. |
| Objective and access context | `js/shared.js`, `config.focusObjectives` | verified_against_upstream | Mount Lindsey access decision externally verified; owner-selected objectives remain upstream-only. |
| Emergency contacts | `js/shared.js`, `config.emergencyAreas` | verified_against_upstream | All six public numbers and roles agree with official county pages. Call 911 first; dispatch determines response. |
| Timeline and decision prompts | `index.html`, sections `#sat`, `#sun`, `#mon`, `#emergency` | verified_against_upstream | Prompts retained; no external source turns a prompt into authorization. |
| Communications behavior | `index.html`, `communicationChecksCard`; `js/v15_3_10.js`, `renderEmergencySection` | verified_against_upstream | Retained; no private recipient or delivery claim added. |
| Route schematic context | `index.html`, `#routes` | verified_against_upstream | Used to preserve area-point and missing-trailhead-elevation qualifications. |

## Canonical Phase 1A outcomes

| Record/group | Canonical outcome | Status | Qualification |
| --- | --- | --- | --- |
| Alamosa, Huerfano, Costilla public contacts | Exact dispatch and sheriff-office numbers agree with county sources | externally_verified | County context is not a fixed route-jurisdiction assignment. |
| Lake Como road start near 8,000 ft | Lower published trailhead/start concept corroborated | externally_verified | Coordinate remains null; no vehicle authorization. |
| Lake Como pull-offs near 8,800 ft | Several popular 4WD pull-offs corroborated | externally_verified | Not a single surveyed parking point; coordinate remains null. |
| Lake Como approaches | 11.25 mi/3,900 ft and 8.5 mi/3,100 ft, Class 1, low exposure | externally_verified | Both mileages are explicitly round-trip; gains remain published cumulative values. |
| Blanca + Ellingwood combination | 7 mi round-trip/3,000 ft from Lake Como, Class 3, considerable exposure | externally_verified | Class 3 ridge or descent to standard trail; traverse remains optional. |
| Mount Lindsey Northwest Gully | 8.25 mi round-trip/3,500 ft, Easy Class 3, considerable exposure | externally_verified | Waiver and designated-route restrictions apply. |
| Mount Lindsey access decision | Current waiver requirement and designated hiking-access scope established | externally_verified | Recheck before leaving service; conditions and landowner rules can change. |
| Lily Lake Trailhead | Trail/corridor identity established; exact operational parking point not authoritatively established | pending_external_verification | Latitude, longitude, and elevation remain null; drafting may proceed if the fields are omitted or visibly withheld. |
| Lake Como area point | GNIS coordinate rounds to frozen coordinate; secondary elevation differs by 1 ft | verified_against_upstream | Area/weather reference, not exact campsite. No replacement or averaging. |
| Blanca, Ellingwood, Lindsey summit waypoints | Current route reference supports frozen LiDAR values; GNIS points and USGS map-era elevations differ slightly | verified_against_upstream | Differences are non-material for field reference and fully disclosed; waypoints are not promoted as navigation authority. |
| Five weather reference locations | Exact frozen coordinates resolve to usable NWS forecast endpoints | externally_verified | No current forecast value is immutable data. Great Sand Dunes remains visit/weather context. |

## External evidence inventory

Every evidence page used in the Phase 1A comparison is listed below. `Retrieved` is the verification date; publication/update date, when available, is stored in `external_sources` in the manifest.

| Evidence ID | Authority / tier | Retrieved | URL | Use and disposition |
| --- | --- | --- | --- | --- |
| ext-alamosa-sheriff | Alamosa County / 1 | 2026-08-07 | https://www.alamosacounty.org/185/Sheriff | Both numbers and roles agree. |
| ext-alamosa-directory | Alamosa County / 1 | 2026-08-07 | https://www.alamosacounty.org/Directory.aspx?did=55 | Official directory corroboration. |
| ext-huerfano-sheriff | Huerfano County / 1 | 2026-08-07 | https://huerfano.us/sheriff/ | Both numbers and roles agree. |
| ext-huerfano-public-safety | Huerfano County / 1 | 2026-08-07 | https://huerfano.us/public-safety/ | Dispatch role corroborated; temporary fire state excluded. |
| ext-costilla-sheriff | Costilla County / 1 | 2026-08-07 | https://www.costillacounty.gov/sheriff | Both numbers and roles agree. |
| ext-costilla-contact | Costilla County / 1 | 2026-08-07 | https://www.costillacounty.gov/contact-us | Official directory corroboration. |
| ext-lindsey-waiver | Trinchera Blanca Ranch waiver portal / 1 | 2026-08-07 | https://www.mountlindseywaiver.com/ | Waiver, designated access, and restrictions established. |
| ext-cfi-lindsey | Colorado Fourteeners Initiative / 2 | 2026-08-07 | https://www.14ers.org/peaks/sangre-de-cristo-range/mount-lindsey/ | Access corridor, private-land, and trailhead context. |
| ext-cmc-lindsey-route | Colorado Mountain Club / 2 | 2026-08-07 | https://www.cmc.org/education-adventure/trips/routes-places/mount-lindsey-northwest-ridge-14-055-feet | Current waiver/access and route-profile corroboration. |
| ext-cmc-lindsey-trip | Colorado Mountain Club / 2 | 2026-08-07 | https://www.cmc.org/education-adventure/trips/find-trips/summit-2026-2013-mt-lindsey-northwest-gully | 2026 Northwest Gully use with required waiver. |
| ext-usfs-lily-access | U.S. Forest Service / 1 | 2026-08-07 | https://www.fs.usda.gov/Internet/FSE_DOCUMENTS/stelprdb5056405.pdf | NFSR 580 and NFST 1308 identity; no point coordinate. |
| ext-usfs-trails-catalog | U.S. Forest Service / 1 | 2026-08-07 | https://catalog.data.gov/dataset/national-forest-system-trails-feature-layer-f51e8 | Preferred official trail-data class; no single operational point obtained. |
| ext-14ers-lily-trailhead | 14ers.com / 3 | 2026-08-07 | https://www.14ers.com/php14ers/trailheadsview.php?thparm=sc02 | Secondary 37.62361, -105.47278 / 10,700-ft point; not adopted. |
| ext-climb13ers-lily-trailhead | Climb13ers / 4 | 2026-08-07 | https://www.climb13ers.com/colorado-13ers/trailhead/lily-lakehuerfano-creek-th | Secondary differing point/elevation; not adopted or averaged. |
| ext-14ers-lindsey-route | 14ers.com / 3 | 2026-08-07 | https://www.14ers.com/route.php?route=lind1 | Selected route values agree; current waiver link present. |
| ext-usgs-gnis-colorado | USGS / U.S. Board on Geographic Names / 1 | 2026-08-07 | https://prd-tnm.s3.amazonaws.com/StagedProducts/GeographicNames/DomesticNames/DomesticNames_CO_Text.zip | July 2026 official feature coordinates; differences documented. |
| ext-usgs-gnis-methodology | USGS / 1 | 2026-08-07 | https://www.usgs.gov/us-board-on-geographic-names/what-geographic-names-information-system-gnis | NAD 83 and representative-coordinate/elevation interpretation. |
| ext-usgs-summit-elevations | USGS / 1 | 2026-08-07 | https://www.usgs.gov/educational-resources/elevations-named-summits-over-14000-feet-above-sea-level | Map-era summit elevations compared; frozen LiDAR values retained. |
| ext-14ers-blanca-peak | 14ers.com / 3 | 2026-08-07 | https://www.14ers.com/peaks/10004/blanca-peak | Frozen 14,350-ft LiDAR point corroborated. |
| ext-14ers-ellingwood-peak | 14ers.com / 3 | 2026-08-07 | https://www.14ers.com/peaks/10042/ellingwood-point | Frozen 14,057-ft LiDAR point corroborated. |
| ext-14ers-lindsey-peak | 14ers.com / 3 | 2026-08-07 | https://www.14ers.com/peaks/10043/mount-lindsey | Frozen 14,055-ft LiDAR point corroborated. |
| ext-topozone-lake-como | TopoZone / 4 | 2026-08-07 | https://www.topozone.com/colorado/alamosa-co/lake/lake-como/ | Secondary GNIS/topographic Lake Como corroboration; 1-ft difference retained as note. |
| ext-14ers-lake-como-route | 14ers.com / 3 | 2026-08-07 | https://www.14ers.com/route.php?route=como0 | Resolves both mileages as round-trip; road tiers corroborated. |
| ext-14ers-lake-como-trailhead | 14ers.com / 3 | 2026-08-07 | https://www.14ers.com/php14ers/trailheadsview.php?thparm=sc01 | 8,000-/8,800-ft start concepts and parking limits. |
| ext-14ers-blanca-ellingwood-route | 14ers.com / 3 | 2026-08-07 | https://www.14ers.com/route.php?route=elli3 | Combination profile and optional route relationship agree. |
| ext-nws-lake-como | National Weather Service / 1 | 2026-08-07 | https://api.weather.gov/points/37.56960,-105.51406 | Resolves to PUB 61,36. |
| ext-nws-blanca | National Weather Service / 1 | 2026-08-07 | https://api.weather.gov/points/37.57753,-105.48569 | Resolves to PUB 62,37. |
| ext-nws-ellingwood | National Weather Service / 1 | 2026-08-07 | https://api.weather.gov/points/37.58257,-105.49248 | Resolves to PUB 62,37. |
| ext-nws-lindsey | National Weather Service / 1 | 2026-08-07 | https://api.weather.gov/points/37.58389,-105.44490 | Resolves to PUB 64,37. |
| ext-nws-dunes | National Weather Service / 1 | 2026-08-07 | https://api.weather.gov/points/37.73290,-105.51280 | Resolves to PUB 62,44. |
| ext-nps-dunes-weather | National Park Service / 1 | 2026-08-07 | https://home.nps.gov/grsa/planyourvisit/weather.htm | 8,200-ft general weather context. |
| ext-nps-dunes-visitor-center | National Park Service / 1 | 2026-08-07 | https://www.nps.gov/grsa/planyourvisit/visitor-center.htm | Current Visitor Center context. |
| ext-nps-dunes-faq | National Park Service / 1 | 2026-08-07 | https://www.nps.gov/grsa/faqs.htm | 8,170-ft specific Visitor Center value; context distinction documented. |

## Scoped final-release hold and hash rule

The only remaining `pending_external_verification` record is `waypoint-lily-lake-trailhead`. Its official trail/access identity is known, but an authoritative operational parking/trailhead point and elevation were not established. This is a scoped final-release hold, not a drafting hold: Phase 2 and Phase 3 may proceed, and artifacts that do not need the coordinate/elevation may omit it entirely. No released artifact may print the unresolved value as authoritative. A temporary secondary point, if ever used for development or visualization, must be noncanonical, source-traceable, excluded from release output, and never used for an emergency-location claim; omission remains preferred.

The canonical hash is lowercase SHA-256 over the exact bytes of `data/trip-manifest.json`, including whitespace and its final newline. The manifest does not contain its own hash. `scripts/run-data-checks.mjs` calculates it twice and requires identical results.
