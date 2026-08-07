# Emergency & Communication Pocket Card Design

## Status and scope

`generated/pocket-card.pdf` is the Phase 3 draft Emergency & Communication Pocket Card. It contains exactly two 3.5 × 5-inch portrait pages: FRONT followed by BACK. It is not tagged, deployed, physically approved, or field-ready. Phase 4 PWA work is outside this phase.

The Phase 2 Field Guide remains a separate, unchanged physical artifact.

## Front architecture

The front prioritizes emergency action in this order:

1. CALL 911 FIRST at 20 points in the strongest bordered hierarchy.
2. Exact-location, mountain/route, elevation, coordinate-if-available, injury, party-size, and condition prompts.
3. Dispatch jurisdiction language stating that the caller need not choose a county.
4. Three compact agency columns with all six canonical public numbers at 10.5 points.
5. Cautious, manifest-derived geographic context.
6. Blank current-location fields for mountain/route, elevation, coordinates, and time.

The front does not claim rescue activation, delivery, or agency exclusivity.

## Back architecture

The back contains all nine canonical communication milestones in manifest order, each with a checkbox and time/initials area. Its direct instruction is: Confirm delivery in the sending app.

The remaining regions provide blank handwritten name, phone, alternate, optional medical/personal notes, saved-weather refresh, and actual sky/wind fields. They include the staleness warning, Weather is evidence, not permission, and the concise decision-support statement.

No private example, recipient, completed field, or private fixture is stored.

## Canonical-data derivation

`scripts/pocket-card-model.mjs` validates `data/trip-manifest.json`, rejects conflicted records, requires exactly three public agencies with two numbers each, requires exactly nine milestones, and preserves the Lily Lake pending/null contract. The HTML and ReportLab PDF renderers consume the same model.

`pocket-card/pocket-card.template.html` and `pocket-card/pocket-card.css` contain structure and static labels only. Automated checks reject canonical phone, milestone, version, release, commit, or fingerprint literals in the template/CSS.

## Physical geometry and typography

- Page size: 252 × 360 PDF points, exactly 3.5 × 5 inches.
- Orientation: portrait.
- Page order: FRONT, then BACK.
- Emergency headline: 20 points.
- Section headings: 10.5–11.5 points.
- Phone numbers: 10.5 points.
- Essential body/field text minimum: 9.5 points.
- Provenance: two compact 5.3-point lines, exempt from the essential-content floor.

The PDF verifier rejects a third page, wrong dimensions, text outside page bounds, essential text below 9.5 points, missing content, non-allowlisted numbers, broken glyphs, or mismatched metadata/checksum.

## Provenance and generated artifacts

Both sides visibly show Don Downs Mountain Guide Companion, Trip Data v1.0.0, Mountain Guide v15.3.10, generated date, verified date, short manifest fingerprint, DRAFT, and side marker.

PDF metadata and `generated/pocket-card-artifact.json` record the full manifest SHA-256, source commit/release, generation timestamp, page geometry/order, draft status, and Pocket Card PDF SHA-256 without circular hashing.

The generated HTML, PDF, and artifact record are source-controlled. Color, grayscale, and low-light simulation renders stay under ignored `tmp/pdfs/` and are not release artifacts.

## Lily Lake treatment

The Pocket Card prints no Lily Lake coordinate or elevation and provides no Lily-specific unknown placeholder. Blank current-location fields are generic and completed by hand. Lily Lake may appear only in canonical county-context language; it is never presented as an emergency coordinate. The scoped final-release verification hold remains unchanged.

## Grayscale and headlamp strategy

No meaning depends on color. Text, borders, alternating table fill, checkboxes, explicit side labels, and strong typographic hierarchy survive grayscale. The automated low-light simulation darkens grayscale renders and checks usable luminance variance, but it is diagnostic only; an actual headlamp test remains mandatory.

## Optional print sheet

No Letter-size print sheet is generated in Phase 3. Correct duplex imposition orientation has not been physically proven, and the optional convenience sheet must not introduce an ambiguous front/back relationship. The authoritative artifact remains the exact-size two-page Pocket Card PDF.

## Remaining release requirements

Before field release, print at 100% scale and measure both sides. Verify duplex orientation or separate-side lamination, trim/cut margins, glare, daylight and headlamp readability, glove/wet-hand handling, handwriting space, pocket extraction/orientation, and uncoached second-person use. Owner approval, final checksum/release evidence, rollback evidence, and an ordinary annotated tag also remain required.
