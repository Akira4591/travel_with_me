# Visual Baseline QA Plan

> **辅助文件** | 权威开发文档: [DEVELOPMENT.md](../../../DEVELOPMENT.md)

## Purpose

The next 3D iteration must prove visual quality through deterministic evidence, not manual memory. Visual baselines are the prerequisite for P2 visual fixes and P3 building refinement.

This plan is intentionally limited to desktop Chromium, deterministic local fixtures, ROI screenshots, and structured QA metrics. Live provider calls are not part of visual baseline tests.

## Sprint Order

| Sprint | Objective                                            | Output                                                                                                     | Rollback                                                                                 |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| VQ0    | Repair route layer and local 3D scope                | No-gray route, red-pin selection, bounded square work area, outside dimming                                | Fall back to 2D and disable 3D generation until a local center is selected               |
| Alpha  | Establish deterministic visual proof infrastructure  | ROI screenshot suite, frozen camera presets, QA schema v1, failure attachments                             | Keep screenshot capture and QA JSON, disable blocking screenshot assertions until stable |
| Beta   | Close P2 water, road, bridge visual correctness      | Water carve, bridge continuity, route clearance, z-fighting metrics plus ROI baselines                     | Downgrade unstable thresholds to warnings while preserving evidence                      |
| Gamma  | Modularize P3 building massing and dissolve          | Implemented at code level: split renderers, deterministic synthetic massing metadata, LOD transition gates | Keep massing-only renderer active and guard dissolve behind a feature flag               |
| Delta  | Complete inspect camera and scene precision profiles | Camera state machine, scene budgets, graceful degradation                                                  | Lock profile selection to fixture-declared profiles until thresholds are calibrated      |

Do not start P4 DEM tiles, P5 landmark restoration, or commercial 3D provider routing before
VQ0 and Delta are stable.

## VQ0 Local Visual Reset

The manual screenshot review from 2026-06-22 overrides the previous "all green" automated status:
the rendered 3D view could still look like an unbounded white board with gray route artifacts.
VQ0 is therefore a blocking visual-quality reset.

Implementation status on 2026-06-23: VQ0 is implemented at code level, the full visual baseline
suite passes, and the in-app browser QA passes on the bounded output. Final promotion still
requires user manual review of the new bounded composition.

Required VQ0 evidence:

- The 3D button from 2D enters `selecting-3d-center` instead of immediately building 3D.
- A red pin follows the cursor and a square work-area preview is visible on the 2D map.
- A 2D map click commits `workArea.center`.
- The selected 3D square defaults to 800m unless profile rules select 600m, 1000m, or 2000m.
- `workArea.spanMeters` never exceeds the V1 hard cap of 2000m.
- The selected square rises with the existing bone-white terrain style and a uniform top-surface
  height.
- Outside context is dimmer or lower detail than the selected square.
- The 3D route does not render a gray outline or thick gray bed as route guidance.
- The 3D route uses the same visual state as the 2D page route: color, width, dash state, and
  selected-segment styling must match the active 2D route. The current default 2D style may be
  yellow, but 3D must inherit it instead of hard-coding yellow.
- On flat terrain the projected route is flat. On raised or depressed surfaces it conforms tightly
  to the surface, reading like a local texture replacement rather than a floating tube.
- A selected work area with no route segment must render no route layer.
- Muted 3D road ribbons may exist as terrain context, but their opacity must stay low enough that
  they cannot be read as route outline.
- Building LOD must preserve opaque low-poly massing while adding near-camera detail; it must not
  use full-building transparency as the primary dissolve cue.
- The projected route remains stable during drag, WASD, and wheel interaction.
- The first 3D frame starts on the same scene-profile overview orbit used by idle auto-rotate; there
  is no separate initial camera angle that later snaps into orbit.

Current VQ0 blocking metrics:

