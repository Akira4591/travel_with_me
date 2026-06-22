# 3D Visual Baseline Specification

## Purpose

The 3D map module must be validated as a geospatial scene pipeline, not only as a nonblank canvas. This specification defines the visual baseline system recommended by the latest map-module repair research.

## Baseline Strategy

Use three layers together:

1. Structured QA metrics from `window.__threeDebug__.qa`.
2. Clipped DOM QA fields from `#map-3d.dataset.qa*`.
3. Playwright screenshots for a small number of stable views and regions of interest.

Do not rely on screenshots alone. A screenshot can show that something changed, but structured metrics must explain whether terrain, water, bridge, route, and building geometry are still correct.

Execution details now live in `docs/qa/visual-baseline.md`. The debug payload contract lives in `docs/qa/debug-contract.md`.

The implementation order is fixed:

```text
local visual reset
  -> route de-gray and anti-jitter repair
  -> red-pin 2D work-area selection
  -> bounded square work-area proof
  -> outside-context dimming proof
  -> bounded-scene screenshot gates
  -> then resume:
visual proof infrastructure
  -> P2 water / road / bridge visual correctness
  -> P3 building massing / dissolve refinement
  -> inspect camera and scene precision profiles
```

## Scenario Catalog

Maintain five deterministic scene fixtures:

| Scene            | Purpose                                       | Required checks                                                     |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| `micro-street`   | Dense street-level city planning              | route readability, building LOD, POI marker readability             |
| `citywalk`       | Flat urban route with roads and context mass  | 2D/3D route identity, muted road ribbons, building base consistency |
| `river-bridge`   | Water and bridge correctness                  | water carve, no terrain blank gap, bridge deck continuity           |
| `scenic-park`    | Scenic route with landcover and medium relief | scenic terrain mode, landcover, water, route readability            |
| `hiking-terrain` | Mountain or hiking relief                     | terrain variance, slope honesty, route height cue                   |
| `old-street`     | Narrow storefront route readability           | route clarity above dense low-rise storefront context               |
| `landmark-pilot` | Allowlisted real landmark workflow            | provenance, attribution, fallback when model is unavailable         |

Every fixture used for 3D visual review must declare a bounded work area:

```json
{
  "workArea": {
    "center": [116.397, 39.908],
    "spanMeters": 800,
    "profile": "scenic-park",
    "hardCapMeters": 2000
  }
}
```

Route, water, road, bridge, building, vegetation, and landmark context must be clipped or
degraded at the work-area boundary.

Fixtures must be local and deterministic. Live provider calls are not allowed in baseline tests.

The first fixture catalog is now stored under:

```text
tests/fixtures/scenes/river-bridge/
tests/fixtures/scenes/scenic-park/
tests/fixtures/scenes/micro-street/
tests/fixtures/scenes/hiking-terrain/
tests/fixtures/scenes/old-street/
tests/fixtures/scenes/landmark-pilot/
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
- `fixture.id`
- `fixture.profile`
- `workArea.center`
- `workArea.spanMeters`
- `workArea.hardCapMeters`
- `workArea.bounds`
- `fixture.routeHash`
- `camera.mode`
- `camera.autoRotate`
- `camera.distance`
- `camera.polarAngle`
- `camera.clearance`
- `camera.position`
- `camera.target`
- `qa.version`
- `qa.passed`
- `qa.errors`
- `qa.warnings`
- `qa.geometry.routeGroundClearanceP95`
- `qa.geometry.buildingBaseTerrainErrorP95`
- `qa.geometry.waterCoverageRatio`
- `qa.geometry.bridgeContinuity`
- `qa.geometry.zFightingRisk`
- `qa.geometry.terrainCarvingDepthP50`
- `qa.geometry.routeVisiblePixelRatio`
- `qa.geometry.routeYellowPixelRatio`
- `qa.geometry.routeGrayOutlinePixelRatio`
- `qa.geometry.bridgePierCount`
- `qa.geometry.workAreaRaisedPixelRatio`
- `qa.geometry.slabRiseTopHeightVariance`
- `qa.geometry.outsideDimmedPixelRatio`
- `qa.budgets.visibleMeshCount`
- `qa.budgets.triangleCount`
- `qa.budgets.frameTimeP95`
- `qa.budgets.generationTimeMs`
- `qa.budgets.vegetationAreaCount`
- `qa.budgets.vegetationMaxInstancesPerArea`
- `qa.budgets.vegetationDensityCap`
- `qa.provenance.missingAttributionCount`
- `qa.layers.water`
- `qa.layers.roads`
- `qa.layers.bridges`
- `qa.layers.route`
- `qa.layers.buildings`
- `qa.lod.buildingEntryCount`
- `qa.lod.buildingDetailRatio`
- `qa.lod.buildingDetailAlphaAverage`
- `qa.lod.buildingDistanceP50`

The DOM clipped contract must expose equivalent `data-qa-*` values on `#map-3d` for browser containers that cannot reliably read `window.__threeDebug__`. Camera fields are exposed as `data-qa-camera-mode`, `data-qa-camera-auto-rotate`, `data-qa-camera-distance`, `data-qa-camera-polar-angle`, `data-qa-camera-clearance`, `data-qa-camera-position`, and `data-qa-camera-target`.

