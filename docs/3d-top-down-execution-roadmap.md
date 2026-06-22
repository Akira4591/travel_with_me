# 3D Top-Down Execution Roadmap

## 1. North star

3D is a desktop Web planning diorama. It must help users understand itinerary order, terrain pressure, waterways, bridges, and nearby spatial context. It is not a survey-grade city replica.

The deep research consolidation is captured in `docs/3d-deep-research-integration.md`. This roadmap follows that decision record: AMap remains the 2D/POI/geocode/route source, Three.js remains the 3D renderer, and the BFF plus `geoAssets` contract is the long-term data foundation.

The correct architecture is:

```text
2D map and BFF persisted facts
  -> locations / route geometry / geoAssets / provenance
  -> Three.js 3D planning diorama
```

The renderer is replaceable. The data contract is the product asset.

## 2. Non-negotiable boundaries

1. AMap remains the China-region source for POI, geocode, routing, and 2D map experience.
2. 3D must not depend on AMap JS API internal render objects.
3. 3D route geometry must come from persisted `event.routeToNext.geometry`.
4. Waterways, bridges, land cover, landmarks, and authoritative buildings require provenance before rendering as real-world assets.
5. Missing provider data fails closed: no invented river, bridge, vegetation, or real landmark.
6. Generic building massing is allowed only as neutral planning context.
7. The visual sequence is fixed and process-driven: 2D map freezes, the foundation rises,
   waterways carve downward, roads and bridges emerge, the route draws with the same 2D
   guidance identity, rectangular building massing rises, then building outlines dissolve
   into detail.
8. Desktop Web is the only active target. Mobile Web and Kotlin Android are deferred.
9. Route and road are separate layers: roads are muted geographic context; the itinerary route is the persisted 2D route rendered in industrial safety yellow.
10. Production 3D data must move through provider-neutral BFF normalizers, cache keys, provenance, and attribution gates before being rendered as real-world facts.

## 3. Product capability tree

```text
3D planning diorama
  1. Enter 3D reliably
     1.1 right-bottom 3D button
     1.2 2D camera freeze
     1.3 nonblank slab within 1.5s
     1.4 graceful exit to 2D

  2. Preserve geographic truth
     2.1 persisted places
     2.2 persisted AMap route polyline
     2.3 provider-neutral geoAssets
     2.4 provenance manifest
     2.5 no duplicate provider lookups for displayed state

  3. Build terrain foundation
     3.1 local projection
     3.2 terrain bounds and chunk bbox
     3.3 absolute-elevation foundation
     3.4 local relief height grid
     3.5 sampleHeight as the only vertical authority

  4. Carve and emerge geography
     4.1 water channels depress into the foundation
     4.2 water surfaces reveal inside carved channels
     4.3 road ribbons emerge from the surface
     4.4 bridge decks emerge after roads/water
     4.5 route guidance draws with the 2D industrial-yellow identity

  5. Raise and dissolve semantic context
     5.1 deterministic rectangular building massing clusters
     5.2 authoritative footprint extrusion when available
     5.3 massing-to-outline dissolve and continuous building LOD
     5.4 licensed landcover vegetation templates
     5.5 explicitly licensed landmark pipeline

  6. Control perception
     6.1 style tokens
     6.2 industrial safety-yellow route guidance
     6.3 camera auto-orbit
     6.4 route focus camera
     6.5 user drag pause and recovery

  7. Prove quality
     7.1 geometry health report
     7.2 screenshot QA
     7.3 performance budget
     7.4 console error gate
     7.5 attribution gate
```

## 4. Phase plan

### Current repair plan from the latest deep research report

The latest code scan and deep research report agree on the long-term repair order:

```text
P0 engineering stability and interaction correctness
  -> P1 generation timeline and observability
  -> P2 water / road / bridge geometry correctness
  -> P3 building massing / dissolve / LOD
  -> P4 DEM tile and local precision
  -> P5 landmark restoration
  -> P6 commercial provider and compliance
```

The immediate next-stage execution order is narrower:

```text
Alpha visual proof infrastructure
  -> Beta P2 water / road / bridge visual correctness
  -> Gamma P3 building massing / dissolve modularization
  -> Delta inspect camera and scene precision profiles
```

Alpha is a prerequisite for Beta. Visual correctness work without ROI screenshots, fixed camera presets, and `window.__threeDebug__.qa` evidence is not merge-ready.

This is a refactor of the existing Three.js path, not an engine replacement. Do not switch
the primary stack to Cesium, Mapbox, OSMBuildings, or another hosted 3D city product to solve
the current problems. The current problems are product-state, geometry, data-contract and
quality-gate problems.