| Metric                           | Initial target                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------- |
| `routeGrayOutlinePixelRatio`     | `0` for route guidance mesh roles; gray road context is allowed as road layer.   |
| `routeStyleParity`               | 3D route color, width, dash state, and selected state match the 2D route.        |
| `routeSurfaceConformance`        | Projected route stays tight to terrain, road, water/bridge deck, or surface.     |
| `routeAbsentWhenNoSegment`       | No route layer appears when the selected work area contains no route segment.    |
| `routeYellowPixelRatio`          | Legacy/current-default readability sample while 2D default route remains yellow. |
| `routePixelVarianceDuringStress` | Does not spike during camera stress sampling.                                    |
| `workArea.spanMeters`            | `<= 2000`.                                                                       |
| `workAreaRaisedPixelRatio`       | Above the calibrated selected-square visibility threshold.                       |
| `slabRiseTopHeightVariance`      | `<= 0.01m` during `slab-rise`; terrain variation starts after `terrain-refine`.  |
| `outsideDimmedPixelRatio`        | Proves outside context is lower brightness/detail than the selected square.      |

## Fixture Scope

The first blocking visual baseline covers:

| Fixture              | Purpose                                       | First ROI captures                                        |
| -------------------- | --------------------------------------------- | --------------------------------------------------------- |
| `river-bridge`       | Water carve, bridge deck, route clearance     | `foundation-rise`, `water-road-bridge`, `route-highlight` |
| `wide-river-bridges` | Wide polygon water and multiple bridge decks  | `water-road-bridge`                                       |
| `micro-street`       | Dense street readability and building massing | `route-highlight`, `building-massing`, `inspect`          |
| `hiking-terrain`     | Terrain relief and route height cue           | `foundation-rise`, `route-highlight`, `inspect`           |
| `old-street`         | Narrow storefront street occlusion            | `route-highlight`, `inspect`                              |
| `landmark-pilot`     | Landmark workflow preflight and route clarity | `route-highlight`, `inspect`                              |
| `scenic-park`        | Scenic park relief and landcover              | `route-highlight`, `inspect`                              |

Candidate fixture layout:

```text
tests/visual/
  styles/screenshot-normalize.css
  __screenshots__/
    chromium/
      river-bridge/
      micro-street/
      hiking-terrain/
```

Existing deterministic scene data remains under `tests/fixtures/scenes/*`.

## Screenshot Policy

Use ROI screenshots first. Full-screen golden images are release-review assets, not the first merge gate.

Recommended Playwright settings:

- Chromium only for the initial gate.
- Static fixture data only.
- Fixed viewport and device scale policy.
- `clip` for region of interest.
- `stylePath` for screenshot normalization.
- `scale: "css"` unless device-pixel fidelity becomes a product requirement.
- A nonzero, empirically calibrated diff threshold.
- No animations during capture except the phase being intentionally captured.

The first visual suite must prove five consecutive local passes before becoming a hard CI gate.
Use the named repeatability runner for that evidence:

```powershell
npm.cmd run test:e2e:visual:stability -- --runs=5
```

The runner repeats the maintained visual baseline suite with fixture data and the Chromium project.
It accepts Playwright arguments after `--`, so a narrow calibration run can scope by grep before the
full five-run gate is attempted. It also provides named presets:

```powershell
npm.cmd run test:e2e:visual:stability -- --runs=5 --preset=core
npm.cmd run test:e2e:visual:stability -- --runs=5 --preset=precision
npm.cmd run test:e2e:visual:stability -- --runs=5 --preset=overview-inspect
npm.cmd run test:e2e:visual:stability -- --runs=5 --preset=camera-stress
npm.cmd run test:e2e:visual:stability -- --runs=5 --preset=timeline
```

Current collected repeatability evidence:

- Full visual baseline passed 5/5 local runs on 2026-06-23, covering all 24 maintained Chromium
  visual checks per run.
- `core` passed 5/5 local runs on 2026-06-23, covering core ROI captures and the
  micro-street inspect-camera readability gate.
- `overview-inspect` passed 5/5 local runs on 2026-06-23, covering `hiking-terrain`,
  `old-street`, and `landmark-pilot` overview/inspect review gates.
