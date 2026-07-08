# Gate 50 Manual Visual Review

## Purpose

Gate 50 is the product-quality acceptance gate for the live bounded 3D diorama. Automated tests can
prove structure, data contracts, and deterministic fixture behavior, but they cannot approve the
final visual taste. A human reviewer must accept the live bounded 3D output before P4 DEM tiles,
P5 landmark restoration, or commercial 3D provider routing can start.

## Review Command

Run the full automated evidence package before manual review:

```powershell
npm.cmd run gate50:review
```

For command wiring checks only:

```powershell
npm.cmd run gate50:review -- --dry-run
```

To persist a machine-readable evidence summary:

```powershell
npm.cmd run gate50:review -- --evidence-json=output/gate50/evidence.json
npm.cmd run check:gate50-evidence -- output/gate50/evidence.json
npm.cmd run gate50:packet -- output/gate50/evidence.json output/gate50/manual-review-packet.md
```

The latest full local automated packet was collected with:

```powershell
npm.cmd run gate50:review -- --evidence-json=output/gate50/latest-review.json
npm.cmd run check:gate50-evidence -- output/gate50/latest-review.json
npm.cmd run gate50:packet -- output/gate50/latest-review.json output/gate50/latest-manual-review.md
```

To capture deterministic local screenshots and QA JSON for the human visual decision:

```powershell
npm.cmd run gate50:live-review
```

This writes `manifest.md`, `manifest.json`, screenshots, and per-view QA JSON to
`output/gate50/live-review/`.

The live review packet must now contain the minimum productization scene set below. This set comes
from the July 2026 visual-quality research follow-up and is intentionally focused on presentation
quality, not broader engine expansion:

| Scene            | Required views        | Product question                                                               |
| ---------------- | --------------------- | ------------------------------------------------------------------------------ |
| `hiking-terrain` | overview, route-focus | Does the terrain avoid the white-board slab look while keeping the route read? |
| `old-street`     | overview, inspect     | Do storefront massing, route, roads, and POI context read together?            |
| `landmark-pilot` | route-focus, inspect  | Does landmark context support the route without implying real restoration?     |
| `river-bridge`   | overview, inspect     | Are water carving, bridge decks, and route crossing visible in the review?     |

Optional expansion after the minimum packet is stable: add `wide-river-bridges` overview to prove
polygon water and multiple bridge decks in the same manual packet. Do not expand beyond that before
the current Gate 50 visual decision is made.

Useful scoped reruns:

```powershell
npm.cmd run gate50:review -- --skip-visual
npm.cmd run gate50:review -- --skip-smoke
```

When collecting repeatability evidence before a visual acceptance meeting:

```powershell
npm.cmd run gate50:review -- --include-stability --stability-runs=5
```

For scoped diagnosis, add a stability preset:

```powershell
npm.cmd run gate50:review -- --include-stability --stability-runs=5 --stability-preset=precision
```

The full command runs:

- `npm.cmd run check`
- `npm.cmd test`
- `npm.cmd run check:encoding`
- `npm.cmd run check:ledger`
- desktop smoke gates through `scripts/run-e2e-smoke.mjs`
- full Chromium visual baseline through `tests/e2e/visual-baseline.spec.js`

The optional stability step is explicit because the full five-run visual baseline is intentionally
expensive. It strengthens evidence but still does not replace the human Gate 50 visual decision.

Evidence JSON is a local artifact. Keep it under ignored `output/` unless a release-review record is
explicitly requested. Validate the JSON before using it in review notes; the validator checks the
root status, timestamps, options, required Gate 50 steps, step statuses, exit codes, and duration
totals.

The review packet is also a local artifact. It contains the validated automated evidence summary and
an unchecked manual decision/checklist section. Do not use it to close Gate 50 until the live visual
result is reviewed by a human.

## Manual Review Steps

1. Start the app with `npm.cmd start` if it is not already running.
2. Open `http://localhost:8080/`.
3. In 2D mode, click the bottom-right `3D` control.
4. Confirm the red pin selection mode appears before 3D generation.
5. Click a representative point on the 2D map.
6. Wait until the 3D scene reaches steady state.
7. Inspect the default overview without touching the camera.
8. Drag, wheel, and use `WASD` to inspect the selected square.
9. Return to overview-like distance and confirm the scene remains readable.
10. As a negative-path check, select an empty map area away from the route and confirm the generated
    3D work area anchors to nearby location context instead of opening as a blank slab.

## Acceptance Checklist

Accept gate 50 only if all items below are true in the live view:

- The 3D scene is a bounded square work area, not an unbounded route-wide board.
- The selected work area is visually raised and clearly separated from the dimmed outside context.
- The ground palette stays bone-white and does not reintroduce the previous gray base-map look.
- The route guidance is a narrow industrial-yellow line with no gray route outline or thick gray
  route bed.
- The yellow route remains readable during overview, drag, wheel, and `WASD` movement.
- The first camera angle and idle auto-orbit feel continuous; there is no initial snap to a
  different view.
- The first camera angle is close enough to read the route and immediate context; it must not be a
  distant blank slab with only a faint route line.
- Empty off-route selections degrade by anchoring to nearby location context, not by generating an
  empty raised square.
- Roads, water, bridges, buildings, and annotations do not create obvious z-fighting or blank
  terrain gaps in the selected area.
- Water and bridge value is visible in the Gate 50 packet, not only in lower-level visual baseline
  tests; `river-bridge` must show blue-grey water, deck crossing, and yellow route together.
- Building massing appears as neutral planning context; fallback buildings are not presented as
  real exterior reconstructions.
- Close-view building dissolve does not visibly pop or flicker.
- The result is visually acceptable for the current low-poly planning-diorama style.

## Defect Taxonomy

Use one primary class when rejecting or deferring Gate 50:

| Class       | Reject when                                                                 |
| ----------- | --------------------------------------------------------------------------- |
| terrain     | selected area reads as a flat white board, relief is dirty, or slopes lie   |
| camera      | first view is too distant, snaps, hides route context, or lacks focus       |
| route       | yellow route is faint, occluded, thick, gray-shadowed, or hard to follow    |
| urban       | inspect view lacks street/building/route/POI co-visibility                  |
| water       | river/canal is terrain-colored, missing, or visually detached from bridges  |
| bridge      | decks are discontinuous, floating, z-fighting, or unsupported by provenance |
| focus-edge  | selected work area and outside context do not separate cleanly              |
| provenance  | QA reports missing required source/licence/attribution/updatedAt fields     |
| performance | interaction or capture instability prevents a confident visual decision     |

## Rejection Handling

If gate 50 is rejected, record the next source of truth before continuing implementation:

- attach or save the latest screenshot;
- state the visible defect in one sentence;
- classify it as route, terrain, water, road, bridge, building, camera, lighting, palette, or UI;
- update `docs/quality-gate-status.md` with the rejected reason;
- add the smallest next fix to `TODO.md`.

Do not start P4/P5/P6 work from an unaccepted live visual state.

## Promotion Rule

After full automated evidence passes and the user accepts the live visual result:

1. Update `docs/quality-gate-status.md` gate 50 from partial to complete.
2. Update `TODO.md` from "manual visual acceptance pending" to accepted.
3. Commit and push the promotion as its own small stage.
