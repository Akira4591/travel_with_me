# 3D Debug QA Contract

## Purpose

`window.__threeDebug__.qa` is the structured evidence contract for 3D visual and geometry quality. It explains why a screenshot passed or failed and prevents visual review from becoming subjective.

This contract is versioned. New fields should be additive until the visual baseline gate is stable.

## Schema v1

```js
window.__threeDebug__ = {
  phase: 'foundation-rise',
  workArea: {
    source: 'selected-2d-point',
    center: { lng: 116.397, lat: 39.908 },
    spanMeters: 800,
    hardCapMeters: 2000,
    profile: 'scenic-park',
    bounds: {
      west: 0,
      south: 0,
      east: 0,
      north: 0
    },
    clippedRoute: true,
    outsideContextDimmed: true
  },
  fixture: {
    id: 'river-bridge',
    profile: 'scenic',
    seed: 'river-bridge-v1',
    routeHash: '...'
  },
  camera: {
    mode: 'overview',
    autoOrbitActive: false,
    idleMs: 0,
    position: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    distanceToRoute: 0
  },
  qa: {
    version: 1,
    passed: true,
    errors: [],
    warnings: [],
    geometry: {
      routeGroundClearanceP95: 0,
      buildingBaseTerrainErrorP95: 0,
      waterCoverageRatio: 0,
      bridgeContinuity: 0,
      zFightingRisk: 0,
      terrainCarvingDepthP50: 0,
      routeVisiblePixelRatio: 0,
      routeYellowPixelRatio: 0,
      routeGrayOutlinePixelRatio: 0,
      routePixelVarianceDuringStress: 0,
      workAreaRaisedPixelRatio: 0,
      slabRiseTopHeightVariance: 0,
      outsideDimmedPixelRatio: 0,
      bridgePierCount: 0
    },
    budgets: {
      visibleMeshCount: 0,
      triangleCount: 0,
      frameTimeP95: 0,
      generationTimeMs: 0,
      textureMemoryEstimateMB: 0,
      vegetationAreaCount: 0,
      vegetationMaxInstancesPerArea: 0,
      vegetationDensityCap: 0,
      vegetationChunkCount: 0,
      vegetationVisibleChunkCount: 0,
      vegetationCulledChunkCount: 0
    },
    provenance: {
      totalRealAssets: 0,
      landmarkCount: 0,
      landmarkAllowlisted: 0,
      landmarkOptimized: 0,
      landmarkIntegrityCount: 0,
      missingSourceCount: 0,
      missingLicenceCount: 0,
      missingAttributionCount: 0,
      missingUpdatedAtCount: 0
    },
    layers: {
      water: { visible: true, count: 0, degraded: false },
      roads: { visible: true, count: 0, degraded: false },
      bridges: { visible: true, count: 0, degraded: false },
      route: { visible: true, count: 0, degraded: false },
      buildings: { visible: true, count: 0, degraded: false },
      vegetation: { visible: false, count: 0, degraded: false }
    },
    lod: {
      buildingEntryCount: 0,
      buildingDetailRatio: 0,
      buildingDetailAlphaAverage: 0,
      buildingDistanceP50: 0
    }
  }
};
```

## Initial Thresholds

These values are starting points and must be calibrated against local fixture evidence before they become hard release gates.

| Metric                           | Initial target                                           | Gate phase   |
| -------------------------------- | -------------------------------------------------------- | ------------ |
| `workArea.spanMeters`            | `<= 2000m`                                               | VQ0          |
| `routeGrayOutlinePixelRatio`     | `0` for route guidance mesh roles                        | VQ0          |
| `routePixelVarianceDuringStress` | stable during drag/WASD/wheel camera stress              | VQ0          |
| `workAreaRaisedPixelRatio`       | selected square is visibly raised                        | VQ0          |
| `slabRiseTopHeightVariance`      | `<= 0.01m` before terrain refine                         | VQ0          |
| `outsideDimmedPixelRatio`        | outside context is visibly dimmer/lower detail           | VQ0          |
| `waterCoverageRatio`             | `>= 0.97` for `river-bridge`                             | Sprint Beta  |
| `bridgeContinuity`               | `>= fixture bridge.minSpanCoverageRatio`                 | Sprint Beta  |
| `bridgePierCount`                | `0` when no pier/support provenance exists               | Sprint Beta  |
| `terrainCarvingDepthP50`         | `>= fixture water.minChannelDepthMeters`                 | Sprint Beta  |
| `routeVisiblePixelRatio`         | `>= 0.90` for the first `river-bridge` ROI gate          | Sprint Beta  |
| `routeGroundClearanceP95`        | visible above terrain/roads without floating unnaturally | Sprint Beta  |
| `buildingBaseTerrainErrorP95`    | `<= 0.25m`                                               | Sprint Gamma |
| `buildingDetailAlphaAverage`     | increases when zooming into `micro-street` inspect view  | Sprint Gamma |
| `vegetationMaxInstancesPerArea`  | `<= vegetationDensityCap` for licensed landcover         | Sprint Beta  |
| `vegetationChunkCount`           | `> 0` when licensed vegetation renders                   | Sprint Beta  |
| `vegetationVisibleChunkCount`    | `> 0` and `<= vegetationChunkCount`                      | Sprint Beta  |
| `vegetationCulledChunkCount`     | visible + culled equals `vegetationChunkCount`           | Sprint Beta  |
| `landmarkAllowlisted`            | equals `landmarkCount` before any landmark model is used | Sprint P5    |

## Rules

- Route readability is the highest rendering priority.
- The scene envelope source must be explicit. `workArea.source` must be `selected-2d-point` for
  user-entered 3D mode.
- `slab-rise` exposes a uniform selected-plane lift. Any DEM relief or water/road deformation
  before `terrain-refine` is a phase-ordering bug.
- Route guidance must not use gray outline/bed geometry as the primary route visual. Muted gray road
  context remains allowed as a separate road layer.
- Metrics that are not calibrated should start as warnings, not blocking errors.
- Real-world asset provenance failures block real-world rendering, not synthetic planning context.
- Synthetic fallback buildings must remain marked as synthetic and must not be labelled as true exterior reconstructions.
- `qa.version` must be present on every visual baseline capture.

## Implemented Fields

The Alpha implementation currently emits the v1 geometry, budget, provenance, and layer fields through `window.__threeDebug__.qa` and mirrors the most important clipped values onto `#map-3d.dataset.qa*`.

Current deliberately non-blocking field:

- `terrainHeightVariance` for `hiking-terrain`; this remains telemetry until scene precision profiles are implemented.
- `routeYellowPixelRatio`; it is currently a Playwright ROI metric. Each maintained visual fixture
  must declare `expectations.route.minYellowPixelRatio`, and tests fail if the threshold is missing.
- `routeGrayOutlinePixelRatio`, `workAreaRaisedPixelRatio`, and `outsideDimmedPixelRatio`; these
  are emitted by VQ0 and mirrored to `#map-3d.dataset.qa*`.
- `qa.lod.*`; current gates prove near/far building detail response, while module split and video-style no-pop review remain future P3 work.
- `qa.budgets.vegetationChunkCount`, `vegetationVisibleChunkCount`, and
  `vegetationCulledChunkCount`; current gates prove chunk/frustum telemetry for licensed landcover,
  while full terrain-tile streaming remains future P4 work.
- `qa.provenance.landmarkAllowlisted`, `landmarkOptimized`, and `landmarkIntegrityCount`; these are now blocking release-gate evidence for landmark records, even though remote landmark model rendering remains disabled.
