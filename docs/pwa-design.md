# Companion PWA Design

## Status and product boundary

The Phase 6 Companion is a physical-test candidate with the production offline runtime completed in Phase 5. It answers four current-trip questions: where the crew is in the plan, what matters now, what should cause reassessment, and what to do in an emergency. It does not reproduce Road to 50, Mountain Intelligence, planning databases, live weather analysis, archives, a full gear system, or non-current objectives.

Candidate `0.6.0-candidate.9` is a local repair for review and physical testing. Phase 6A adds the documented mountain-earth visual system, Phase 6A.1 simplifies field-facing copy, the pre-Crew audit remediation strengthens offline navigation and lifecycle behavior, candidate.5 improves field navigation and local communication preparation, candidate.6 clarifies friend setup and installed navigation, candidate.8 adds scoped onboarding, offline Help, explicit status, and copy-only support reports, and candidate.9 restores neutral device-clock verification age without turning age into package or update state. None changes canonical data, safety meaning, privacy behavior, or service-worker transaction architecture. No field-release tag exists. Physical Airplane Mode, force-quit, reboot, primary/backup/friend iPhone, and field-use evidence remain release gates.

## Runtime architecture

The runtime is plain HTML, modern CSS, ES modules, local SVG icons, a web app manifest, and packaged/generated public data. It has no remote font, CDN, analytics, authentication, API, map, live-weather, or remote-script dependency.

`scripts/build-pwa.mjs` validates `data/trip-manifest.json`, computes its exact SHA-256, verifies both print artifact records, and deterministically generates:

- `js/companion-data.js` — immutable selected current-trip facts and runtime identity;
- `release.json` — the candidate metadata contract consumed optionally by the Mountain Guide Crew tab.

Hand-maintained HTML, CSS, and JavaScript contain UI structure and safety-boundary copy, not trip dates, objective names, planning times, route values, phone numbers, data version, source release/commit, or manifest fingerprint. Automated checks reject those canonical literals outside the generated module.

## Friend first-open flow

The root URL is a friend-facing landing experience suitable for a QR scan, text, AirDrop, or copied link. In a browser it presents Mountain Guide Companion, Set Up This Phone, Install for Offline Use, Continue in Browser, Share Companion, and a plain-language offline recommendation. When launched from the Home Screen it presents Companion Home, Open Trip Companion, Offline Check, the Field Guide, the Pocket Card, and Share Companion. No repository or developer terminology is exposed.

In an ordinary browser the setup panel labels offline installation as recommended for trip partners. iPhone/iOS wording directs the user to Safari, Share, Add to Home Screen, one online installed launch, Offline Check, and a later physical Airplane Mode test. A programmatic Install Companion action appears only when the browser supplies `beforeinstallprompt`.

Standalone detection uses the display-mode media query and iOS `navigator.standalone`. Setup completes only when standalone display, current-page service-worker control, and required offline-resource verification all succeed. The setup panel then becomes quiet and remains available through Help & Diagnostics recovery actions rather than persisting as a misleading header action. Companion version, Trip Data version, source release, verified date, and manifest fingerprint remain in persistent provenance.

## Setup and Offline Check boundary

The setup checklist can truthfully complete packaged-resource checks in Phase 5:

- trip data loaded;
- emergency contacts loaded;
- production worker control and runtime/release/bundle identity match;
- every required resource passes byte-size and SHA-256 verification;
- installed/standalone detection when observed.

Offline Check requires the current page to have a controlling production worker, then verifies that worker's complete active bundle locally: exact cache/bundle identity, completion marker, resource count, every listed asset, canonical/release identity, three objectives, four routes, five decision gates, six public numbers, nine milestones, rendered core sections, and both PDFs. An active registration without a controlling worker fails the check. Success appears once as `Offline resources verified` within the concise setup state; failure remains `OFFLINE RESOURCES INCOMPLETE`. The panel always states that software-resource verification does not evaluate weather, access, terrain, or route conditions.

A Return to Mountain Guide link is rendered only when the current document's referrer parses to the exact `https://mountainguide.vondadowns.com` origin. Ordinary friend links, lookalike hosts, installed launches, missing referrers, and unparseable referrers do not expose it. The condition uses no query parameter, fragment, local state, or private value.

`scripts/build-offline.mjs` generates the explicit `offline-bundle.json` and production `service-worker.js` from actual bytes. Installation is marker-last and hash-verified; a failed candidate is deleted without replacing the last complete release. Field-critical fetches resolve only from one verified active cache, preventing network/cache or old/new mixing. See `docs/offline-architecture.md` for lifecycle, retention, repair, storage, and test details.

The physical Airplane Mode checklist remains pending until a user displays the twelve instructions—including offline Help—and records completion on that phone. Automation never sets this mark.

## Navigation and field hierarchy