The first executable batch must touch only the files that control the gate, entry interaction,
observability, degradation state and BFF stability:

```text
package.json
.prettierignore
.gitignore
css/components.css
js/render/toggle-3d.js
js/render/map-3d.js
js/render/scene-debug.js
js/api/geo-assets.js
server/index.js
tests/e2e/smoke.spec.js
```

P0 acceptance for this batch:

- `npm run check` passes even when generated `output/` and `pet-runs/` directories exist.
- The 2D/3D toggle remains visible in the bottom-right map control area in both 2D and 3D.
- 3D never auto-exits after an idle timeout. Only explicit user action exits 3D.
- Low-precision states do not hide the 3D entry. They either enter degraded 3D or disable
  the button with a clear reason.
- Geo asset upstream failure still allows a simplified nonblank 3D scene, with
  `window.__threeDebug__.quality.degraded === true`.
- Overpass/geo asset upstream failures are classified as timeout, rate-limited, empty,
  normalization failure, stale cache hit, or generic upstream failure.

### P0: Correctness Floor

Goal: 3D must not lie, blank, or desync from 2D.

Engineering tasks:

- Restore the source quality gate by excluding generated artifact directories from Prettier
  and Git tracking rules.
- Lock route geometry to persisted `event.routeToNext.geometry`.
- Add route hash, route length, first point, and last point diagnostics.
- Unify `sampleHeight(x, z)` as the only vertical authority for route, road, water, bridge, building, marker, and annotation placement.
- Ensure 3D entry displays a nonblank slab within 1.5s even when DEM or geoAssets fail.
- Keep the 3D button visible in the bottom-right map control area.
- Keep 60s no-auto-exit covered by E2E. User interaction may pause/resume camera orbit, but
  must not switch modes.
- Convert geo asset fetching from `null` fallback to a structured degraded-state result.
- Add BFF timeout and error classification for `/_geo-assets`.

Data tasks:

- Normalize legacy route geometry into the current route contract.
- Mark estimated two-point fallback routes as estimated and dashed.
- Preserve source, licence, attribution, and updatedAt on real geoAssets.

Visual tasks:

- Keep route guidance industrial safety yellow, not gold.
- Keep the current planning-diorama palette and low-poly terrain style.
- Use the fixed entry sequence: 2D freeze -> foundation raise -> water carving ->
  road/bridge emergence -> continuous route draw -> building massing -> building dissolve.

QA gates:

- `npm run check`, `npm test`, and the targeted 3D E2E pass.
- 2D and 3D route hash match.
- Route length differs from persisted/provider length by no more than 1-2%.
- Canvas is nonblank 1.5s after entry.
- Console error count is zero except whitelisted third-party noise.
- Route is not visibly floating or buried.
- Staying in 3D for longer than 60s does not return to 2D.
- The 3D button position remains within an 8px tolerance of the bottom-right control anchor.

Do not do:

- Do not introduce real landmark model loading.
- Do not add new online DEM dependency as a hard blocker.
- Do not render speculative rivers or bridges.

### P1: Data Contract and Layer Isolation

Goal: all renderers consume stable contracts, not provider-specific objects.

Engineering tasks:

- Split 3D rendering into terrain, route, roads, water, bridges, buildings, vegetation, labels, camera, LOD, and animation modules.
- Add a `generation-timeline` contract so reveal order is controlled by named phases instead of independent layer fade-ins.
- Add a `SceneBuildContext` object carrying projection, terrain model, geoAssets, route segments, provenance, quality flags, and budgets.
- Add a debug surface for route hash, terrain confidence, mesh counts, water count, bridge count, building count, and frame timings.
- Add provider provenance manifest generation for the displayed scene.
- Add `camera-controller.js` for overview, route-focus, inspect, drag-pause, and orbit recovery.
- Add `terrain-foundation.js` so slab rise is independent from terrain refinement and layer reveal.

Required debug contract:

```js
window.__threeDebug__ = {
  mode,
  phase,
  phaseProgress,
  quality: { degraded, reasons, missingLayers },
  counts: {
    terrainChunks,
    waterMeshes,
    roadMeshes,
    bridgeDecks,
    bridgePiers,
    routeSegments,
    buildingMassings,
    buildingDetailed,
    vegetationInstances
  },
  camera: {
    mode,
    autoRotate,
    userInteracting,
    distance,
    polarAngle
  },
  provenance
};
```

Data tasks:

