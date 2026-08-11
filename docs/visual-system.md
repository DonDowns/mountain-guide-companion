# Companion Mountain-Earth Visual System

## Scope

Phase 6A gives Companion one restrained visual language across the PWA, three-page Field Guide, and two-sided Pocket Card. Phase 6A.1 carries that approved system forward while simplifying field-facing copy. The dedicated Red Display pressed-state token keeps the presentation control separate from Emergency semantics. Candidates `0.6.0-candidate.5`, `0.6.0-candidate.6`, reconstructed `0.6.0-candidate.8`, and the bounded `0.6.0-candidate.9` repair reuse the same teal, gold, stone, Emergency, and Red Display meanings for Home, setup, Help, onboarding, Back, Top, objective, milestone, Copy, and Share controls. Canonical facts, planning values, emergency instructions, decision prompts, privacy boundaries, and the Lily Lake release hold are unchanged.

The existing teal mountain mark remains the identity seed. Its recognizable silhouette and application/maskable icon geometry remain unchanged because the audit found no usability, legibility, or platform-mask defect that justified redesign.

## Semantic color tokens

The runtime uses semantic custom properties in `css/companion.css`; print CSS and deterministic PDF renderers use equivalent print tokens/constants.

| Role | Daylight | Purpose |
| --- | --- | --- |
| Brand primary | `#163d46` deep teal | Header, major headings, selected structure, routes |
| Brand red | `#b93d2e` restrained red | Identity accent only; not an operational signal |
| Accent gold | `#c9942e` runtime / `#a96f12` print | Candidate state, active markers, decision-gate accents |
| Stone | `#d7c8ac` runtime / `#e8dfcf` print | Quiet grouping and printable panels |
| Earth | `#66503c` | Eyebrows, secondary labels, withheld-value treatment |
| Canvas | `#f3f0e8` | Warm application background |
| Surface | `#fffdf8` | Cards and primary reading surfaces |
| Text | `#132026` runtime / `#18222b` print | Primary copy |
| Muted text | `#45575a` runtime / `#45545a` print | Secondary copy with AA contrast |
| Emergency | `#8b281f` | CALL 911 and literal emergency emphasis only |

Candidate status is gold/ochre with explicit `CANDIDATE` text. Red is never the sole cue for an operational state, route judgment, permission, or go/no-go decision. Decision Gates remain neutral prompts; their gold edge is hierarchy, not a verdict. Emergency red is reserved for literal emergency hierarchy and the user-selected Red Display control.

## Component hierarchy

- The deep-teal header anchors the mountain mark and separates persistent setup actions from content.
- Gold top/side rules identify current navigation, time cards, selected objectives, decision prompts, and artifact groupings without implying safety.
- Teal top rules group route cards and major surfaces; warm stone separates supporting content.
- Emergency retains explicit wording, border, placement, and accessible contrast in addition to color.
- Setup and Offline Check states retain their exact factual labels. Visual completion treatment does not claim field readiness.
- The Field Guide and Pocket Card repeat teal structure, warm stone panels, gold wayfinding, and emergency red while preserving page count, dimensions, typography, and grayscale legibility.

## Accessibility and display modes

The automated visual-system contract checks WCAG 2.1 AA text pairs, 3:1 candidate/focus UI boundaries, semantic token use, candidate/emergency separation, stale palette removal, icon identity, and manifest-theme alignment. Playwright/axe covers first-open, Timeline, Route, Emergency, setup, daylight, and Red Display states at desktop and 390 × 844.

Visible focus uses a high-contrast teal outline plus a gold outer ring in daylight. Red Display overrides the semantic palette rather than changing content or operational meaning; pale red text and borders remain distinguishable on near-black surfaces, while dark text is used on pale-red action fills. Grayscale review requires headings, borders, layout, and labels—not hue alone—to preserve hierarchy.

## Print and icon rules

The Field Guide remains exactly three US Letter portrait pages. The Pocket Card remains exactly two 3.5 × 5 inch portrait sides. Essential type minimums, printable bounds, canonical provenance, and Lily Lake withholding are unchanged. Color and grayscale renders are release evidence.

The current `companion-icon.svg` and `companion-maskable.svg` remain unchanged. Reconsider them only if a documented mask, recognition, small-size, or contrast defect is reproduced; aesthetic novelty alone is not sufficient.
