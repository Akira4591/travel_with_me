# Travel With Me Roadmap

Last updated: 2026-06-23

This file is the active backlog only. Product direction and data boundaries are owned by `docs/product-architecture-blueprint.md`. The latest 3D technical route is owned by `docs/3d-deep-research-integration.md` and executed through `docs/3d-top-down-execution-roadmap.md`.

## Current Stage

The project is now in:

```text
S1 desktop private-test baseline closed
  -> S2 differentiation validation closed at code level
  -> 3D structural gates closed
  -> VQ0 local visual-quality reset implemented at code level; final manual visual acceptance pending
```

Desktop Web is the only active product surface. Mobile Web remains a compatibility guard only. Native Android is deferred as a separate Kotlin product after the desktop Web value and data model stabilize.

## Latest Verification Baseline

Latest verified baseline from 2026-06-23. Detailed gate accounting is maintained in `docs/quality-gate-status.md`.

| Gate                              | Result                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm.cmd run check`               | Passed                                                                                                                               |
| `npm.cmd test`                    | Passed: 34 files, 170 tests                                                                                                          |
| `npm.cmd run check:encoding`      | Passed: 341 visible source/doc/test files scanned                                                                                    |
| Full visual baseline suite        | Passed: 24 local ROI fixture captures/interactions with QA JSON and screenshots in 12.4m                                             |
| `npm.cmd run check:architecture`  | Passed: 37 render files scanned                                                                                                      |
| `npm.cmd run check:provenance`    | Passed: 42 scene fixture files scanned                                                                                               |
| `npm.cmd run check:landmarks`     | Passed: 1 landmark record scanned                                                                                                    |
| `npm.cmd run check:ledger`        | Passed: active backlog and quality-gate ledger counts are internally consistent                                                      |
| Targeted desktop 3D smoke         | Passed: 16 Chromium desktop tests, 14 mobile/desktop-scope skips                                                                     |
| `npm.cmd run gate50:review`       | Passed: full automated Gate 50 package with static gates, unit tests, encoding, desktop smoke, and 24 Chromium 3D visual baselines   |
| `npm.cmd run gate50:live-review`  | Passed: generated six local review screenshots plus per-view QA JSON for hiking, old-street, and landmark review scenes              |
| Tracked-source secret scan        | Passed: no known real AMap/DeepSeek key patterns found                                                                               |
| In-app browser 2D/3D visual check | Passed: 2D marker selection enters bounded 3D; QA passed; route gray outline is 0; initial/loading/idle view uses one overview orbit |
| Manual 3D visual review           | Pending after VQ0 implementation; previous screenshot scored 1/10 before bounded work-area and route-layer repair                    |

Quality gate count from `docs/quality-gate-status.md`:

| Status       | Count |
| ------------ | ----: |
| Complete     |    49 |
| Partial      |     1 |
| Not complete |     0 |
| Total        |    50 |

VQ0 local visual reset implemented in code:

- The 3D button now enters `selecting-3d-center` and shows a red pin before generation.
- 3D builds from a fixed square `workArea` centered on the selected 2D point instead of full route/all-point bounds.
- Default work area is 800m, with 600m/1000m/2000m profile sizing and a V1 hard cap of 2000m.
- The selected square is raised as the primary bone-white work slab and outside context is dimmed.
- Route guidance no longer creates gray `bed`/`edge` route meshes; yellow guidance is the only primary route layer.
- QA now exposes `routeGrayOutlinePixelRatio`, `workAreaRaisedPixelRatio`, `outsideDimmedPixelRatio`, and work-area dataset fields.
- Overview camera starts on the same scene-profile orbit used by idle auto-rotate before terrain data loads, during entry, and after steady state; x/z remain unlocked for drag and WASD movement.
- The unloaded initial 3D camera now uses the same 800m default work-area scale as the bounded 3D scene, avoiding a separate pre-load angle before idle orbit starts.
- 3D route guidance is narrowed back to a 2D-style yellow navigation line instead of a thick road-surface band.
- 3D route guidance now uses a flat unlit yellow material so route readability does not collapse under shallow camera/terrain lighting.
- Muted 3D road ribbons remain available as terrain context but are no longer strong enough to read as a gray route outline.
- Building LOD keeps low-poly massing opaque while near-camera detail dissolves in, so close views change face/detail level without turning buildings into transparent slabs.
- Vegetation frustum telemetry now uses landcover chunk bounds so licensed vegetation areas remain measurable during camera stress.
- Empty 2D selections that fall outside available trip/route data now snap to the nearest POI/location
  anchor before 3D generation, preventing a technically valid but visually blank work area.
- The off-route anchoring path is now covered by desktop E2E smoke so blank-slab regressions fail
  before manual visual review.
- Micro-street and citywalk overview camera presets are closer/lower so the initial and idle-orbit view
  remains continuous while giving route, roads, and nearby context more first-screen presence.
- The visible-text encoding gate now catches broader GBK/UTF-8 mojibake fragments; core utility and 3D
  toggle strings have been cleaned and covered by tests.

Remaining VQ0 acceptance item:

- Run `npm.cmd run gate50:review`, complete `docs/qa/gate50-manual-review.md` against the new bounded diorama output, and if accepted move gate 50 from partial to complete.
  The latest full automated Gate 50 package passed and produced validated local evidence at
  `output/gate50/latest-review.json` plus `output/gate50/latest-manual-review.md`, but final
  product-quality acceptance is still manual.
  Capture the local screenshot review inputs with `npm.cmd run gate50:live-review`.
  The latest run generated `output/gate50/live-review/manifest.md` with six passing overview/inspect
  capture rows for hiking, old-street, and landmark-pilot scenes. Route-yellow ratios ranged from
  `0.0011` in the hiking overview to `0.02693` in the old-street inspect view.
  Engineering pre-review now shows route outline and transparent-building defects reduced, but the
  live composition remains intentionally pending manual product-quality acceptance.
  For a stronger pre-review evidence packet, run
  `npm.cmd run gate50:review -- --include-stability --stability-runs=5`.
  Use `--evidence-json=output/gate50/evidence.json` when a machine-readable local evidence record is
  needed for the review meeting, then validate it with
  `npm.cmd run check:gate50-evidence -- output/gate50/evidence.json`.
  Generate the local review packet with
  `npm.cmd run gate50:packet -- output/gate50/evidence.json output/gate50/manual-review-packet.md`.

Known remaining non-blocking follow-ups after VQ0:

- Promote maintained golden screenshot assertions after the current stage screenshot capture gate is stable across repeated local runs.
  **Prepared:** `npm.cmd run test:e2e:visual:stability -- --runs=5` is now the repeatability command
  for collecting five-run local evidence before turning on committed golden assertions.
- Promote city/scenic/hiking precision gates from fixture coverage to repeated-run baseline once thresholds stabilize.
  **Prepared:** `npm.cmd run test:e2e:visual:stability -- --runs=5 --preset=precision` now scopes
  repeated scenario checks without hand-writing a grep.
- Keep real landmark model rendering disabled until an actual licensed model package passes the release gate.

Next-stage deep-research decision:

```text
VQ0 local visual-quality reset
  -> route layer repair
  -> 2D red-pin selection
  -> bounded square work area
  -> outside-context dimming
  -> bounded-scene visual gates
  -> resume visual proof / P2 / P3 / inspect profile work
