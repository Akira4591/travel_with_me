# Visual Baseline QA Plan

## Purpose

The next 3D iteration must prove visual quality through deterministic evidence, not manual memory. Visual baselines are the prerequisite for P2 visual fixes and P3 building refinement.

This plan is intentionally limited to desktop Chromium, deterministic local fixtures, ROI screenshots, and structured QA metrics. Live provider calls are not part of visual baseline tests.

## Sprint Order

| Sprint | Objective                                            | Output                                                                                   | Rollback                                                                                 |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| VQ0    | Repair route layer and local 3D scope                | No-gray route, red-pin selection, bounded square work area, outside dimming              | Fall back to 2D and disable 3D generation until a local center is selected               |
| Alpha  | Establish deterministic visual proof infrastructure  | ROI screenshot suite, frozen camera presets, QA schema v1, failure attachments           | Keep screenshot capture and QA JSON, disable blocking screenshot assertions until stable |
| Beta   | Close P2 water, road, bridge visual correctness      | Water carve, bridge continuity, route clearance, z-fighting metrics plus ROI baselines   | Downgrade unstable thresholds to warnings while preserving evidence                      |
| Gamma  | Modularize P3 building massing and dissolve          | Split building renderers, deterministic synthetic massing metadata, LOD transition gates | Keep massing-only renderer active and guard dissolve behind a feature flag               |
| Delta  | Complete inspect camera and scene precision profiles | Camera state machine, scene budgets, graceful degradation                                | Lock profile selection to fixture-declared profiles until thresholds are calibrated      |

Do not start P4 DEM tiles, P5 landmark restoration, or commercial 3D provider routing before
VQ0 and Delta are stable.

## VQ0 Local Visual Reset

The manual screenshot review from 2026-06-22 overrides the previous "all green" automated status:
the rendered 3D view could still look like an unbounded white board with gray route artifacts.
VQ0 is therefore a blocking visual-quality reset.

Implementation status on 2026-06-23: VQ0 is implemented at code level and the targeted visual
subset passes. Final promotion still requires manual review of the new bounded output.

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
- The yellow route remains stable during drag, WASD, and wheel interaction.

Current VQ0 blocking metrics:

| Metric                           | Initial target                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `routeGrayOutlinePixelRatio`     | `0` for route guidance mesh roles; gray road context is allowed as road layer.  |
| `routeYellowPixelRatio`          | Remains above the fixture-specific readable threshold.                          |
| `routePixelVarianceDuringStress` | Does not spike during camera stress sampling.                                   |
| `workArea.spanMeters`            | `<= 2000`.                                                                      |
| `workAreaRaisedPixelRatio`       | Above the calibrated selected-square visibility threshold.                      |
| `slabRiseTopHeightVariance`      | `<= 0.01m` during `slab-rise`; terrain variation starts after `terrain-refine`. |
| `outsideDimmedPixelRatio`        | Proves outside context is lower brightness/detail than the selected square.     |

## Fixture Scope

The first blocking visual baseline covers:

| Fixture          | Purpose                                       | First ROI captures                                        |
| ---------------- | --------------------------------------------- | --------------------------------------------------------- |
| `river-bridge`   | Water carve, bridge deck, route clearance     | `foundation-rise`, `water-road-bridge`, `route-highlight` |
| `micro-street`   | Dense street readability and building massing | `route-highlight`, `building-massing`, `inspect`          |
| `hiking-terrain` | Terrain relief and route height cue           | `foundation-rise`, `route-highlight`, `inspect`           |
| `old-street`     | Narrow storefront street occlusion            | `route-highlight`, `inspect`                              |
| `landmark-pilot` | Landmark workflow preflight and route clarity | `route-highlight`, `inspect`                              |
| `scenic-park`    | Scenic park relief and landcover              | `route-highlight`, `inspect`                              |

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
- asserts `river-bridge` P2 water/bridge/route metrics;
- asserts `river-bridge` water ROI blue-pixel signal so attributable water cannot regress to terrain-colored blank space;
- asserts `micro-street` near/far building LOD response through `qa.lod` metrics;
- asserts `micro-street` stepped building dissolve smoothness through bounded
  `buildingDetailAlphaAverage` deltas;
