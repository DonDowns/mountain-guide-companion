# Companion PWA Design

## Status and product boundary

The Phase 6 Companion is a physical-test candidate with the production offline runtime completed in Phase 5. It answers four current-trip questions: where the crew is in the plan, what matters now, what should cause reassessment, and what to do in an emergency. It does not reproduce Road to 50, Mountain Intelligence, planning databases, live weather analysis, archives, a full gear system, or non-current objectives.

Protected-main Pages automation publishes `0.6.0-candidate.2` at the configured Companion origin solely to enable physical tests. Phase 6A adds the documented mountain-earth visual system without changing canonical data, safety meaning, privacy behavior, or offline architecture. No field-release tag exists. Physical Airplane Mode, force-quit, reboot, primary/backup/friend iPhone, and field-use evidence remain release gates.

## Runtime architecture

The runtime is plain HTML, modern CSS, ES modules, local SVG icons, a web app manifest, and packaged/generated public data. It has no remote font, CDN, analytics, authentication, API, map, live-weather, or remote-script dependency.

`scripts/build-pwa.mjs` validates `data/trip-manifest.json`, computes its exact SHA-256, verifies both print artifact records, and deterministically generates:

- `js/companion-data.js` — immutable selected current-trip facts and runtime identity;
- `release.json` — the candidate metadata contract consumed optionally by the Mountain Guide Crew tab.

Hand-maintained HTML, CSS, and JavaScript contain UI structure and safety-boundary copy, not trip dates, objective names, planning times, route values, phone numbers, data version, source release/commit, or manifest fingerprint. Automated checks reject those canonical literals outside the generated module.

## Friend first-open flow

The root URL is a friend-facing landing experience suitable for a QR scan, text, AirDrop, or copied link. Above the mobile fold it presents the product name, current trip, Open Companion, Install for Offline Use, and a concise explanation. No repository or developer terminology is exposed.

In an ordinary browser the setup panel shows INSTALL FOR OFFLINE USE. iPhone/iOS wording directs the user to Safari, Share, Add to Home Screen, one online installed launch, Offline Check, and a later physical Airplane Mode test. A programmatic Install Companion action appears only when the browser supplies `beforeinstallprompt`.

Standalone detection uses the display-mode media query and iOS `navigator.standalone`. The standalone panel is titled INSTALLED COMPANION and exposes Companion version, Trip Data version, source release, verified date, and manifest fingerprint through the persistent provenance and setup checklist.

## Setup and Offline Check boundary

The setup checklist can truthfully complete packaged-resource checks in Phase 5:

- trip data loaded;
- emergency contacts loaded;
- production worker control and runtime/release/bundle identity match;
- every required resource passes byte-size and SHA-256 verification;
- installed/standalone detection when observed.

Offline Check verifies the controlling worker's complete active bundle locally: exact cache/bundle identity, completion marker, resource count, every listed asset, canonical/release identity, three objectives, four routes, five decision gates, six public numbers, nine milestones, rendered core sections, and both PDFs. Its result is `OFFLINE RESOURCES VERIFIED` or `OFFLINE RESOURCES INCOMPLETE`, followed by an explicit statement that software-resource verification does not verify mountain conditions, access, weather, or route safety.

`scripts/build-offline.mjs` generates the explicit `offline-bundle.json` and production `service-worker.js` from actual bytes. Installation is marker-last and hash-verified; a failed candidate is deleted without replacing the last complete release. Field-critical fetches resolve only from one verified active cache, preventing network/cache or old/new mixing. See `docs/offline-architecture.md` for lifecycle, retention, repair, storage, and test details.

The physical Airplane Mode checklist remains pending until a user displays the eleven instructions and records completion on that phone. Automation never sets this mark.

## Navigation and field hierarchy

Persistent navigation provides Timeline, Route, Emergency, and Red. Emergency is a primary control from every normal screen. The sticky header and safe-area-aware bottom navigation use at least 44×44 CSS-pixel critical targets, and section scroll offsets prevent the header from hiding emergency content.

Timeline renders all three canonical objectives and six planning values. Planned Start and Planning Target remain visible when an actual start is locally recorded. Actual start and elapsed basis never rewrite canonical times.

Decision Gates renders all five canonical prompts as expandable neutral reassessment content. No score, pass/fail state, aggregate verdict, or color authorization exists.

Route renders the four canonical profiles as comparison cards with round-trip distance, cumulative gain, class, exposure, route notes, and return/access considerations. It includes no fabricated map or continuous elevation profile. Lily Lake coordinates/elevation remain absent and visibly pending final verification.

Emergency begins with CALL 911 FIRST, reporting prompts, dispatch/jurisdiction language, and all six canonical public numbers as `tel:` links. Opening a phone intent is explicitly not proof that a call occurred.

## Local-state schema version 2

The separate local store contains only:

- selected objective;
- actual-start timestamp and elapsed-time basis by objective;
- locally marked communication milestones;
- Red Display state;
- brief local status note;
- optional private contact name, phone, alternate, and note;
- setup/open/check progress, bundle-scoped offline verification, and physical Airplane Mode user attestation.

The state loader is allowlist-based, length-bounded, versioned, and fail-closed on unknown/corrupt versions. Migration from schema version 1 preserves operational/private values but does not promote the old structural check into an offline verification. Defaults are empty, and Clear Private Data removes all optional private contact fields after confirmation. There is no cloud synchronization, export, logging, telemetry, URL encoding, or share inclusion. Service workers neither read nor cache the local store.

Milestone checks mean Marked locally only. The canonical delivery disclaimer remains visible.

## Sharing and URL privacy

Share uses `navigator.share` when available and otherwise copies the single configured public URL. The payload contains only title, public explanatory text, and that URL. It never includes query parameters, local state, actual start, milestones, status notes, contact fields, or storage content.

No external QR API is used. The stable public URL is directly QR-encodable without state; QR presentation belongs to the separate Mountain Guide Crew tab.

## Display and accessibility

Red is a persistent presentation control with `aria-pressed`; it changes no content or safety state. A synchronous local bootstrap applies Red before the main module renders to reduce daylight flashing on reload. Daylight and Red both use explicit text, borders, and icons rather than color-only meaning.

The shell uses semantic header/main/nav/footer landmarks, native controls, visible focus, labeled fields, native details disclosure, heading hierarchy, reduced-motion handling, safe-area insets, and responsive portrait/landscape layouts. Playwright runs Chromium and WebKit at desktop and 390×844 mobile. Axe checks the first-open, Timeline, Route, Emergency, and Red states against WCAG 2.1 AA rules. Physical VoiceOver, increased-text, sunlight, headlamp, glove, wet-finger, and actual iPhone testing remain release gates.

## Physical artifacts

The landing experience presents the Interactive Companion, 3-Page Field Guide, and Emergency Pocket Card without duplicating PDF content. PDF links are local package-relative URLs. Both PDFs are members of the atomic, hash-verified offline bundle and are exercised through offline browser fetches. Public candidate access does not make either PDF a field release.

## Remaining release gates

Technical Phase 5 requirements are implemented and Phase 6 provides the candidate deployment path. Field release still requires the physical primary/backup/friend iPhone plan, actual force-quit and reboot evidence, physical print/readability checks, owner review, remaining scoped Lily Lake disposition for any artifact that requires the unresolved field, and a separate final tag decision.