```

Do not start P4 DEM tiles, P5 landmark restoration, or commercial 3D provider routing until VQ0, the first visual baseline, and P2 visual correctness gates are stable.

## Immediate Next Batch: VQ0 Local Visual Reset

Goal: make 3D visual quality acceptable and regression-testable before adding more visual
complexity. The immediate batch is now VQ0; the previous Alpha visual proof infrastructure remains
the testing foundation.

Tasks:

0. Complete VQ0 local visual reset. **Code-level implemented; manual visual acceptance pending.**
   - Modules: 2D/3D entry controller, route guidance renderer, scene envelope/work-area builder,
     outside context renderer, visual QA.
   - Acceptance: user selects a 2D point with red pin, 3D builds only the bounded square, outside
     context is dimmed, the first selected-plane lift is uniform-height, gray route outline is gone,
     yellow route remains readable, `npm.cmd run gate50:review` passes, and manual visual review
     accepts the new bounded composition.
   - Rollback: keep 3D disabled with a reason when no work-area center is selected.

1. Build ROI visual baseline harness for `river-bridge`, `micro-street`, and `hiking-terrain`. **Implemented.**
   - Modules: tests, QA docs, Playwright helpers.
   - Acceptance: `npm.cmd run test:e2e:visual` passes in Chromium without live provider calls.
   - Repeatability evidence: `npm.cmd run test:e2e:visual:stability -- --runs=5` must pass before
     screenshot assertions are promoted from capture evidence to maintained golden baselines. Use
     `--preset=core`, `--preset=precision`, `--preset=overview-inspect`,
     `--preset=camera-stress`, or `--preset=timeline` for scoped repeatability evidence.
   - Rollback: keep capture-only screenshots and disable blocking assertions until stable.

2. Formalize `window.__threeDebug__.qa` v1. **Implemented.**
   - Modules: renderer QA/debug contract, docs.
   - Acceptance: each visual capture can export QA JSON with geometry, budget, provenance, and layer fields.
   - Rollback: keep new fields additive and non-blocking.

3. Add `river-bridge` structured P2 geometry gates. **Expanded in the Beta first pass.**
   - Modules: scene quality gates, terrain/water/bridge metrics, tests.
   - Acceptance: emit and assert `waterCoverageRatio`, `bridgeContinuity`, `terrainCarvingDepthP50`, `routeVisiblePixelRatio`, `zFightingRisk`, and `bridgePierCount`.
   - Rollback: downgrade unstable thresholds to warnings while preserving telemetry.

4. Attach failure evidence to Playwright reports. **Implemented for visual ROI captures.**
   - Modules: E2E/visual test helpers.
   - Acceptance: visual runs attach actual screenshot, fixture JSON, camera preset JSON, and QA JSON; Playwright trace is available through the configured retry/report workflow.
   - Rollback: attach only on failure to control artifact size.

5. Keep live-provider tests out of default visual CI. **Implemented.**
   - Modules: test config and docs.
   - Acceptance: local and CI visual gates are deterministic and use only fixture data.
   - Rollback: keep live-provider smoke as explicit opt-in only.

Current limitation: landmark restoration is now release-gated by allowlist, integrity, LOD, optimization, and budget metadata. Remote model loading remains disabled until a real licensed model package passes that gate.

Next Beta work:

- Calibrate water coverage and bridge continuity against additional river/bridge fixture shapes.
  **Started:** added `wide-river-bridges` fixture coverage for polygon waterways, side canal
  geometry, and multiple bridge decks; water and bridge thresholds are fixture-owned.
- Calibrate the new `routeYellowPixelRatio` ROI metric beyond the initial `>= 0.00008` gate.
  **Started:** every visual fixture now owns an explicit `route.minYellowPixelRatio`; tests fail when
  this threshold is missing instead of falling back to a global default.
- Extend the new `qa.lod` building near/far and stepped no-pop gates from `micro-street` to old-street and landmark-pilot after the current overview/inspect review gates are stable for five local runs.
  **Implemented:** near/far `qa.lod` response and stepped no-pop dissolve gates now cover
  `micro-street`, `old-street`, and `landmark-pilot`.
- Extend vegetation budget work from per-area density caps to chunking/frustum-culling performance telemetry.
  **Started:** vegetation QA now emits chunk count, visible chunk count, and culled chunk count;
  hiking visual gates assert the telemetry is internally consistent.

## P0: 3D Correctness Floor

Goal: 3D must not blank, lie, desync from 2D, or violate the required generation sequence.

Tasks:

- Add `output/`, `pet-runs/`, and runtime visual artifacts to `.prettierignore` and `.gitignore`.
- Pin the 2D/3D toggle to the bottom-right map control area.
- Remove the 60s idle auto-exit. User interaction may pause/resume orbit, but cannot switch modes.
- Keep the 3D button visible at all zoom levels; low precision must produce a disabled reason or degraded 3D, not a hidden entry.
- Clean visible UI mojibake and prevent newly added docs from reintroducing encoding ambiguity.
- Preserve persisted `event.routeToNext.geometry` through every 3D render path.
- Expose and assert route hash, first point, last point, point count and length.
- Render real routes as continuous industrial safety-yellow guidance.
- Render estimated fallback routes as dashed and clearly labelled.
- Ensure a nonblank foundation slab appears within 1.5 seconds.
- Keep first foundation lift as a uniform selected plane; terrain relief starts only after
  `terrain-refine`.
- Add structured `geoAssets` degraded-state results and BFF timeout/error classification.
- Keep 2D mode normal while 3D work is in progress.

QA:

- `npm.cmd run check`
- `npm.cmd test`
- targeted 2D E2E after P0
- targeted 3D E2E after P0
- screenshot check for overview and route focus
- Playwright assertion: button remains bottom-right in both 2D and 3D
- Playwright assertion: no auto-return from 3D after 60s
- Playwright assertion: `window.__threeDebug__.quality.degraded` is readable when upstream geo assets fail

## P1: Contracts, Timeline, and Module Boundaries

Goal: all 3D renderers consume stable contracts and a named generation timeline.

Tasks:

- Add `generation-timeline` with debug phase state:
  - `freeze-2d`
  - `derive-scene-envelope`
  - `slab-rise`
  - `terrain-refine`
  - `water-carve`
  - `road-emerge`
  - `bridge-resolve`
  - `route-highlight`
  - `building-massing`
  - `building-dissolve`
- Keep `SceneBuildContext` as the boundary for projection, terrain, route, geoAssets, provenance and quality flags.
- Keep `trip.geoAssets` as the provider-neutral environmental asset contract.
- Ensure renderer modules do not fetch provider data directly for already displayed state.
- Add debug metrics for mesh counts, terrain confidence, route diagnostics, generation phase and frame timing.
- Add `camera-controller.js` for overview, route-focus, inspect, drag-pause and orbit recovery.
- Add `terrain-foundation.js` so slab rise is independent from terrain refinement and layer reveal.
- Add Playwright screenshot gates for foundation, carved geography, route highlight, massing, dissolve and route focus. **Implemented for `river-bridge` timeline capture.**

QA:

- timeline phase values observable in `window.__threeDebug__`
- debug exposes `mode`, `phase`, `phaseProgress`, `quality`, `counts`, `camera`, and `provenance`
- screenshots and QA JSON prove stage order
- no direct provider renderer fetch for rendered trip state
- provenance gate blocks real-world asset rendering when source data is missing

## P2: Terrain, Water, Roads, and Bridges

Goal: the geographic skeleton must emerge from the raised foundation.

Tasks:

- Add `terrain-carving.js` as the single place that mutates height grids for water depression or crossing conflict handling.
- Split foundation surface from terrain relief.
- Add water channel depression before water surface rendering.
- Render water polygon when attributable polygon exists.
- Render centerline water ribbon only when width is provider-supplied.
- Render muted terrain-conforming road ribbons from licensed centerlines.
- Render bridge decks after roads and water.
- Default bridge rendering to deck-only; piers require explicit support data or an approved template with provenance.
- Add z-order rules for terrain, water, road, bridge, route bed, route outline, route stripe and markers.

QA:

- water data present -> water mesh present
- bridge data present -> bridge deck mesh present
- no support data -> bridge pier count remains 0
- no terrain-colored gap where attributable water exists
- no obvious z-fighting during 30s camera interaction; current `river-bridge` visual stress gate covers route readability and `zFightingRisk <= 0.01`
- accepted 4s generation sequence remains stable: 1s foundation, 1s terrain/water/roads, 1s building massing, 1s dissolve

## P3: Building Massing and Dissolve

Goal: buildings provide useful planning context without pretending to be survey-grade city replicas.

Tasks:

- Split `building-massing-renderer.js` from `building-dissolve-renderer.js`. **Implemented:** massing geometry and dissolve/LOD state now live in separate renderer modules; `map-3d.js` only orchestrates them.
- Raise deterministic rectangular massing clusters first. **Implemented:** generation timeline and `river-bridge` visual timeline gates prove building massing appears before dissolve.
- Use authoritative footprint extrusion when available. **Implemented:** direct renderer tests cover flat-terrain footprint extrusion.
- Keep fallback buildings neutral and deterministic. **Implemented:** direct renderer tests compare fallback massing outputs across rebuilds.
- Add continuous massing-to-outline dissolve with distance hysteresis. **Implemented:** dissolve alpha now uses a tested distance hysteresis band to reduce threshold flicker.
- Use `InstancedMesh` for repeated fallback massing where practical. **Implemented for fallback low-poly massing.**
- Align building bases to terrain samples and reject abnormal intersections. **Implemented:** direct renderer tests cover terrain-error rejection and synthetic fallback for rejected unlocated footprints.
- Mark fallback buildings as `syntheticMassing=true`; never present them as real exterior models.
  **Implemented:** rejected authoritative footprints degrade to neutral synthetic massing instead of disappearing.

QA:

- building base terrain error P95 <= 0.25m in seeded scenes and direct renderer footprint tests
- LOD transition has no visible pop or flicker; current `micro-street`, `old-street`, and `landmark-pilot` gates prove near/far detail response and stepped no-pop alpha continuity
- fallback buildings are deterministic across reloads and direct renderer rebuild tests
- route guidance remains readable above building context
- route guidance remains readable above old-street and landmark contextual layers

## P4: DEM Tile Precision

Goal: move from rough terrain to scene-appropriate terrain precision only after P0-P3 are stable.

Tasks:

- Add DEM tile decoder abstraction.
- Add worker-based DEM decode and mesh preparation.
- Add route-corridor local precision mode.
- Evaluate adaptive terrain mesh options such as Martini/RTIN.
- Add terrain seam handling and tile skirts.
- Add IndexedDB terrain grid/mesh cache.

Production direction:

- Prefer self-hosted Copernicus GLO-30/GLO-90 preprocessing.
- Treat Mapbox Terrain-DEM/RGB or Terrarium-compatible public tiles as prototype accelerators only.
- Record vertical datum, dataset version, source, licence and attribution.

## P5: Licensed Landmark Restoration

Goal: support a small number of legally sourced high-value landmarks.

Tasks:

- Build offline import for owner-provided GLB and municipal CityJSON/CityGML.
- Validate CRS, units, scale, footprint drift, texture size, material count and triangle count.
- Generate LOD2, LOD1 and placeholder outputs.
- Add renderer allowlist and integrity checks before loading any remote model.

Non-goals:

- no scraping proprietary map imagery
- no whole-city photorealism as default path
- no uncertain-licence landmark display

## P6: Commercial Readiness

Goal: prepare the product for real launch after the desktop value is proven.

Tasks:

- Accounts and cloud persistence.
- Quotas and cost controls for AI, AMap and future asset providers.
- Operational monitoring and release health checks.
- Privacy policy, data export and deletion.
- Provider routing by region and asset layer.
- Build-time attribution and licence gates.

## Documentation Rules

- Product direction: update `docs/product-architecture-blueprint.md`.
- Architecture decision: update `ARCHITECTURE.md`.
- Active backlog: update this file.
- BFF/API contract: update `docs/api.md`.
- 3D technical route: update `docs/3d-deep-research-integration.md`.
- 3D execution order: update `docs/3d-top-down-execution-roadmap.md`.
- 3D process alignment: update `docs/3d-generation-process-alignment.md`.
- Asset/provenance pipeline: update `docs/3d-assets-landcover-and-landmarks.md`.
- Commercial strategy: update `commercialization-solutions.md`.
