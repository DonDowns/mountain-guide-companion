# Companion PWA Design

## Status and product boundary

The Phase 4 Companion is a draft, crew-facing static PWA shell. It answers four current-trip questions: where the crew is in the plan, what matters now, what should cause reassessment, and what to do in an emergency. It does not reproduce Road to 50, Mountain Intelligence, planning databases, live weather analysis, archives, a full gear system, or non-current objectives.

Nothing is deployed or tagged in Phase 4. The shell does not yet claim zero-connectivity readiness. Phase 5 owns production caching, atomic updates, cold launch, mixed-version prevention, recovery, and physical Airplane Mode evidence.

## Runtime architecture

The runtime is plain HTML, modern CSS, ES modules, local SVG icons, a web app manifest, and packaged/generated public data. It has no remote font, CDN, analytics, authentication, API, map, live-weather, or remote-script dependency.

`scripts/build-pwa.mjs` validates `data/trip-manifest.json`, computes its exact SHA-256, verifies both print artifact records, and deterministically generates:

- `js/companion-data.js` — immutable selected current-trip facts and runtime identity;
- `release.json` — the draft metadata contract intended for a future Mountain Guide Crew tab.

Hand-maintained HTML, CSS, and JavaScript contain UI structure and safety-boundary copy, not trip dates, objective names, planning times, route values, phone numbers, data version, source release/commit, or manifest fingerprint. Automated checks reject those canonical literals outside the generated module.

## Friend first-open flow

The root URL is a friend-facing landing experience suitable for a QR scan, text, AirDrop, or copied link. Above the mobile fold it presents the product name, current trip, Open Companion, Install for Offline Use, and a concise explanation. No repository or developer terminology is exposed.

In an ordinary browser the setup panel shows INSTALL FOR OFFLINE USE. iPhone/iOS wording directs the user to Safari, Share, Add to Home Screen, one online installed launch, Offline Check, and a later physical Airplane Mode test. A programmatic Install Companion action appears only when the browser supplies `beforeinstallprompt`.

Standalone detection uses the display-mode media query and iOS `navigator.standalone`. The standalone panel is titled INSTALLED COMPANION and exposes Companion version, Trip Data version, source release, verified date, and manifest fingerprint through the persistent provenance and setup checklist.

## Setup and Offline Check boundary

The setup checklist can truthfully complete only packaged-resource checks in Phase 4:

- trip data loaded;
- emergency contacts loaded;
- runtime/release manifest identity matches;
- installed/standalone detection when observed.

Offline resources and Airplane Mode remain incomplete. Offline Check verifies only the current loaded shell, canonical identity, three objectives, four routes, five decision gates, six public numbers, nine milestones, and rendered core sections. Its result is Local Companion resources present followed by an explicit statement that full offline cold-launch verification is not completed.

`service-worker.dev.js` is a development-only, non-caching installability shell. It has no fetch handler, Cache API use, offline response, cache version, or update claim.

## Navigation and field hierarchy

Persistent navigation provides Timeline, Route, Emergency, and Red. Emergency is a primary control from every normal screen. The sticky header and safe-area-aware bottom navigation use at least 44×44 CSS-pixel critical targets, and section scroll offsets prevent the header from hiding emergency content.

Timeline renders all three canonical objectives and six planning values. Planned Start and Planning Target remain visible when an actual start is locally recorded. Actual start and elapsed basis never rewrite canonical times.

Decision Gates renders all five canonical prompts as expandable neutral reassessment content. No score, pass/fail state, aggregate verdict, or color authorization exists.

Route renders the four canonical profiles as comparison cards with round-trip distance, cumulative gain, class, exposure, route notes, and return/access considerations. It includes no fabricated map or continuous elevation profile. Lily Lake coordinates/elevation remain absent and visibly pending final verification.

Emergency begins with CALL 911 FIRST, reporting prompts, dispatch/jurisdiction language, and all six canonical public numbers as `tel:` links. Opening a phone intent is explicitly not proof that a call occurred.

## Local-state schema version 1

The separate local store contains only:

- selected objective;
- actual-start timestamp and elapsed-time basis by objective;
- locally marked communication milestones;
- Red Display state;
- brief local status note;
- optional private contact name, phone, alternate, and note;
- setup/open/check progress.

The state loader is allowlist-based, length-bounded, versioned, and fail-closed on unknown/corrupt versions. A migration hook is present for future schema versions. Defaults are empty, and Clear Private Data removes all optional private contact fields after confirmation. There is no cloud synchronization, export, logging, telemetry, URL encoding, or share inclusion.

Milestone checks mean Marked locally only. The canonical delivery disclaimer remains visible.

## Sharing and URL privacy

Share uses `navigator.share` when available and otherwise copies the single configured public URL. The payload contains only title, public explanatory text, and that URL. It never includes query parameters, local state, actual start, milestones, status notes, contact fields, or storage content.

No external QR API is used. The stable public URL is directly QR-encodable without state; QR presentation remains the responsibility of the future Mountain Guide Crew tab.

## Display and accessibility

Red is a persistent presentation control with `aria-pressed`; it changes no content or safety state. A synchronous local bootstrap applies Red before the main module renders to reduce daylight flashing on reload. Daylight and Red both use explicit text, borders, and icons rather than color-only meaning.

The shell uses semantic header/main/nav/footer landmarks, native controls, visible focus, labeled fields, native details disclosure, heading hierarchy, reduced-motion handling, safe-area insets, and responsive portrait/landscape layouts. Playwright runs Chromium and WebKit at desktop and 390×844 mobile. Axe checks the first-open, Timeline, Route, Emergency, and Red states against WCAG 2.1 AA rules. Physical VoiceOver, increased-text, sunlight, headlamp, glove, wet-finger, and actual iPhone testing remain release gates.

## Physical artifacts

The landing experience presents the Interactive Companion, 3-Page Field Guide, and Emergency Pocket Card without duplicating PDF content. Draft PDF links are local package-relative URLs. Phase 5 must include both PDFs in the atomic cache/version contract before any offline claim.

## Phase 5 requirements

Phase 5 must replace the development service worker with a versioned production implementation; precache the complete compatible shell/data/PDF set; prevent mixed versions; preserve the last complete release; verify cache identity; handle interrupted updates and recovery; prove cold launch after force quit/reboot; and complete primary/backup iPhone Airplane Mode testing. Deployment and custom-domain activation remain separately gated.