Persistent navigation provides Timeline, Route, Emergency, Help, and Red. Emergency is a primary control from every normal screen. The sticky header and safe-area-aware bottom navigation use at least 44×44 CSS-pixel critical targets, and section scroll offsets prevent the header from hiding emergency content.

Timeline renders all three canonical objectives and six planning values. Planned Start and Planning Target remain visible when an actual start is locally recorded. Actual start and elapsed basis never rewrite canonical times.

Decision Gates renders all five canonical prompts as expandable neutral reassessment content. No score, pass/fail state, aggregate verdict, or color authorization exists.

Route renders the four canonical profiles as comparison cards with round-trip distance, cumulative gain, class, exposure, route notes, and return/access considerations. It includes no fabricated map or continuous elevation profile. Lily Lake coordinates/elevation remain absent and visibly pending final verification.

Emergency begins with CALL 911 FIRST, reporting prompts, dispatch/jurisdiction language, and all six canonical public numbers as direct, agency-labeled `tel:` links. Tapping a link creates no local completion state or affirmative call claim.

## Local-state schema version 4

The separate local store contains only:

- selected objective;
- actual-start timestamp and elapsed-time basis by objective;
- locally marked communication milestones with optional local timestamps;
- Red Display state;
- brief local status note;
- optional private contact name, phone, alternate, and note;
- setup/open/check progress, bundle-scoped offline verification, physical Airplane Mode user attestation, and the local onboarding version/status record.

The state loader is allowlist-based, length-bounded, versioned, and fail-closed on unknown/corrupt versions. Migration from schema versions 1 through 3 preserves operational/private values, adds only an empty onboarding record, leaves the time unavailable for older boolean-only milestone marks, and does not promote the old structural check into an offline verification. Defaults are empty, and Clear Private Data removes all optional private contact fields after confirmation. There is no cloud synchronization, export, logging, telemetry, or URL encoding. Service workers neither read nor cache the local store.

Trip-level communication milestones record an America/Denver local timestamp, support edit and undo, and remain separate from message preparation. Each canonical milestone can generate an approved text-only message from the milestone type, selected canonical objective where applicable, and current operational time. Copy or native Share never marks a milestone and never claims delivery; after native Share returns, the interface says to confirm delivery in the sending app. Tests continue to reject sent, delivered, received, completed, or safety-verdict claims.

## Sharing and URL privacy

Public Companion Share uses `navigator.share` when available and otherwise copies the single configured public URL. If neither native sharing nor clipboard/legacy copy is available, a manual-copy prompt exposes that same public URL and nothing else. The link payload contains only title, public explanatory text, and that URL. It never includes query parameters, local state, actual start, milestones, status notes, contact fields, or storage content.

Prepared milestone Copy/Share uses a separate text-only payload. Its allowlisted inputs are the canonical milestone type, the currently selected canonical objective name where applicable, and the current America/Denver time. It excludes actual-start history, prior milestone history, private fields, status notes, emergency contacts, coordinates, medical data, URLs, fragments, and query strings. Native Share completion means only that the platform share interaction returned; the Companion instructs the user to confirm delivery in the sending app.

No external QR API is used. The stable public URL is directly QR-encodable without state; QR presentation belongs to the separate Mountain Guide Crew tab.

## Display and accessibility

Red is a persistent presentation control with `aria-pressed`; it changes no content or safety state. Its active styling uses dedicated display-mode tokens rather than Emergency semantic tokens. A synchronous local bootstrap applies Red before the main module renders to reduce daylight flashing on reload. Daylight and Red both use explicit text, borders, and icons rather than color-only meaning.

The shell uses semantic header/main/nav/footer landmarks, native controls, visible focus, labeled fields, native details disclosure, heading hierarchy, reduced-motion handling, safe-area insets, and responsive portrait/landscape layouts. The onboarding dialog traps focus, supports Escape, makes the background inert, and restores focus. Playwright runs Chromium and WebKit at desktop and 390×844 mobile, with an additional 375×667 Help/onboarding fit check. Axe checks onboarding, first-open, Timeline, Route, Emergency, Help/feedback, installed setup, and Red states against WCAG 2.1 AA rules. Physical VoiceOver, increased-text, sunlight, headlamp, glove, wet-finger, and actual iPhone testing remain release gates.

## Physical artifacts

The landing experience presents the Interactive Companion, 3-Page Field Guide, and Emergency Pocket Card without duplicating PDF content. PDF links are local package-relative URLs. Both PDFs are members of the atomic, hash-verified offline bundle and are exercised through real online and service-worker-controlled offline browser navigation; the worker runtime harness separately verifies each cached response begins with `%PDF`. Public candidate access does not make either PDF a field release.

## Remaining release gates

Technical Phase 5 requirements are implemented and Phase 6 provides the candidate deployment path. Field release still requires the physical primary/backup/friend iPhone plan, actual force-quit and reboot evidence, physical print/readability checks, owner review, remaining scoped Lily Lake disposition for any artifact that requires the unresolved field, and a separate final tag decision.
