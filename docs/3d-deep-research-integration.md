# 3D Deep Research Integration

## 1. Decision Summary

The deep research result confirms the current strategic direction:

```text
AMap 2D and Web Service facts
  -> BFF provider-neutral data and cache
  -> persisted trip locations / route geometry / geoAssets / provenance
  -> Three.js 3D planning diorama
```

3D must not consume AMap JS API internal renderer objects. AMap remains the China-region 2D, POI, geocode, and routing source. Three.js remains the only 3D renderer. The BFF owns provider routing, cache, normalization, provenance, attribution, and future supplier replacement.

Do not move the project to Cesium, Mapbox, Babylon, or OSMBuildings as the primary 3D stack. Those products can be references or special-case providers, but the product asset is the provider-neutral data contract, not any one renderer or tiles service.

## 1.1 Map Module Repair Report Integration

The latest next-stage iteration research narrows the immediate implementation order to deterministic proof before new visual complexity:

```text
Sprint Alpha: deterministic visual proof infrastructure
  ROI screenshots, fixed camera presets, screenshot normalization, QA schema v1, failure attachments

Sprint Beta: P2 water / road / bridge visual correctness
  waterCoverageRatio, bridgeContinuity, route clearance, z-fighting risk, deck-first bridge proof

Sprint Gamma: P3 building massing / dissolve modularization
  split massing and dissolve renderers, synthetic massing metadata, no-pop LOD gates

Sprint Delta: inspect camera and scene precision profiles
  overview / route-focus / inspect state machine, profile budgets, graceful degradation
```

P0/P1/P2 code-level correctness is already far enough that the next risk is silent visual regression across scenes. Do not expand into P4 DEM tiles, P5 landmark restoration, or commercial 3D providers before the Alpha/Beta visual gates are stable.

The current codebase now enforces the first architecture boundary: `js/render/**` must not import provider/API or server modules directly. Elevation loading is injected by the application orchestration layer and checked by `npm run check:architecture`.

The current QA observation contract is also split into three channels:

- `window.__threeDebug__` for full Playwright/debug payloads.
- `#map-3d.dataset.qa*` for clipped browser/container assertions.
- `three:qa` custom events for phase and gate transitions.

Do not add new 3D effects until the next gate work is done through scenario fixtures and visual baselines. New effect work without a fixture, ROI capture, or quality assertion is treated as regression risk.

## 1.2 Bounded Work Area Decision

The latest visual-quality research supersedes any plan that derives the 3D scene extent from the
full route bounding box or all itinerary points. The project must stop treating 3D as an
unbounded map mode. The new product contract is:

```text
2D map
  -> user clicks the 3D button
  -> 2D enters selecting-3d-center state
  -> red pin follows the cursor with a square range preview
  -> user clicks a 2D map position
  -> Three.js builds a fixed square 3D work area centered on that position
  -> content outside the work area is dim context, not full-detail 3D
```

This is a quality control decision, not a capability downgrade. The current renderer can produce
nonblank scenes and pass structural tests, but user screenshots show that large unbounded scenes
collapse into a low-detail white board with unstable route layering. The fix is to give the 3D
renderer a finite spatial contract before adding more building, vegetation, DEM, or landmark
detail.

First-release scope policy:

| Scene profile                  | Default square side | Allowed range | Rule                                                                           |
| ------------------------------ | ------------------: | ------------: | ------------------------------------------------------------------------------ |
| Urban old street / small shops |                600m |      500-700m | Prioritize storefront context, route turns, and dense building massing.        |
| Scenic / park / city walk      |               1000m |     800-1200m | Preserve water, paths, light relief, and POI context without becoming a board. |
| Hiking / mountain terrain      |               2000m |    1500-2000m | Show slope and route elevation while staying inside the V1 geometry budget.    |
| Unknown profile                |                800m |          800m | Default to a conservative, readable local diorama.                             |
| V1 hard cap                    |               2000m |       no more | Above this, ask the user to select a smaller area. Do not silently degrade.    |

The implementation must make `spanMeters` an explicit business parameter. It must not be inferred
from route length or all trip points. Routes, roads, water, bridges, buildings, and vegetation are
clipped to the square. If a route leaves the square, render only the in-work-area segment and show a
low-key boundary direction cue instead of extending the scene.

Immediate visual correction decisions:

- Remove the gray 3D route outline. It currently competes with and visually swallows the yellow
  guidance line.
- Keep the itinerary route as the only primary 3D guidance layer, using the same industrial safety
  yellow identity as 2D.
