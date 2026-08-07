# Future Crew Distribution Contract

## Purpose

The future Crew tab in the separate Mountain Guide will distribute, not reimplement, the Companion. The Mountain Guide repository remains untouched in Phase 4. Integration begins only after the Companion has a reviewed public URL and Phase 5 has proven offline behavior.

## Single public URL configuration

`config/companion.build.json` contains the only configured public base URL. The draft value is the intended future address, `https://companion.vondadowns.com/`, but no domain, CNAME, Pages project, or deployment is created here. Development uses localhost without changing the public sharing identity.

The public URL is stable and contains no query string, fragment state, local storage, recipient, actual start, milestone, note, medical field, device identifier, or token. It may be encoded directly into a locally generated QR code. No external QR service is permitted.

## Friend flow

A friend arriving from QR, link, text, or AirDrop lands at the root Companion URL and sees:

1. Mountain Guide Companion and the current public trip identity.
2. Open Companion.
3. Install for Offline Use.
4. A short explanation of the field-instrument boundary.
5. The three coordinated Companion artifacts.

No GitHub account, authentication, repository knowledge, or Mountain Guide access is required.

## Future Mountain Guide actions

The Crew tab may expose:

- Open Companion;
- Set Up a Friend;
- Show QR Code;
- Share Companion Link;
- Offline Check guidance;
- Three-page Field Guide;
- Emergency Pocket Card.

Those actions consume the public URL and `release.json`; they must not import Companion local state or construct a second trip-fact source.

## Draft release metadata

`release.json` publishes the integration keys:

- `companion_version`;
- `data_version`;
- `manifest_sha256`;
- `source_release`;
- `source_commit`;
- `generated_at`;
- `verified_at`;
- `release_status`;
- `pwa_url`;
- `field_guide_url`;
- `pocket_card_url`.

Phase 4 sets `release_status` to `draft`. A future Crew tab must reject missing, incompatible, non-approved, or mixed metadata and must not translate draft into field-ready wording.

## Share and privacy contract

The Companion shares exactly the configured `pwa_url` through `navigator.share` or clipboard fallback. Automated tests prove that only title, explanatory text, and public URL enter the share payload. Device-local data is never appended or serialized.

PDF links point to the same public-base architecture. They remain draft links until the release package, caching policy, and deployment are approved.

## Offline truth boundary

Phase 4 can state only that current local resources are present. The future Crew tab must not display offline-verified, ready, or equivalent completion based on Phase 4 metadata. Phase 5 must add cache-version evidence, cold-launch checks, mixed-version detection, recovery, and physical Airplane Mode results before the Mountain Guide offers an offline-complete workflow.

## Ownership boundary

The Mountain Guide remains the master planning application. The Companion remains the current-trip crew instrument. Canonical public facts continue to originate in `data/trip-manifest.json`, and all three Companion artifacts retain the same data/source/hash identity. Neither application may silently copy device-local private state into the other.