- asserts `micro-street` inspect view readability with close-camera y clamp, route visibility, and building context;
- asserts `old-street` and `landmark-pilot` route readability above contextual buildings and landmark metadata;
- asserts `hiking-terrain`, `old-street`, and `landmark-pilot` overview-plus-inspect screenshot review through fixed camera presets;
- captures the `river-bridge` generation timeline at foundation, carved geography, route highlight, building massing, building dissolve, and route-focus checkpoints;
- asserts city, scenic, and hiking terrain precision profiles through scenario-specific terrain mode, elevation range, landcover, water, and route-readability gates;
- runs a 30-second `river-bridge` camera stress subset and samples route readability plus z-fighting risk;
- runs a 30-second `micro-street` dense-building camera stress subset and samples route readability plus z-fighting risk;
- runs a 30-second `hiking-terrain` terrain camera stress subset and samples route readability plus z-fighting risk;
- asserts licensed landcover vegetation stays within the per-area template density budget;
- does not call live providers;
- does not require committed golden images.

Set `VISUAL_BASELINE_ASSERT=1` only when intentionally creating or validating committed screenshot baselines.

Current blocking `river-bridge` metrics:

- `waterCoverageRatio >= 0.97`;
- `bridgeContinuity >= 0.95`;
- `terrainCarvingDepthP50 >= expectations.water.minChannelDepthMeters`;
- `routeVisiblePixelRatio >= 0.90`;
- `routeYellowPixelRatio >= 0.00008`;
- `routeGrayOutlinePixelRatio === 0` for route guidance mesh roles;
- `waterBluePixelRatio >= 0.00008`;
- `bridgePierCount === 0`;
- `zFightingRisk <= 0.01`.

Current blocking `river-bridge` water-pixel metrics:

- `waterVisual.readable === true`;
- `waterVisual.waterBluePixelRatio >= 0.00008`;
- `terrainCarvingDepthP50 >= expectations.water.minChannelDepthMeters`.

Current blocking `river-bridge` camera stress metrics:

- interaction duration must be at least 30 seconds;
- at least four sampled QA snapshots must remain in `steady` phase;
- sampled `routeYellowPixelRatio` must remain `>= 0.00008`;
- sampled `zFightingRisk` must remain `<= 0.01`;
- final ROI capture must remain route-readable.

Current blocking `micro-street` dense-building camera stress metrics:

- interaction duration must be at least 30 seconds;
- at least four sampled QA snapshots must remain in `steady` phase;
- sampled `routeYellowPixelRatio` must remain `>= 0.00008`;
- sampled `zFightingRisk` must remain `<= 0.01`;
- final ROI capture must remain route-readable;
- final capture must include visible building layer context.

Current blocking `hiking-terrain` terrain camera stress metrics:

- interaction duration must be at least 30 seconds;
- at least two full sampled QA snapshots must remain in `steady` phase because terrain pixel reads are slower than city fixtures;
- sampled `routeYellowPixelRatio` must remain `>= 0.00008`;
- sampled `zFightingRisk` must remain `<= 0.01`;
- final ROI capture must remain route-readable;
- final capture must include attributable landcover context.

Current blocking vegetation budget metrics:

- `qa.budgets.vegetationAreaCount > 0` for `hiking-terrain`;
- `qa.budgets.vegetationMaxInstancesPerArea <= qa.budgets.vegetationDensityCap`;
- density overflow is a hard `VEGETATION_DENSITY_CAP_EXCEEDED` QA error.

Current blocking `micro-street` LOD metrics:

