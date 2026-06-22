# Travel With Me Roadmap

Last updated: 2026-06-22

This file is the active backlog only. Product direction and data boundaries are owned by `docs/product-architecture-blueprint.md`. The latest 3D technical route is owned by `docs/3d-deep-research-integration.md` and executed through `docs/3d-top-down-execution-roadmap.md`.

## Current Stage

The project is now in:

```text
S1 desktop private-test baseline closed
  -> S2 differentiation validation closed at code level
  -> 3D P0/P1 correctness convergence
```

Desktop Web is the only active product surface. Mobile Web remains a compatibility guard only. Native Android is deferred as a separate Kotlin product after the desktop Web value and data model stabilize.

## Latest Verification Baseline

Latest verified baseline from 2026-06-22. Detailed gate accounting is maintained in `docs/quality-gate-status.md`.

| Gate                                                                 | Result                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm.cmd run check`                                                  | Passed                                                                          |
| `npm.cmd test`                                                       | Passed: 27 files, 131 tests                                                     |
| `npm.cmd run check:encoding`                                         | Passed: 273 visible source/doc/test files scanned                               |
| `npm.cmd run check:architecture`                                     | Passed: 34 render files scanned                                                 |
| `npm.cmd run check:provenance`                                       | Passed: 18 scene fixture files scanned                                          |
| `npx.cmd playwright test tests/e2e/smoke.spec.js --project=chromium` | Passed: 12 desktop tests, 1 mobile-only test skipped in Chromium                |
| Tracked-source secret scan                                           | Passed: no known real AMap/DeepSeek key patterns found                          |
| In-app browser 2D/3D visual check                                    | Passed: 2D AMap provider loaded, 3D enters, canvas visible, DOM metrics present |

Quality gate count from `docs/quality-gate-status.md`:

| Status       | Count |
| ------------ | ----: |
| Complete     |    32 |
| Partial      |     6 |
| Not complete |     4 |
| Total        |    42 |

Known remaining gaps:

- Add maintained screenshot baselines for foundation, carved water, route highlight, building massing, building dissolve, route focus, and inspect.
- Add city/scenic/hiking/old-street/landmark scenario visual baselines.
- Add ROI screenshot gates and structured QA snapshots for the first three scene fixtures.

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
- Add Playwright screenshot gates for foundation, carved geography, route highlight, massing, dissolve and route focus.

QA:

- timeline phase values observable in `window.__threeDebug__`
- debug exposes `mode`, `phase`, `phaseProgress`, `quality`, `counts`, `camera`, and `provenance`
- screenshots prove stage order
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
- no obvious z-fighting during 30s camera interaction
- accepted 4s generation sequence remains stable: 1s foundation, 1s terrain/water/roads, 1s building massing, 1s dissolve

## P3: Building Massing and Dissolve

Goal: buildings provide useful planning context without pretending to be survey-grade city replicas.

Tasks:

- Split `building-massing-renderer.js` from `building-dissolve-renderer.js`.
- Raise deterministic rectangular massing clusters first.
- Use authoritative footprint extrusion when available.
- Keep fallback buildings neutral and deterministic.
- Add continuous massing-to-outline dissolve with distance hysteresis.
- Use `InstancedMesh` for repeated fallback massing where practical.
- Align building bases to terrain samples and reject abnormal intersections.
- Mark fallback buildings as `syntheticMassing=true`; never present them as real exterior models.

QA:

- building base terrain error P95 <= 0.25m in seeded scenes
- LOD transition has no visible pop or flicker
- fallback buildings are deterministic across reloads
- route guidance remains readable above building context

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