- Treat road bed and road context as muted geographic layers, not route-outline layers.
- Apply strict route render ordering and z-fighting controls: route geometry above terrain/roads,
  `depthWrite=false`, stable `renderOrder`, controlled `polygonOffset`, higher route sampling, and
  no unnecessary transparent `DoubleSide` route passes.
- Add visual QA that can fail the build when a gray outline, route flicker, unbounded span, or
  missing work-area dimming returns.

## 2. Fixed Product Sequence

The user-visible 2D-to-3D generation sequence is fixed:

```text
idle-2d
  -> freeze-2d
  -> derive-scene-envelope
  -> slab-rise
  -> terrain-refine
  -> water-carve
  -> road-emerge
  -> bridge-resolve
  -> route-highlight
  -> building-massing
  -> building-dissolve
  -> camera-overview
  -> camera-route-focus / inspect
```

This is not only an animation sequence. It is the required engineering state machine for loading, fallback, QA, screenshot capture, and bug diagnosis.

Recommended visual timing:

| Stage                         | Target window |
| ----------------------------- | ------------: |
| Freeze 2D                     |       0-150ms |
| Slab rise                     |     150-450ms |
| Terrain refine                |     450-700ms |
| Water carve and water reveal  |    700-1100ms |
| Road emerge                   |    850-1300ms |
| Bridge resolve                |   1000-1500ms |
| Route highlight draw          |   1100-1700ms |
| Building massing rise         |   1400-2200ms |
| Building dissolve             |   1900-2800ms |
| Camera settle and interaction |   2200-3000ms |

The core visual principle is:

```text
geometry is factual
shader style is restrained
timeline explains the scene
```

## 3. Scene Envelope and Foundation Rules

The slab is derived from the selected bounded work area, not from the entire trip, route, or all
itinerary points:

```text
workArea.center = selectedLngLat
workArea.spanMeters = profileSpanMeters
workArea.hardCapMeters = 2000
sceneBBox = squareBounds(workArea.center, workArea.spanMeters)
slabWidth = workArea.spanMeters
slabDepth = workArea.spanMeters
slabHeight = clamp(max(localRelief * 0.18, 8m), 8m, 120m)
slabTopY = uniformFoundationHeight
```

Route/POI/geoAsset bounds are now used for filtering, clipping, labels, and warnings. They no
longer decide the 3D scene size.

The `slab-rise` phase must raise the selected square as a uniform plane. Every top-surface vertex
uses the same `slabTopY`; DEM relief, street-level micro variation, water depression, road
flattening, and bridge deck offsets are forbidden during this phase. Elevation only becomes visible
after `terrain-refine`, then water, roads, bridges, route, and buildings resolve in their own named
phases. This keeps the first user-visible action readable: the local 3D work area rises as one
coherent piece before it melts into terrain and semantic layers.

Flat terrain is still derived from elevation facts when available. It must not become random decorative noise. For flat cities, preserve weak real variation:

```text
surfaceHeight = base + clamp(realHeight - meanHeight, -1.2m, 1.2m)
```

For scene spans under roughly 30km, use a local projected meter coordinate system around the trip center. A full globe pipeline is unnecessary for the current desktop Web scope.

## 4. Data Source Strategy

Production data priority:

| Layer                                   | Preferred path                                                  | Notes                                                             |
| --------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| 2D map / POI / geocode / route planning | AMap JS API + AMap Web Service                                  | China-region source of truth for route and POI workflows.         |
| Route geometry                          | Persisted AMap Web Service polyline                             | 3D never reroutes. It renders `event.routeToNext.geometry`.       |
| DEM                                     | Self-hosted Copernicus GLO-30/GLO-90                            | Production target. Record dataset version and vertical datum.     |
| DEM prototype                           | Mapbox Terrain-DEM/RGB or Terrarium-compatible tiles            | Prototype only if it accelerates validation. Respect attribution. |
| Roads / paths                           | Overture Transportation                                         | Future commercial path through BFF normalizers.                   |
| Water                                   | Overture Base Water                                             | Water must carve terrain before water mesh reveal.                |
| Bridges                                 | Overture transportation/infrastructure relation where available | Start deck-first. Do not invent piers or complex structures.      |
| Building footprints                     | Microsoft Global ML Building Footprints or licensed local data  | Treat ML footprints as massing facts, not real exterior models.   |
| Priority city buildings                 | CityGML / CityJSON / local open data                            | Use only after licence review.                                    |
| Landcover / vegetation                  | ESA WorldCover 10m or licensed source                           | Vegetation templates require real landcover provenance.           |
| Landmarks                               | Owner-provided GLB or officially licensed models                | No scraping, no proprietary map-scene extraction.                 |