- `qa.lod.buildingEntryCount > 0`;
- inspect-distance `buildingDetailAlphaAverage` must be greater than overview-distance `buildingDetailAlphaAverage`;
- returning to overview distance must reduce `buildingDetailAlphaAverage`;
- inspect-distance `buildingDetailRatio` must not regress below overview-distance `buildingDetailRatio`.

Current blocking `micro-street` building dissolve smoothness metrics:

- seven stepped zoom samples must remain in `steady` phase;
- every sample must keep route and building layers visible in structured QA;
- sampled `zFightingRisk` must remain `<= 0.01`;
- `buildingDetailAlphaAverage` may not drop by more than `0.03` between adjacent samples;
- adjacent positive `buildingDetailAlphaAverage` delta must remain `<= 0.42`;
- final `buildingDetailAlphaAverage` must increase by at least `0.20` versus the first sample;
- final inspect ROI must retain `routeYellowPixelRatio >= 0.00008`.

Current blocking `micro-street` inspect metrics:

- `camera.mode === "inspect"`;
- `camera.clearance` stays between `camera.minClearance` and `camera.maxClearance`;
- route and building layers are visible together;
- `qa.lod.buildingDetailAlphaAverage > 0`;
- `routeYellowPixelRatio >= 0.00008`;
- `zFightingRisk <= 0.01`.

Current blocking `old-street` / `landmark-pilot` contextual route metrics:

- route layer must remain visible in structured QA;
- inspect ROI must retain `routeYellowPixelRatio >= 0.00008`;
- `old-street` must render at least four contextual building entries;
- `landmark-pilot` must retain at least one attributable landmark record;
- `landmark-pilot` must report `qa.provenance.landmarkAllowlisted >= 1`;
- `buildingBaseTerrainErrorP95 <= 0.25`;
- `zFightingRisk <= 0.01`.

Current blocking overview / inspect review metrics:

- `hiking-terrain`, `old-street`, and `landmark-pilot` must each attach fixed-preset overview and inspect ROI screenshots;
- overview capture must enter `camera.mode === "overview"`;
- inspect capture must enter `camera.mode === "inspect"`;
- inspect capture must keep `camera.clearance` inside the terrain-relative profile bounds;
- both captures must keep the route layer visible and route pixels readable at the fixture threshold;
- `hiking-terrain` must retain attributable landcover, vegetation budget evidence, and terrain height variance at the mountain threshold;
- `old-street` must retain at least four contextual building entries;
- `landmark-pilot` must retain at least one attributable landmark record;
- `landmark-pilot` must report `qa.provenance.landmarkAllowlisted >= 1`;
- all captures must keep `zFightingRisk <= 0.01`.

Current blocking `river-bridge` timeline stage metrics:

- `foundation-rise` must remain in `slab-rise` with partial `foundationProgress`, no route draw, and no building massing;
- `carved-geography` must remain in `water-carve`, expose water and road layers, and keep carved-channel depth above the fixture threshold;
- `route-highlight` must remain in `route-highlight`, expose route layer diagnostics, and have route draw progress `>= 0.95`;
- `building-massing` must remain in `building-massing`, expose partial building massing progress, and keep dissolve progress at `0`;
- `building-dissolve` must remain in `building-dissolve`, expose completed massing plus active dissolve progress;
- `route-focus` must finish emergence, enter `camera.mode === "route-focus"`, and retain `routeYellowPixelRatio >= 0.00008`.

Current blocking scenario precision metrics:

- `old-street` must choose `terrainMode === "micro-street"` and keep low city elevation range within the fixture threshold;
- `scenic-park` must choose `terrainMode === "scenic-park"`, retain attributable landcover and water, and show medium terrain relief;
- `hiking-terrain` must choose `terrainMode === "hiking"` and show high mountain elevation range;
- all three scenario reviews must keep route layer visible, route pixels readable at the scene-specific threshold, and `zFightingRisk <= 0.01`.