## Bounded-Scene Visual Gates

The local visual reset adds these blocking gates before more terrain/building detail is accepted:

| Gate                     | Required proof                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| `selecting-3d-center`    | 2D click on the 3D button enters selection mode; red pin and square preview are visible. |
| `work-area-hard-cap`     | `workArea.spanMeters <= 2000` for all 3D builds.                                         |
| `work-area-raised`       | selected square is visually distinguishable from outside context after foundation rise.  |
| `uniform-slab-rise`      | selected square top-surface height variance stays within epsilon during `slab-rise`.     |
| `outside-context-dimmed` | outside-area ROI is lower brightness/detail than the selected square.                    |
| `route-no-gray-outline`  | `routeGrayOutlinePixelRatio` remains below the calibrated threshold.                     |
| `route-yellow-primary`   | yellow route pixels remain the dominant route guidance signal.                           |
| `route-no-jitter`        | camera stress sampling keeps `zFightingRisk` and route-pixel variance below threshold.   |
| `no-unbounded-envelope`  | scene envelope source is the selected work area, not route/all-trip bbox.                |

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

The first executable subset is available as:

```powershell
npm.cmd run test:e2e:visual
```

It runs capture-plus-metric gates by default. Golden screenshot assertions are opt-in through `VISUAL_BASELINE_ASSERT=1`.

The first Beta expansion promotes `river-bridge` from layer existence to structural correctness by asserting water coverage, bridge continuity, carving depth, route visibility, route yellow ROI pixels, unsupported pier absence, and z-fighting risk.

The next Beta/P3-adjacent expansion adds `micro-street` near/far LOD validation: zooming into inspect distance must increase building detail alpha, and zooming back to overview distance must reduce it. This gate protects the design rule that buildings dissolve from simple massing into more detailed outlines as the camera approaches, without claiming the full building renderer modularization is complete.

The building dissolve smoothness gate samples stepped zoom-in movement from overview toward inspect distance. It blocks large alpha jumps, backward alpha drops, z-fighting, missing structured route/building layers, and final inspect-route unreadability. This converts the close-view "no pop" requirement into deterministic QA evidence while the renderer is still monolithic.

The following Beta stability expansion adds 30-second `river-bridge`, `micro-street`, and `hiking-terrain` camera stress gates. They exercise repeated drag, WASD, and wheel input while sampling QA snapshots. The gates block if the route loses its industrial safety-yellow pixel signal, if `zFightingRisk` exceeds `0.01`, or if the scene leaves `steady` phase during the stress window. The `micro-street` variant also requires visible building-layer context so dense street scenes cannot hide or weaken the route signal without detection. The `hiking-terrain` variant requires attributable landcover context so terrain and vegetation templates cannot hide the route signal without detection.

The vegetation budget gate records per-landcover-area template counts and fails if generated instances exceed the declared density cap. It also exposes vegetation chunk, visible chunk, and frustum-culled chunk telemetry for licensed landcover. Full terrain-tile streaming remains separate P4 work.

The inspect-view gate validates the close-camera state directly: `micro-street` must enter `camera.mode === "inspect"`, keep terrain-relative camera clearance inside profile bounds, keep route and building context visible together, and retain the industrial safety-yellow route signal. This closes the first deterministic inspect-state visual review without requiring committed golden screenshots.

The water-pixel gate validates `river-bridge` as a rendered image, not only as mesh counts. It samples the WebGL ROI for a blue-grey water signal and combines that with the carved-channel depth metric. This blocks regressions where attributable water data exists but the screen falls back to terrain-colored blank space.

The contextual-route gate adds `old-street` and `landmark-pilot` fixtures. `old-street` verifies narrow storefront context does not hide the industrial safety-yellow route. `landmark-pilot` keeps landmark provenance and placeholder metadata in the scene contract while blocking route unreadability before true restoration is allowed.

The timeline-stage gate freezes the emergence animation in test mode and captures `river-bridge` at foundation rise, carved geography, route highlight, building massing, building dissolve, and route focus. Each checkpoint attaches ROI PNG evidence and QA JSON so the accepted 4-second generation sequence can be reviewed without relying on manual timing.

The scenario-precision gate verifies that the terrain profile matches the use case: `old-street` uses micro-street precision and restrained relief, `scenic-park` uses scenic terrain with landcover and medium relief, and `hiking-terrain` uses hiking terrain with high elevation range. This protects the product rule that street browsing, scenic walking, and mountain hiking should not share one generic terrain setting.

The overview/inspect review gate uses fixed fixture camera presets for `hiking-terrain`, `old-street`, and `landmark-pilot`. Each scene must attach overview and inspect ROI screenshots plus QA JSON, prove the expected camera mode, keep route guidance readable, and retain its required context layer: mountain landcover/relief, old-street storefront buildings, or landmark provenance metadata. This closes deterministic screenshot review without enabling committed golden baselines by default.