Avoid using public Overpass, OSMBuildings, or uncertain public endpoints as production-critical runtime dependencies. They are acceptable only as bounded prototype or local ingestion aids with clear attribution and replacement plans.

## 5. Layer Implementation Rules

### Terrain

Terrain uses indexed `BufferGeometry`. The renderer builds a foundation surface first, then refines vertices into local relief. Chunking becomes necessary when the scene exceeds the first desktop budget or when DEM tiles are introduced.

### Water

Water is not a blue strip pasted onto the terrain. The order is:

```text
terrain foundation
  -> water depression mask / channel carve
  -> water surface mesh
```

Use polygon water when an attributable polygon exists. Use a centerline ribbon only when the provider supplies or permits a width.

### Roads and Route

Roads and itinerary route are different layers:

```text
licensed road = muted neutral terrain-conforming ribbon
itinerary route = persisted 2D route polyline, industrial safety yellow
```

The 3D route must preserve route hash, first point, last point, and approximate length consistency with the persisted route. A real route is continuous. Estimated fallback remains dashed.

### Bridges

Bridge rendering starts as deck-first geometry across water or terrain gaps. Piers, railings, and detailed structure require explicit data or approved templates. Weak bridge data must not produce fake structural complexity.

### Buildings

Buildings have two layers:

```text
fact layer:
  footprint / height / levels / usage class / provenance

visual layer:
  massing template / extrusion / dissolve detail / LOD state
```

The required reveal is:

```text
simple rectangular massing clusters
  -> footprint extrusion when available
  -> continuous detail dissolve in near view
```

Use two geometry states instead of abrupt replacement:

```text
detailAlpha = 1 - smoothstep(nearDistance, farDistance, cameraDistance)
massingOpacity = 1 - detailAlpha * 0.72
detailOpacity = detailAlpha
detailScaleY = 0.74 + detailAlpha * 0.26
detailOffsetY = (1 - detailAlpha) * -1.2
```

## 6. Camera and Interaction Rules

Camera states:

```text
overview
route-focus
inspect
interact
idle
```

Auto-orbit is allowed only in overview or route-focus, and only at low speed. Inspect mode should not auto-rotate because the user is reading local terrain/building relationships. User drag pauses orbit immediately and resumes only after a delay when returning to overview-like states. The pre-load 3D camera, entry animation camera, and idle overview orbit must share one overview pose model so opening 3D does not show a temporary angle and then snap into auto-orbit.

## 7. Performance Budgets

Desktop Web first-release targets:

| Budget             |    Target |
| ------------------ | --------: |
| Nonblank slab      |   <= 1.5s |
| Main 3D details    |   <= 3.0s |
| Long task ideal    |    < 50ms |
| Long task maximum  |   < 100ms |
| Draw calls ideal   |     < 250 |
| Draw calls maximum |     < 400 |
| Frame rate         | 45-60 FPS |

Implementation implications:

- Decode DEM chunks in a worker once tile data is introduced.
- Use `InstancedMesh` for fallback building massing and vegetation templates.
- Keep route and semantic labels readable before adding expensive terrain or building detail.
- Reduce distant terrain/building precision before reducing route geometry quality.

## 8. Required QA Gates

Automated gates:

- 3D canvas nonblank within 1.5s.
- 2D and 3D route hash, first point, and last point match.
- Route length error stays within 1%.
- Route clearance P95 is within 0.3m above the terrain/road surface.
- Terrain variance is nonzero unless explicitly flat-fallback.
- Water data present -> water mesh present.
- Bridge data present -> bridge deck mesh present.
- No terrain-colored blank gap where attributable water exists.
- Building base terrain error P95 is <= 0.25m in seeded scenes.
- Console error count is zero except approved third-party noise.
- Visible real assets have source, licence, attribution, and updatedAt.

Visual gates:

- Bottom-right 3D button is visible and aligned with the existing style.
- Clicking the 3D button from 2D enters a red-pin selection state before building 3D.
- The selected work area is a bounded square with `spanMeters <= 2000`.
- The selected square is visually raised and readable; outside context is dimmed or simplified.
- The transition starts from foundation rise, not instant final-layer reveal.
- Water channels read as carved/depressed when data exists.
- Roads are muted; route guidance is industrial safety yellow, not gold.
- The 3D route has no gray outline or thick gray bed competing with the yellow guidance line.
- The route remains stable during camera movement with no visible z-fighting or line jitter.
- Close view shows building detail dissolve without popping or hiding route guidance.
- Overview ignores unnecessary detail while keeping route, terrain, water, and bridge relationships legible.