- Promote `trip.geoAssets` as the only 3D environmental asset boundary.
- Add schema validation for buildings, roads, waterways, bridges, landcover, and landmarks.
- Treat OSM/Overpass ingestion as prototype context only until an offline/commercial provider pipeline exists.

Visual tasks:

- Keep real roads muted and itinerary guidance visually separate.
- Add explicit estimated/real route chip in 3D terrain insight.

QA gates:

- Renderer has no direct provider fetch for already displayed trip state.
- Missing provenance prevents real-world asset rendering.
- At least one seeded scene verifies water/bridge/building counts from geoAssets.

Do not do:

- Do not build commercial provider ingestion before renderer contracts are stable.

### P2: Foundation, Water Carving, Roads, and Bridges

Goal: establish the geographic skeleton.

Engineering tasks:

- Implement terrain chunks with bbox, bounding sphere, and frustum visibility.
- Split foundation surface from terrain relief so the first 3D stage can raise a clean base.
- Add water channel depression rules before rendering water surfaces.
- Add water polygon rendering with `earcut`; add centerline-plus-width ribbon fallback only when width is provider-supplied.
- Add road ribbons from licensed centerlines.
- Add bridge deck rendering from bridge centerlines and terrain clearance.
- Add z-offset rules for terrain, water, road, bridge, route bed, route outline, route stripe, and markers.
- Add `terrain-carving.js` as the only module allowed to mutate terrain height for water,
  road flattening, or crossing conflict resolution.
- Change bridge defaults to deck-only. Piers require explicit `pier` / `support` geometry or
  an approved template with provenance.
- Keep route guidance in `route-guidance-renderer.js` consuming `event.routeToNext.geometry`;
  3D must not reroute.

Data tasks:

- Keep current bounded OSM/Overpass ingestion as local prototype input.
- Prepare Overture-style normalizer interfaces for water, infrastructure, transportation, and buildings.
- Decide self-hosted DEM tile target format: Terrarium, PMTiles, COG, or float32-grid.

Visual tasks:

- Water must be visible but quiet: blue-gray, not decorative saturated blue.
- Bridges should read as crossing structures, but start deck-only if pier data is weak.
- Roads stay neutral; only itinerary route receives industrial yellow.

QA gates:

- Waterway data present -> water mesh present.
- Bridge data present -> deck mesh present and continuous.
- No pier/support data -> `window.__threeDebug__.counts.bridgePiers === 0`.
- No terrain-colored gap where attributable water exists.
- No obvious z-fighting in 30s camera interaction.
- Main details ready within 3s on desktop target hardware or fall back to lower budget.

Do not do:

- Do not generate decorative rivers, bridges, or canals without data.
- Do not prioritize fine buildings before terrain/water/bridge stability.

### P3: Building Massing and Dissolve LOD

Goal: make city/street close views useful without pretending to be a true city replica.

Engineering tasks:

- Add deterministic rectangular building massing as the first building stage.
- Build footprint extrusion for authoritative buildings.
- Keep the existing five-template fallback catalog per scenario.
- Replace repeated fallback meshes with `InstancedMesh` where practical.
- Add continuous massing-to-outline dissolve based on camera distance with hysteresis and fade.
- Align building base to terrain samples and reject abnormal intersections.
- Split the implementation into `building-massing-renderer.js` and
  `building-dissolve-renderer.js`.
- Prefer double-layer representation plus reveal/opacity/clip behavior over morph target
  topology conversion.

Data tasks:

- Normalize building `heightMeters`, `numFloors`, `minHeightMeters`, `roof`, `usageClass`, and provenance.
- Mark fallback buildings as generic massing.
- Keep synthetic buildings marked as `syntheticMassing=true`; never label fallback massing as a
  real building model.

Visual tasks:

- Far view: stable low-poly massing.
- Near view: more faces, inset facades, roof hints, entrance hints.
- Do not introduce high-saturation decorative colors.

QA gates:

- Building base terrain error P95 <= 0.25m in seeded scenes.
- LOD transition has no visible pop or flicker.
- Fallback buildings are deterministic across reloads.

Do not do:

- Do not claim fallback buildings are real.
- Do not load remote GLB landmarks in the renderer without allowlist, size, content-type, integrity, and licence validation.

### P4: DEM Tile and Local Precision

Goal: move from rough terrain to scene-appropriate terrain precision.

Engineering tasks:

- Add DEM tile decoder abstraction.
- Add worker-based decode and mesh preparation.
- Add route-corridor local precision mode.
- Evaluate `@mapbox/martini` for adaptive terrain meshes.
- Add terrain skirts and tile seam handling.
- Add IndexedDB terrain grid/mesh cache.

