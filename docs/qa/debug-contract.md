# 3D Debug QA Contract

## Purpose

`window.__threeDebug__.qa` is the structured evidence contract for 3D visual and geometry quality. It explains why a screenshot passed or failed and prevents visual review from becoming subjective.

This contract is versioned. New fields should be additive until the visual baseline gate is stable.

## Schema v1

```js
window.__threeDebug__ = {
  phase: 'foundation-rise',
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
      bridgePierCount: 0
    },
    budgets: {
      visibleMeshCount: 0,
      triangleCount: 0,
      frameTimeP95: 0,
      generationTimeMs: 0,
      textureMemoryEstimateMB: 0
    },
    provenance: {
      totalRealAssets: 0,
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
    }
  }
};
```

## Initial Thresholds

These values are starting points and must be calibrated against local fixture evidence before they become hard release gates.

| Metric                        | Initial target                                           | Gate phase   |
| ----------------------------- | -------------------------------------------------------- | ------------ |
| `waterCoverageRatio`          | `>= 0.97` for `river-bridge`                             | Sprint Beta  |
| `bridgeContinuity`            | `>= 0.98` for `river-bridge`                             | Sprint Beta  |
| `bridgePierCount`             | `0` when no pier/support provenance exists               | Sprint Beta  |
| `routeGroundClearanceP95`     | visible above terrain/roads without floating unnaturally | Sprint Beta  |
| `buildingBaseTerrainErrorP95` | `<= 0.25m`                                               | Sprint Gamma |
| `routeVisiblePixelRatio`      | calibrated after first inspect ROI captures              | Sprint Gamma |

## Rules

- Route readability is the highest rendering priority.
- Metrics that are not calibrated should start as warnings, not blocking errors.
- Real-world asset provenance failures block real-world rendering, not synthetic planning context.
- Synthetic fallback buildings must remain marked as synthetic and must not be labelled as true exterior reconstructions.
- `qa.version` must be present on every visual baseline capture.