## 9. Current Project Implications

The current project should not jump directly into commercial DEM, full Overture ingestion, or landmark restoration. The next development work should first close the local correctness and process gaps:

1. Keep `check:encoding` in the verification loop so visible UI and maintained docs do not regress into mojibake.
2. Keep the 3D toggle pinned to the bottom-right map control area.
3. Preserve persisted route geometry through all 3D visual paths.
4. Continue replacing ad hoc layer reveal with the named `generation-timeline`.
5. Keep foundation rise separate from terrain relief.
6. Keep explicit water carving before water surface rendering.
7. Keep road/bridge emergence represented as timeline phases.
8. Continue splitting building massing from building dissolve LOD.
9. Add Playwright screenshots for foundation, carved geography, building massing, building dissolve, and route focus.
10. Keep current Overpass/OSM context ingestion labelled as prototype context, not production commercial truth.
11. Replace full-route scene bounds with explicit 2D-selected bounded work areas.
12. Add a visible red-pin selection flow before 3D generation.
13. Remove gray route outline in 3D and keep road context separate from route guidance.
14. Treat user-reported 1/10 screenshots as a manual visual gate failure even when automated
    structure gates pass.

Latest code-level repair implications from the deep research report:

- The current direction is valid. The required change is modular refactoring and quality-gate
  repair, not a renderer rewrite.
- `npm run check` must be restored by excluding generated `output/` and `pet-runs/` artifacts
  from format and source tracking rules.
- The 3D toggle must remain in the bottom-right control area in both 2D and 3D.
- The 60s idle auto-exit is removed and covered by E2E. Idle handling belongs to camera orbit
  recovery, not mode switching.
- The 3D entry must remain visible at all zoom levels. Low precision should either enter a
  degraded overview or show a disabled reason.
- `/_geo-assets` must classify upstream failures and support timeout handling. The client must
  expose degraded-state results instead of silently returning `null`.
- Bridge rendering must become deck-first and pier-optional. No pier/support data means no pier
  mesh.
- Water rendering must move from surface-only rendering to height-field carving followed by a
  water surface mesh.
- Building work must split rectangular massing from dissolve/detail LOD.
- Security hardening must audit dynamic `innerHTML` sinks before commercial release.

## 10. Updated Implementation Order

```text
P0: engineering stability and interaction correctness
  quality gate, bottom-right toggle, no auto-exit, route identity, degraded geoAssets

P1: contracts, timeline and observability
  SceneBuildContext, geoAssets, provenance, generation-timeline, camera-controller, debug surface

P2: terrain and geographic skeleton
  slab rise, terrain refine, terrain-carving, water surfaces, roads, deck-first bridges, route highlight

P3: building massing and dissolve
  deterministic massing, footprint extrusion, syntheticMassing labels, continuous dissolve LOD, instancing

P4: DEM tile precision
  tile decoder, worker, chunk cache, local precision, terrain seams

P5: landmark restoration
  licensed model import, validation, LOD outputs, visual QA

P6: commercial provider and compliance layer
  provider routing, source manifest, attribution gate, operational monitoring
```

This order keeps the project commercially defensible: visible behavior becomes correct first, then data provenance becomes enforceable, then precision and landmark restoration can be added without rewiring the renderer.

## 11. Immediate Next-Stage Execution

The immediate execution layer is:

```text
Alpha visual proof infrastructure
  -> Beta P2 visual truth
  -> Gamma P3 building refinement
  -> Delta inspect camera and scene profiles
```

Alpha is mandatory before Beta. The first hard evidence set must include:

- ROI screenshots for `river-bridge`, `micro-street`, and `hiking-terrain`;
- fixed camera presets per capture point;
- a screenshot normalization stylesheet;
- `window.__threeDebug__.qa.version === 1`;
- failure attachments: actual screenshot, diff, fixture JSON, camera JSON, QA JSON, and trace.

Beta then promotes P2 visual metrics from existence checks to correctness checks:

- `waterCoverageRatio`;
- `bridgeContinuity`;
- `routeGroundClearanceP95`;
- `zFightingRisk`;
- `bridgePierCount === 0` when no pier/support provenance exists.

The latest visual-quality reset inserts a narrower blocking sequence before further P3/P4/P5
expansion:

```text
Local Visual Reset
  -> route de-gray and anti-jitter repair
  -> 2D red-pin selection state
  -> fixed square work area contract
  -> outside-context dimming and boundary treatment
  -> bounded-scene visual QA gates
```

This reset must complete before more terrain precision, building dissolve detail, vegetation, or
landmark work is treated as product-quality progress.