- `precision` passed 5/5 local runs on 2026-06-23, covering old-street city precision,
  scenic-park scenic precision, and hiking-terrain mountain precision gates.
- `camera-stress` passed 5/5 local runs on 2026-06-23, covering river-bridge,
  micro-street, and hiking-terrain 30-second route-readability stress gates.
- `timeline` passed 5/5 local runs on 2026-06-23, covering the river-bridge staged generation
  sequence from foundation rise through route focus.

Passing the full command is required before capture-only ROI evidence is promoted to maintained
golden screenshots. Presets are for diagnosis and scoped calibration; they do not replace the full
five-run gate.

## Failure Artifacts

Every failed visual test should attach:

- actual screenshot
- diff screenshot
- expected screenshot path
- fixture JSON
- active camera preset JSON
- exported `window.__threeDebug__.qa` JSON
- Playwright trace

This is required because visual failures are expensive to diagnose without scene state and camera state.

## Blocking Criteria

The first blocking visual gate is intentionally small:

1. three fixtures;
2. ROI screenshots only;
3. structured QA JSON for each capture;
4. no live provider dependency;
5. route readability and P2 geometry metrics prioritized over aesthetic polish.

## Implemented Alpha Command

The first Alpha visual subset is:

```powershell
npm.cmd run test:e2e:visual
```

Default behavior:

- runs Chromium only;
- loads `river-bridge`, `micro-street`, and `hiking-terrain` from local fixtures;
- attaches ROI screenshots plus fixture, camera, and QA JSON evidence;
- asserts `river-bridge` and `wide-river-bridges` P2 water/bridge/route metrics;
- asserts water ROI blue-pixel signal so attributable water cannot regress to terrain-colored blank space;
- asserts `micro-street`, `old-street`, and `landmark-pilot` near/far building LOD response through `qa.lod` metrics;
- asserts `micro-street`, `old-street`, and `landmark-pilot` stepped building dissolve smoothness
  through bounded `buildingDetailAlphaAverage` deltas;
- asserts fallback low-poly building massing uses `InstancedMesh` while semantic building counts
  remain fixture-readable;
- asserts `micro-street` inspect view readability with close-camera y clamp, route visibility, and building context;
- asserts `old-street` and `landmark-pilot` route readability above contextual buildings and landmark metadata;
- asserts `hiking-terrain`, `old-street`, and `landmark-pilot` overview-plus-inspect screenshot review through fixed camera presets;
- captures the `river-bridge` generation timeline at foundation, carved geography, route highlight, building massing, building dissolve, and route-focus checkpoints;
- directly tests `building-massing-renderer.js` for deterministic fallback rebuilds,
  authoritative footprint extrusion, and synthetic fallback when unlocated footprints are rejected
  by terrain-error tolerance;
- asserts city, scenic, and hiking terrain precision profiles through scenario-specific terrain mode, elevation range, landcover, water, and route-readability gates;
- runs a 30-second `river-bridge` camera stress subset and samples route readability plus z-fighting risk;
- runs a 30-second `micro-street` dense-building camera stress subset and samples route readability plus z-fighting risk;
- runs a 30-second `hiking-terrain` terrain camera stress subset and samples route readability plus z-fighting risk;
- asserts licensed landcover vegetation stays within the per-area template density budget and
  exposes chunk/frustum telemetry;
- measures vegetation visibility with landcover chunk bounds so sparse template placement does not
  incorrectly report licensed vegetation as fully culled during camera stress;
- does not call live providers;
- does not require committed golden images.

Set `VISUAL_BASELINE_ASSERT=1` only when intentionally creating or validating committed screenshot baselines.

Current blocking water/bridge metrics for `river-bridge` and `wide-river-bridges`:

