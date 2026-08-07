# Crew Distribution Contract

## Purpose

The Crew tab in the separate Mountain Guide distributes, rather than reimplements, the Companion. Phase 6 publishes a technical candidate so primary, backup, and friend phones can complete the still-required physical checks. Candidate deployment does not imply physical approval or field-release status.

## Single public URL configuration

`config/companion.build.json` contains the only configured public base URL: `https://companion.vondadowns.com/`. Protected-main GitHub Pages automation publishes the candidate. Development uses localhost without changing the public sharing identity.

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

## Candidate release metadata

`release.json` publishes the integration keys:

- `companion_version`;
- `data_version`;
- `manifest_sha256`;
- `source_release`;
- `source_commit`;
- `generated_at`;
- `verified_at`;
- `release_status`;
- `bundle_id`;
- `offline_bundle_version`;
- `offline_bundle_content_sha256`;
- `offline_bundle_entry_count`;
- `offline_bundle_url`;
- `pwa_url`;
- `field_guide_url`;
- `pocket_card_url`.

Phase 6 uses `release_status = candidate`. The Crew tab may render that as Companion candidate or Physical testing in progress. It must tolerate unavailable online metadata, must not translate candidate into field-ready wording, and must not use metadata as field-safety information. Bundle metadata identifies a complete cache unit; it is not a mountain-safety state.

## Share and privacy contract

The Companion shares exactly the configured `pwa_url` through `navigator.share` or clipboard fallback. Automated tests prove that only title, explanatory text, and public URL enter the share payload. Device-local data is never appended or serialized.

PDF links use the same public origin. Their public availability enables physical testing but does not make either artifact a field release.

## Offline truth boundary

The Companion may display `OFFLINE RESOURCES VERIFIED` only after its controlling worker verifies the exact local bundle. A future Crew tab must not infer that state from remote `release.json`, and must not convert it to ready, safe, all clear, or equivalent wording. The physical Airplane Mode mark is a local user attestation on one phone and is not contained in public release metadata.

## Ownership boundary

The Mountain Guide remains the master planning application. The Companion remains the current-trip crew instrument. Canonical public facts continue to originate in `data/trip-manifest.json`, and all three Companion artifacts retain the same data/source/hash identity. Neither application may silently copy device-local private state into the other.
