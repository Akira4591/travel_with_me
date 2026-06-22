# Visual Baseline QA Plan

## Purpose

The next 3D iteration must prove visual quality through deterministic evidence, not manual memory. Visual baselines are the prerequisite for P2 visual fixes and P3 building refinement.

This plan is intentionally limited to desktop Chromium, deterministic local fixtures, ROI screenshots, and structured QA metrics. Live provider calls are not part of visual baseline tests.

## Sprint Order

| Sprint | Objective                                            | Output                                                                                   | Rollback                                                                                 |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Alpha  | Establish deterministic visual proof infrastructure  | ROI screenshot suite, frozen camera presets, QA schema v1, failure attachments           | Keep screenshot capture and QA JSON, disable blocking screenshot assertions until stable |
| Beta   | Close P2 water, road, bridge visual correctness      | Water carve, bridge continuity, route clearance, z-fighting metrics plus ROI baselines   | Downgrade unstable thresholds to warnings while preserving evidence                      |
| Gamma  | Modularize P3 building massing and dissolve          | Split building renderers, deterministic synthetic massing metadata, LOD transition gates | Keep massing-only renderer active and guard dissolve behind a feature flag               |
| Delta  | Complete inspect camera and scene precision profiles | Camera state machine, scene budgets, graceful degradation                                | Lock profile selection to fixture-declared profiles until thresholds are calibrated      |

Do not start P4 DEM tiles, P5 landmark restoration, or commercial 3D provider routing before Delta is stable.

## Fixture Scope

The first blocking visual baseline covers:

| Fixture          | Purpose                                       | First ROI captures                                        |
| ---------------- | --------------------------------------------- | --------------------------------------------------------- |
| `river-bridge`   | Water carve, bridge deck, route clearance     | `foundation-rise`, `water-road-bridge`, `route-highlight` |
| `micro-street`   | Dense street readability and building massing | `route-highlight`, `building-massing`, `inspect`          |
| `hiking-terrain` | Terrain relief and route height cue           | `foundation-rise`, `route-highlight`, `inspect`           |

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
- asserts `micro-street` inspect view readability with close-camera y clamp, route visibility, and building context;
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

Current blocking `micro-street` inspect metrics:

- `camera.mode === "inspect"`;
- `camera.clearance` stays between `camera.minClearance` and `camera.maxClearance`;
- route and building layers are visible together;
- `qa.lod.buildingDetailAlphaAverage > 0`;
- `routeYellowPixelRatio >= 0.00008`;
- `zFightingRisk <= 0.01`.