- `waterCoverageRatio >= expectations.water.minCoverageRatio`;
- `bridgeContinuity >= expectations.bridge.minSpanCoverageRatio`;
- `terrainCarvingDepthP50 >= expectations.water.minChannelDepthMeters`;
- `routeVisiblePixelRatio >= 0.90`;
- `routeYellowPixelRatio >= expectations.route.minYellowPixelRatio`;
- `routeGrayOutlinePixelRatio === 0` for route guidance mesh roles;
- `waterBluePixelRatio >= expectations.water.minBluePixelRatio`;
- `bridgePierCount === 0`;
- `bridgeDecks >= expectations.bridge.minDeckCount`;
- `zFightingRisk <= 0.01`.

Current blocking `river-bridge` water-pixel metrics:

- `waterVisual.readable === true`;
- `waterVisual.waterBluePixelRatio >= 0.00008`;
- `terrainCarvingDepthP50 >= expectations.water.minChannelDepthMeters`.

Current blocking `wide-river-bridges` expansion metrics:

- fixture uses polygon waterways instead of only centerline ribbons;
- fixture includes at least two bridge decks over the water polygons;
- all water/bridge thresholds are owned by `expectations.json`, not hard-coded in the test body;
- this blocks regressions where a single narrow river fixture passes while broader rivers, canals, or multiple spans fail visually.

Current blocking `river-bridge` camera stress metrics:

- interaction duration must be at least 30 seconds;
- at least four sampled QA snapshots must remain in `steady` phase;
- sampled `routeYellowPixelRatio` must remain `>= expectations.route.minYellowPixelRatio`;
- sampled `zFightingRisk` must remain `<= 0.01`;
- final ROI capture must remain route-readable.

Current blocking `micro-street` dense-building camera stress metrics:

- interaction duration must be at least 30 seconds;
- at least four sampled QA snapshots must remain in `steady` phase;
- sampled `routeYellowPixelRatio` must remain `>= expectations.route.minYellowPixelRatio`;
- sampled `zFightingRisk` must remain `<= 0.01`;
- final ROI capture must remain route-readable;
- final capture must include visible building layer context.

Current blocking `hiking-terrain` terrain camera stress metrics:

- interaction duration must be at least 30 seconds;
- at least two full sampled QA snapshots must remain in `steady` phase because terrain pixel reads are slower than city fixtures;
- sampled `routeYellowPixelRatio` must remain `>= expectations.route.minYellowPixelRatio`;
- sampled `zFightingRisk` must remain `<= 0.01`;
- final ROI capture must remain route-readable;
- final capture must include attributable landcover context.
- vegetation visible/cull telemetry must remain internally consistent after 30 seconds of drag,
  WASD, and wheel interaction.

Current blocking vegetation budget metrics:

- `qa.budgets.vegetationAreaCount > 0` for `hiking-terrain`;
- `qa.budgets.vegetationMaxInstancesPerArea <= qa.budgets.vegetationDensityCap`;
- `qa.budgets.vegetationChunkCount > 0`;
- `qa.budgets.vegetationVisibleChunkCount > 0`;
- `qa.budgets.vegetationVisibleChunkCount <= qa.budgets.vegetationChunkCount`;
- `qa.budgets.vegetationVisibleChunkCount + qa.budgets.vegetationCulledChunkCount === qa.budgets.vegetationChunkCount`;
- density overflow is a hard `VEGETATION_DENSITY_CAP_EXCEEDED` QA error.

Current blocking building LOD metrics for `micro-street`, `old-street`, and `landmark-pilot`:

- `qa.lod.buildingEntryCount > 0`;
- fixture-specific `qa.lod.buildingEntryCount >= expectations.building.minLodEntries`;
- fixture-specific building layer count `>= expectations.building.minContextBuildings`;
- fallback scenes must expose `counts.syntheticBuildingMassings > 0` and
  `counts.instancedBuildingMassingMeshes > 0`;
- inspect-distance `buildingDetailAlphaAverage` must be greater than overview-distance `buildingDetailAlphaAverage`;
- returning to overview distance must reduce `buildingDetailAlphaAverage`;
- inspect-distance `buildingDetailRatio` must not regress below overview-distance `buildingDetailRatio`.