Data tasks:

- Prototype with Mapbox Terrain-RGB only if needed for fast validation.
- Production path should prefer self-hosted Copernicus GLO-30/GLO-90 preprocessing.
- Record vertical datum and dataset version in provenance.

Visual tasks:

- City scenes: low terrain emphasis, roads/POI/buildings dominate.
- Scenic/hiking scenes: stronger terrain relief, contour/slope/profiles become eligible.
- Region overview: low grid budget, route readability first.

QA gates:

- Terrain height variance is nonzero in flat scenes.
- Hiking/scenic scene exposes meaningful relative relief.
- Terrain tile seams are not visible at normal camera distance.
- Main-thread long tasks remain under budget.

Do not do:

- Do not make all views high precision.
- Do not let DEM precision reduce route readability.

### P5: Landmark Restoration Pipeline

Goal: support a small number of legally sourced high-value landmarks.

Engineering tasks:

- Build offline import for owner-provided GLB and municipal CityJSON/CityGML.
- Add model validation: CRS, units, origin, scale, footprint drift, texture size, material count, triangle count.
- Generate LOD2, LOD1, and placeholder outputs.
- Add renderer allowlist and integrity checks before any remote model load.

Data tasks:

- Require explicit licence, attribution, source URL, version, fetchedAt, and redistribution status.
- Reject uncertain licence or unknown source.

Visual tasks:

- Landmarks remain subordinate to itinerary readability.
- Overview uses LOD1 or placeholder.
- Near view may use LOD2 only when performance budget allows.

QA gates:

- Four fixed camera screenshots per landmark.
- Automatic rejection for missing textures, floating geometry, terrain intersection, or footprint drift > 2m.
- Licence manifest must pass before release.

Do not do:

- Do not scrape map imagery or proprietary 3D scenes.
- Do not pursue whole-city photorealism as the default path.

### P6: Commercial Provider and Compliance Layer

Goal: prepare the 3D stack for real launch and supplier replacement.

Engineering tasks:

- Add provider routing by region and layer.
- Add build-time attribution and licence gate.
- Add source manifest export for every rendered scene.
- Add operational monitoring for upstream errors, cache hit ratio, request volume, and render performance.

Data tasks:

- Run vendor due diligence for commercial DEM, building, and 3D tile providers only after P0-P4 are stable.
- For China launch, require legal review for public map display, internet map service rules, server placement, attribution, and approved sources.

QA gates:

- Page cannot ship with `licence: uncertain` for visible real assets.
- Attribution text is complete and visible where required.
- Provider outage falls back to cached or generic mode without false real-world claims.

Do not do:

- Do not bind the product roadmap to one commercial 3D provider before the data contract is proven.

## 5. Immediate Next Batch

The next executable batch is Alpha visual proof infrastructure, not P4/P5 expansion. P0 correctness
floor and core P1/P2 code paths were implemented before this batch:

- cached route geometry now stores recomputed diagnostics: hash, point count, length, first point,
  and last point;
- stale diagnostics are recomputed from normalized paths during route normalization;
- 3D exposes rendered route hash, endpoint key, route length, mesh counts, and first slab timing
  through `#map-3d` data attributes and `window.__threeDebug__`;
- `TerrainModel.sampleHeight()` aliases the existing `heightAt()` authority for future renderer
  module splits;
- 3D entry has a 1.2s elevation wait budget and falls back to a nonblank slab instead of blocking
  first render;
- Playwright verifies nonblank 3D, first slab time, 2D/3D route hash, endpoint key, route length,
  route focus, and canvas color diversity.

P1 started on 2026-06-21 with the context/debug layer:

- `SceneBuildContext` now normalizes `trip.geoAssets`, carries layer counts, quality flags,
  render budgets, and a provider provenance manifest for the displayed scene;
- `scene-debug` centralizes `window.__threeDebug__` snapshots instead of keeping debug assembly
  inside the 3D renderer;
- 3D render construction now reads environmental assets from `SceneBuildContext.geoAssets`;
- Playwright verifies the scene id, geo asset counts, and provenance source count in the browser.

P1/P2 renderer isolation is in place:

- `geo-asset-renderer` owns water, bridge, and road mesh construction from `trip.geoAssets`;
- `route-guidance-renderer` owns persisted route geometry, diagnostics, dashed estimated fallback,
  route highlight state, and route direction markers;
