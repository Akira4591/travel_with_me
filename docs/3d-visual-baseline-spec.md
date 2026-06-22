# 3D Visual Baseline Specification

## Purpose

The 3D map module must be validated as a geospatial scene pipeline, not only as a nonblank canvas. This specification defines the visual baseline system recommended by the latest map-module repair research.

## Baseline Strategy

Use three layers together:

1. Structured QA metrics from `window.__threeDebug__.qa`.
2. Clipped DOM QA fields from `#map-3d.dataset.qa*`.
3. Playwright screenshots for a small number of stable views and regions of interest.

Do not rely on screenshots alone. A screenshot can show that something changed, but structured metrics must explain whether terrain, water, bridge, route, and building geometry are still correct.

## Scenario Catalog

Maintain five deterministic scene fixtures:

| Scene            | Purpose                                      | Required checks                                                     |
| ---------------- | -------------------------------------------- | ------------------------------------------------------------------- |
| `micro-street`   | Dense street-level city planning             | route readability, building LOD, POI marker readability             |
| `citywalk`       | Flat urban route with roads and context mass | 2D/3D route identity, muted road ribbons, building base consistency |
| `river-bridge`   | Water and bridge correctness                 | water carve, no terrain blank gap, bridge deck continuity           |
| `hiking-terrain` | Mountain or hiking relief                    | terrain variance, slope honesty, route height cue                   |
| `landmark-pilot` | Allowlisted real landmark workflow           | provenance, attribution, fallback when model is unavailable         |

Fixtures must be local and deterministic. Live provider calls are not allowed in baseline tests.

The first fixture catalog is now stored under:

```text
tests/fixtures/scenes/river-bridge/
tests/fixtures/scenes/micro-street/
tests/fixtures/scenes/hiking-terrain/
```

Each fixture uses the same file contract:

```text
trip.json
route.json
geo-assets.json
dem-grid.json
camera-presets.json
expectations.json
```

## Phase Capture Points

Each scene should eventually support these capture points:

| Capture point       | Required signal                                      |
| ------------------- | ---------------------------------------------------- |
| `slab-rise`         | foundation visible and nonblank within budget        |
| `water-road-bridge` | water, road, and bridge layers resolved correctly    |
| `route-highlight`   | industrial safety-yellow route remains dominant      |
| `building-massing`  | rectangular building clusters are visible            |
| `building-dissolve` | near-view building detail appears without popping    |
| `inspect`           | close camera view remains readable and non-occluding |

## Required QA Metrics

The structured QA payload must expose:

- `phase`
- `qa.passed`
- `qa.errors`
- `qa.warnings`
- `qa.geometry.routeGroundClearanceP95`
- `qa.geometry.buildingBaseTerrainErrorP95`
- `qa.geometry.waterCoverageRatio`
- `qa.geometry.bridgeContinuity`
- `qa.budgets.visibleMeshCount`
- `qa.provenance.missingAttributionCount`

The DOM clipped contract must expose equivalent `data-qa-*` values on `#map-3d` for browser containers that cannot reliably read `window.__threeDebug__`.

## Merge Gate

Before visual baseline screenshots are enforced in CI, every new scene or effect must first satisfy:

```text
npm run check
npm test
npm run check:encoding
npm run check:architecture
npx playwright test tests/e2e/smoke.spec.js --project=chromium
```

After the first screenshot fixtures are added, CI may enforce only the smallest stable set first:

```text
river-bridge overview ROI
micro-street route-focus ROI
hiking-terrain overview ROI
```

Full-screen golden images are useful for release review, but ROI screenshots plus structured metrics are the default regression gate.