Additional contextual LOD requirements:

- `old-street` inspect LOD must retain at least three LOD-sampled buildings and four contextual building-layer entries;
- `landmark-pilot` inspect LOD must retain at least two LOD-sampled buildings and two contextual building-layer entries;
- `landmark-pilot` inspect LOD must keep at least one allowlisted landmark record in provenance QA.

Current blocking building dissolve smoothness metrics for `micro-street`, `old-street`, and
`landmark-pilot`:

- seven stepped zoom samples must remain in `steady` phase;
- every sample must keep route and building layers visible in structured QA;
- sampled `zFightingRisk` must remain `<= 0.01`;
- `buildingDetailAlphaAverage` may not drop by more than `0.03` between adjacent samples;
- adjacent positive `buildingDetailAlphaAverage` delta must remain `<= 0.42`;
- final `buildingDetailAlphaAverage` must increase by at least `0.20` versus the first sample;
- final inspect ROI must retain `routeYellowPixelRatio >= expectations.route.minYellowPixelRatio`.
- fixture-specific `qa.lod.buildingEntryCount` and building layer counts must satisfy
  `expectations.building.minLodEntries` and `expectations.building.minContextBuildings` when set.
- fallback low-poly massing must remain instanced during the dissolve review.

Current blocking `micro-street` inspect metrics:

- `camera.mode === "inspect"`;
- `camera.clearance` stays between `camera.minClearance` and `camera.maxClearance`;
- route and building layers are visible together;
- `qa.lod.buildingDetailAlphaAverage > 0`;
- `routeYellowPixelRatio >= expectations.route.minYellowPixelRatio`;
- `zFightingRisk <= 0.01`.

Current blocking `old-street` / `landmark-pilot` contextual route metrics:

- route layer must remain visible in structured QA;
- inspect ROI must retain `routeYellowPixelRatio >= expectations.route.minYellowPixelRatio`;
- `old-street` must render at least four contextual building entries;
- `landmark-pilot` must retain at least one attributable landmark record;
- `landmark-pilot` must report `qa.provenance.landmarkAllowlisted >= 1`;
- `buildingBaseTerrainErrorP95 <= 0.25`;
- `zFightingRisk <= 0.01`.

Current blocking overview / inspect review metrics:

- `hiking-terrain`, `old-street`, `landmark-pilot`, and `river-bridge` must be represented in
  the Gate 50 live-review packet;
- the minimum Gate 50 live-review packet is eight shots: hiking overview/route-focus, old-street
  overview/inspect, landmark route-focus/inspect, and river-bridge overview/inspect;
- deterministic visual baseline may keep narrower fixture-scoped tests, but the manual packet must
  expose water/bridge value directly;
- overview capture must enter `camera.mode === "overview"`;
- route-focus capture must enter `camera.mode === "route-focus"`;
- inspect capture must enter `camera.mode === "inspect"`;
- inspect capture must keep `camera.clearance` inside the terrain-relative profile bounds;
- both captures must keep the route layer visible and route pixels readable at the fixture threshold;
- `hiking-terrain` must retain attributable landcover, vegetation budget evidence, and terrain height variance at the mountain threshold;
- `old-street` must retain at least four contextual building entries;
- `landmark-pilot` must retain at least one attributable landmark record;
- `landmark-pilot` must report `qa.provenance.landmarkAllowlisted >= 1`;
- `river-bridge` must retain water meshes, bridge decks, blue-grey water pixels, route visibility,
  `bridgePierCount === 0`, and fixture-owned water/bridge continuity thresholds;
- all captures must keep `zFightingRisk <= 0.01`.

## QA v2 Presentation Metrics

The next metrics are presentation-quality indicators, not immediate hard gates. Add them to
`window.__threeDebug__.qa` in warning mode, collect local samples in Gate 50 packets, and only make
thresholds blocking after repeated fixture evidence.

