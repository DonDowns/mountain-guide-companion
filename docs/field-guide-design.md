# Printable Field Guide Design

## Status and scope

`generated/field-guide.pdf` is the first Phase 2 Printable Field Guide draft for Lake Como / Blanca / Ellingwood / Mount Lindsey, Aug 19-25, 2026. It is exactly three US Letter portrait pages. It is not tagged, deployed, approved for field release, or a substitute for current conditions and judgment.

Phase 2 does not create the Pocket Card or Companion PWA.

## Page architecture

1. **Operational Timeline + Decision Gates** presents the approach/camp objective, primary Blanca + Ellingwood objective, separate Mount Lindsey objective, canonical planning times, decision prompts, a weather observation field, and the rule that planning targets are not safety cutoffs.
2. **Route Profile Summary + Return Considerations** presents four canonical route cards, schematic cumulative-gain comparison bars, canonical reference points, the Lily Lake withholding statement, Mount Lindsey access requirements, and non-invented return guidance.
3. **Emergency + Communication** gives CALL 911 FIRST the strongest hierarchy, then location-reporting prompts, all six manifest-injected public numbers with geographic context, the nine canonical communication milestones, blank handwritten personal fields, staleness fields, and the final decision-support statement.

## Source-of-truth flow

`data/trip-manifest.json` is the sole authority for printed public trip facts. `scripts/field-guide-model.mjs` validates the manifest and converts selected canonical records into one presentation model. Both the semantic HTML generator and PDF renderer consume that model.

`print/field-guide.template.html` and `print/field-guide.css` contain structure, labels, and static safety language only. Build checks reject canonical phone, route-distance, elevation, planning-time, provenance, or coordinate literals in those files. Missing or conflicted required data fails generation rather than being invented.

## Generated-artifact policy

The following outputs are source-controlled because they are reviewable release artifacts and deterministic parity evidence:

- `generated/field-guide.html`
- `generated/field-guide.pdf`
- `generated/field-guide-artifact.json`

`print/field-guide.build.json` supplies the reviewed build timestamp and artifact status. The artifact record hashes the PDF and exact manifest bytes without attempting to hash itself. CI regenerates the outputs and rejects any diff. Rendered color/grayscale PNGs live under ignored `tmp/pdfs/` and are not committed.

## Typography and print geometry

- US Letter portrait: 612 x 792 PDF points.
- Printable text safety boundary: at least 18 points from every page edge; the design uses a 38-point primary margin.
- Emergency headline: 24 points.
- Main page headings: 18 points.
- Section hierarchy: generally 11.2-16 points.
- Operational/body text: generally 9-12 points; verified minimum non-footer text is 9 points.
- Provenance footer: compact 7.2-7.4-point identity text, outside operational content.

The renderer enforces designed line counts and explicit overflow checks in dense cards. PDF verification rejects a page-count change, non-Letter geometry, text outside printable safety bounds, essential text below 9 points, missing content, broken replacement glyphs, blank/grossly low-contrast renders, or unexpected public phone values.

## Provenance

Every page visibly carries:

- Don Downs Mountain Guide Companion;
- Trip Data v1.0.0;
- Based on Mountain Guide v15.3.10;
- generated date;
- canonical last-verified date;
- shortened manifest fingerprint;
- DRAFT status and page number.

The PDF metadata and `generated/field-guide-artifact.json` also carry the complete manifest SHA-256, source commit, source release, data version, exact build timestamp, page geometry, artifact status, and PDF SHA-256.

## Lily Lake withholding

The generator requires Lily Lake Trailhead latitude, longitude, and elevation to remain null with `pending_external_verification`. The draft prints only that the exact canonical coordinate/elevation is pending final verification. It rejects the known secondary coordinate variants and never uses Lily Lake for an emergency-location claim.

This scoped hold does not block Phase 2 or Phase 3 drafting. It does block final release of any artifact that requires an authoritative Lily Lake coordinate/elevation.

## Grayscale behavior

Color reinforces hierarchy but never carries meaning alone. Objective roles, decision prompts, route type, access restrictions, and emergency actions remain explicit text inside bordered regions. CALL 911 FIRST retains a high-contrast dark banner in grayscale. CI renders all three pages in both color and grayscale and checks dimensions, nonblank content, and contrast; visual review remains required for every material layout change.

## Remaining release requirements

Before field release, the owner must approve the exact commit and hashes and complete actual-size physical tests at 100% scale: measurement, daylight and headlamp reading, glove and wet-hand handling, sleeve/waterproof and glare behavior, handwriting usability, and uncoached second-person comprehension. The Lily Lake hold must remain visibly withheld or be authoritatively resolved if a released artifact requires it. A release manifest, rollback evidence, final cross-artifact parity, owner approval, and an ordinary annotated release tag are also still required.