- `terrain-surface` centralizes terrain-following ribbon construction and foundation reveal metadata;
- `map-3d` is reduced toward scene orchestration: terrain, buildings, vegetation, markers,
  annotations, camera, and animation remain to be split in later P1 batches.

Deep research integration established:

- the official implementation route is now AMap 2D/Web Service + BFF data/cache +
  `geoAssets` + Three.js, not Cesium/Mapbox/Babylon/OSMBuildings as primary stack;
- the 3D generation state machine is fixed as `freeze-2d -> derive-scene-envelope ->
slab-rise -> terrain-refine -> water-carve -> road-emerge -> bridge-resolve ->
route-highlight -> building-massing -> building-dissolve`;
- production DEM should target self-hosted Copernicus GLO-30/GLO-90 or compatible
  Terrarium/PMTiles preprocessing, while Mapbox Terrain-DEM/RGB remains prototype-only;
- Overture-style transportation, base water, bridge/infrastructure, Microsoft building
  footprints, ESA WorldCover, CityGML/CityJSON, and owner-provided GLB enter only through
  provider-normalized asset packs with provenance;
- current Overpass/OSM context ingestion remains a bounded prototype context layer and must
  not be presented as the commercial production dependency.

The immediate task list is:

1. Build ROI visual baseline harness:
   - Chromium-only first;
   - deterministic local fixtures only;
   - no live provider calls;
   - first fixtures: `river-bridge`, `micro-street`, `hiking-terrain`.

2. Formalize `window.__threeDebug__.qa` v1:
   - geometry metrics;
   - budget metrics;
   - provenance metrics;
   - layer state metrics;
   - additive schema evolution only.

3. Add `river-bridge` P2 structured geometry gates:
   - `waterCoverageRatio`;
   - `bridgeContinuity`;
   - `routeGroundClearanceP95`;
   - `zFightingRisk`;
   - `bridgePierCount`.

4. Attach visual failure evidence:
   - actual screenshot;
   - diff screenshot;
   - fixture JSON;
   - camera preset JSON;
   - QA JSON;
   - Playwright trace.

5. Keep live provider paths separate from default visual gates:
   - default visual QA must be reproducible offline from fixtures;
   - live-provider remains explicit opt-in.

6. Update documentation:
   - `docs/2d-data-foundation.md` remains the truth-source contract;
   - `docs/3d-assets-landcover-and-landmarks.md` remains the asset/provenance contract;
   - `docs/3d-deep-research-integration.md` records the latest external research decision;
   - `docs/qa/visual-baseline.md` owns visual proof execution;
   - `docs/qa/debug-contract.md` owns `window.__threeDebug__.qa`.
   - this document drives execution order.

## 6. Complexity map

| Area                         | Complexity | Reason                                                    | Recommended timing |
| ---------------------------- | ---------- | --------------------------------------------------------- | ------------------ |
| Route hash and length checks | Low        | Existing route geometry already exists                    | Now                |
| Nonblank slab gate           | Low        | Existing 3D canvas and terrain fallback already exist     | Now                |
| Shared `sampleHeight()`      | Medium     | Requires renderer discipline but not new provider data    | Now                |
| Renderer module split        | Medium     | Refactor risk, but reduces future defects                 | Now                |
| Water polygon rendering      | Medium     | Needs triangulation and z-order rules                     | P2                 |
| Bridge deck rendering        | Medium     | Centerline-based deck is feasible; pier quality is harder | P2                 |
| Building LOD                 | Medium     | Geometry is manageable; visual popping must be tested     | P3                 |
| Self-hosted DEM tile         | High       | Requires preprocessing, hosting, cache, and provenance    | P4                 |
| Adaptive terrain RTIN        | High       | Requires mesh simplification and seam handling            | P4                 |
| Licensed landmark pipeline   | Very high  | Requires legal source, validation, optimization, and QA   | P5                 |
| Commercial provider routing  | Very high  | Requires product, legal, infra, and vendor work           | P6                 |

## 7. Current success definition

Before expanding into commercial DEM or real landmarks, the project should pass this definition:

- 3D opens fast and never blanks.
- 2D and 3D routes are provably the same route.
- The route is readable in industrial safety yellow at overview and close-up distances.
- Terrain foundation has real or fallback relief.
- Existing water and bridge data render without gaps.
- Missing water, bridge, vegetation, or landmark data produces no invented real-world object.
- Buildings are stable planning context and never presented as survey-grade truth.
- Playwright captures at least overview, route focus, and close-up screenshots for seeded scenes.
- Geometry health metrics are recorded for every 3D smoke test.