| Metric                         | First use                                                                |
| ------------------------------ | ------------------------------------------------------------------------ |
| `terrainReliefContrast`        | Hiking anti-white-board review; prove relief cue without dirtiness       |
| `nonBackgroundPixelRatio`      | Detect visually blank first screens                                      |
| `visibleSemanticLayerCount`    | Count route, terrain, water, road, building, POI/landmark layers         |
| `firstScreenRouteLegibility`   | Camera/presentation score for default overview or route-focus            |
| `routeContextAdjacency`        | Route visible near roads, buildings, POIs, water, or terrain cues        |
| `routeStyleParity`             | 3D route inherits active 2D route color, width, dash, and selected state |
| `routeSurfaceConformance`      | Route projection stays visually attached to valid 3D surfaces            |
| `routeAbsentWhenNoSegment`     | Empty work areas do not fabricate route geometry                         |
| `workAreaFigureGroundContrast` | Selected square separates from outside context without hard border       |

Initial calibration command:

```powershell
npm.cmd run gate50:live-review
```

Promotion command after metrics are implemented and thresholds are calibrated:

```powershell
npm.cmd run gate50:review -- --include-stability --stability-runs=5
```

Current blocking `river-bridge` timeline stage metrics:

- `foundation-rise` must remain in `slab-rise` with partial `foundationProgress`, no route draw, and no building massing;
- `carved-geography` must remain in `water-carve`, expose water and road layers, and keep carved-channel depth above the fixture threshold;
- `route-highlight` must remain in `route-highlight`, expose route layer diagnostics, and have route draw progress `>= 0.95`;
- `building-massing` must remain in `building-massing`, expose partial building massing progress, and keep dissolve progress at `0`;
- `building-dissolve` must remain in `building-dissolve`, expose completed massing plus active dissolve progress;
- `route-focus` must finish emergence, enter `camera.mode === "route-focus"`, and retain readable
  projected route styling. While the 2D default route remains yellow, the legacy
  `routeYellowPixelRatio >= expectations.route.minYellowPixelRatio` sample remains a readability
  proxy.

Current blocking scenario precision metrics:

- `old-street` must choose `terrainMode === "micro-street"` and keep low city elevation range within the fixture threshold;
- `scenic-park` must choose `terrainMode === "scenic-park"`, retain attributable landcover and water, and show medium terrain relief;
- `hiking-terrain` must choose `terrainMode === "hiking"` and show high mountain elevation range;
- all three scenario reviews must keep route layer visible, route pixels readable at the scene-specific threshold, and `zFightingRisk <= 0.01`.

Current live-entry browser QA metrics:

- 2D marker selection must commit `workArea.source === "selected-2d-point"`;
- `workArea.spanMeters` must stay within the selected profile budget and the 2000m hard cap;
- `qaPassed === "true"`;
- `qaRouteGrayOutlinePixelRatio === "0"`;
- `qaRouteClearanceP95 <= 0.3`;
- the initial screenshot must show the bounded square from the overview orbit instead of a low
  horizon view;
- the projected route must read with the same color and width as the active 2D route style.

## Beta Route Style Calibration

Each maintained visual fixture currently declares `expectations.route.minYellowPixelRatio` because
the current default 2D route style is yellow. This is a legacy readability proxy, not the final style
contract. The next QA update should add style-parity and surface-conformance metrics so future 2D
route colors or widths can propagate to 3D without rewriting fixture thresholds.

Calibration sample from 2026-06-23:

| Fixture          | Configured minimum | Overview sample | Inspect sample |
| ---------------- | -----------------: | --------------: | -------------: |
| `river-bridge`   |           0.000300 |         0.00128 |        0.00727 |
| `micro-street`   |           0.000350 |         0.00149 |        0.00901 |
| `hiking-terrain` |           0.000035 |         0.00213 |        0.00387 |
| `old-street`     |           0.000080 |         0.00184 |        0.00883 |
| `scenic-park`    |           0.000050 |         0.00149 |        0.01965 |
| `landmark-pilot` |           0.000150 |         0.00064 |        0.00759 |
