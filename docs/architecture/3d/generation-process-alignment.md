# 3D Generation Process Alignment

> **辅助文件** | 权威开发文档: [DEVELOPMENT.md](../../../DEVELOPMENT.md)

## 1. Correct Design Intent

3D mode is not a layer switch that directly places terrain, water, roads, bridges, and buildings into a Three.js scene.

The latest deep research is integrated in `docs/architecture/3d/deep-research-integration.md`. Its most important conclusion for this file is that the generation process must be a state machine with QA hooks, not only a visual animation.

The correct product metaphor is:

```text
2D map
  -> red-pin local 3D work-area selection
  -> raised foundation slab
  -> carved / emerged geographic skeleton
  -> rectangular building massing clusters
  -> dissolved building outlines and local detail
```

The animation must explain where every object comes from. Objects should feel like they emerge from the 2D map surface, not like independent meshes pasted onto a board.

## 2. Required User-Visible Sequence

### Step 1: 2D / 3D Toggle

The user clicks the explicit `2D / 3D` toggle. The control must stay in the map control area, visually aligned with the existing UI style, and appear in the bottom-right map region.

The first click does not immediately build an unbounded 3D scene. It arms 3D selection in the 2D
map:

```text
idle-2d
  -> selecting-3d-center
  -> prebuilding-3d
  -> transitioning-3d
  -> steady-3d
```

In `selecting-3d-center`, the cursor carries a red pin and the 2D map shows a square preview of the
3D work area. A map click commits the center point from the 2D provider event coordinates. `Esc`,
right click, or clicking the 3D toggle again cancels selection and returns to normal 2D.

The control has five product states:

```text
enabled-2d
selecting-3d-center
loading-3d
enabled-3d
disabled-with-reason
```

The button must not disappear only because the zoom or precision budget is low. Low precision
either enters a degraded overview scene or disables the button with a clear reason. 3D mode must
not auto-exit after idle time. User dragging may pause camera orbit, and camera orbit may resume
after a delay, but mode switching is always explicit.

The 2D map is frozen as the geographic source of truth. 3D must consume persisted trip data:

- `trip.locations`
- `days[].events`
- `event.routeToNext.geometry`
- `trip.geoAssets`
- provider provenance

3D must not reinterpret AMap JS renderer internals.

The selected 3D work area is the scene envelope:

```text
centerLngLat = user selected 2D map point
spanMeters = profile default, normally 800m
hardCapMeters = 2000m
```

The full route and all trip points are no longer allowed to expand the scene. They can only
contribute clipped geometry, boundary direction cues, and warnings.

### Step 2: Raise the Selected Foundation Plane

The first visible 3D object is the selected work-area foundation. It must rise as one flat square
plane with consistent height across the entire selected area.

Rules:

- A visible nonblank slab must appear within 1.5 seconds.
- The slab top surface has one uniform `slabTopY` during `slab-rise`; all selected-area top vertices
  have the same height.
- DEM elevation, mountain relief, street micro-relief, water depression, road flattening, and bridge
  deck offsets are not applied during `slab-rise`.
- The slab has a stable foundation height even in flat cities.
- DEM failure produces a neutral low-relief fallback, but the scene must label the confidence honestly.
- The foundation should not look like a floating island with hard decorative borders.

Implementation direction:

```text
slabTopY = uniform compressed absolute elevation baseline
surfaceHeight = slabTopY + local relief
initial top vertices = 0
slab-rise top vertices = lerp(0, slabTopY, slabProgress)
terrain-refine top vertices = lerp(slabTopY, surfaceHeight, terrainProgress)
```

`slab-rise` proves the selected area. `terrain-refine` proves elevation. These stages must not be
merged.

### Step 3: Carve and Emerge the Geographic Skeleton

After the foundation rises, the ground starts to resolve into geographic structure.

Required behavior:

- Waterways carve downward into the foundation and reveal a quiet blue-gray water surface.
- Roads emerge as muted surface ribbons on top of the ground.
- Bridges emerge after roads/water and visibly cross waterways or terrain gaps.
- The itinerary route is projected from the 2D page route onto valid 3D surfaces. On flat surfaces,
  its color, width, dash state, and selected-segment styling match 2D exactly and stay flat; on
  raised or depressed surfaces, the route conforms tightly to the surface like a local texture
  replacement. If the selected work area contains no route segment, no route layer appears.

This means water is not just a blue mesh pasted above terrain. It needs a terrain depression or visual channel mask when the data supports it.

Layer order:

```text
foundation surface
  -> water channel depression
  -> water surface
  -> neutral roads
  -> bridges
  -> itinerary route 2D-style surface projection, only where a route segment exists
```

The route must not use a gray 3D outline, raised tube, or independent road-bed support layer. Road
bed belongs to the muted road/context layer, not to the route guidance layer. If contrast is later
needed, it must be derived from the same 2D selected-route style and remain subordinate to the
surface-projected route.

### Step 4: Raise Rectangular Building Clusters

Before detailed buildings appear, building areas first become simple rectangular massing clusters.

Rules:

- Generic building blocks are allowed only as neutral planning context.
- Authoritative footprints, when available, replace generic blocks.
- Missing real building data must not be described as real buildings.
- Heights must be deterministic, never random per load.

The massing stage should read as "blocks rising out of the map".

### Step 5: Dissolve Building Massing Into Outlines

At closer camera distances or after the massing stage completes, rectangular blocks dissolve into more specific building silhouettes.

Required behavior:

- Far view: simple low-poly blocks.
- Near view: more faces, inset facade planes, roof hints, entrance hints.
- Transition: continuous dissolve / fade / scale interpolation, not an abrupt swap.
- The route must remain visually dominant; building detail must not hide the guidance line.

Recommended interpolation:

```text
detailAlpha = 1 - smoothstep(nearDistance, farDistance, cameraDistance)
block.opacity = 1 - detailAlpha * 0.72
detail.opacity = detailAlpha
detail.scaleY = 0.74 + detailAlpha * 0.26
detail.offsetY = (1 - detailAlpha) * -1.2
```

## 3. Current Implementation Gap

The current implementation has the correct data boundary and can render terrain, roads, water, bridges, buildings, markers, and route guidance. However, it is still closer to "construct meshes and reveal them together" than to the intended generation process.

Current remaining gaps from visual QA and quality-gate review:

- The bounded work-area and red-pin selection contract is implemented, but the selected area can
  still read like a flat board instead of a product-quality local diorama.
- The route rendering contract must move from the current default yellow fixture signal to true 2D
  style projection: inherited color/width/dash/selected state, tight surface conformance, and no
  route layer when the selected work area contains no route segment.
- Route pixels can jitter or flicker when layered close to terrain/roads if the projection and
  z-order policy is not stable.
- Terrain can fall back to an overly flat board.
- Water currently reads as a surface ribbon more than a carved channel.
- Roads and bridges render, but lack a clear "emerge from ground" stage.
- Real route geometry can degrade to estimated dashed output if route contract is not preserved through the visual test path.
- Building LOD exists, but the "rectangular massing cluster -> dissolved outline" process is not yet explicit enough.
- Geo asset fetch failure currently needs a visible degraded-state/debug path instead of silent fallback.

Closed gates as of 2026-06-22:

- The 3D button is covered by bottom-right control-area E2E.
- 3D no longer auto-exits after 60 seconds and is covered by dedicated E2E.
- Maintained visible source, tests, and docs pass `npm.cmd run check:encoding`.

## 4. Required Architecture Adjustment

The 3D renderer should introduce a generation timeline instead of letting each layer decide reveal behavior independently.

Recommended modules:

```text
scene-build-context.js
  -> validates trip facts, geoAssets, route geometry, provenance

terrain-foundation-renderer.js
  -> builds raised base and terrain surface vertices

terrain-carving-renderer.js
  -> creates water channel depression masks and z-order rules

geo-skeleton-renderer.js
  -> roads, bridges, water surfaces

route-guidance-renderer.js
  -> 2D/3D shared route identity and real/estimated state

building-massing-renderer.js
  -> deterministic rectangular clusters

building-dissolve-renderer.js
  -> footprint/detail interpolation and camera LOD

generation-timeline.js
  -> owns animation phases and reveal progress

camera-rig.js
  -> shared pre-load/entry/idle overview orbit, drag pause, route focus, inspect mode
```

## 5. Generation Timeline Contract

Use a single timeline contract so screenshots and tests can verify the expected stage.

```text
phase 0: idle-2d
phase 1: selecting-3d-center
phase 2: freeze-2d
phase 3: derive-work-area-envelope
phase 4: slab-rise
phase 5: terrain-refine
phase 6: water-carve
phase 7: road-emerge
phase 8: bridge-resolve
phase 9: route-highlight
phase 10: building-massing
phase 11: building-dissolve
phase 12: camera-overview
phase 13: camera-route-focus-or-inspect
```

Each phase must expose debug state:

```text
window.__threeDebug__.mode
window.__threeDebug__.phase
window.__threeDebug__.phaseProgress
window.__threeDebug__.quality.degraded
window.__threeDebug__.quality.reasons
window.__threeDebug__.quality.missingLayers
window.__threeDebug__.counts.terrainChunks
window.__threeDebug__.counts.waterMeshes
window.__threeDebug__.counts.roadMeshes
window.__threeDebug__.counts.bridgeDecks
window.__threeDebug__.counts.bridgePiers
window.__threeDebug__.counts.routeSegments
window.__threeDebug__.counts.buildingMassings
window.__threeDebug__.counts.buildingDetailed
window.__threeDebug__.camera.mode
window.__threeDebug__.camera.autoRotate
window.__threeDebug__.camera.userInteracting
window.__threeDebug__.provenance
```

Recommended target timing:

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

## 6. Acceptance Criteria

P0 visual acceptance:

- 3D button is visible in the bottom-right map control area.
- Clicking the 3D button from 2D enters red-pin selection mode instead of building an unbounded
  route-wide scene.
- The user-selected work area is a visible square centered on the clicked 2D map point.
- `spanMeters` defaults to the scene profile and never exceeds the V1 hard cap of 2000m.
- The selected square is raised first with a uniform top height; outside context is dimmed or
  simplified.
- 3D button remains visible at low precision, either enabled for degraded overview or disabled with a reason.
- 3D mode does not auto-exit after idle time.
- 2D to 3D transition starts with a raised foundation, not instantly visible final layers.
- The canvas is nonblank within 1.5 seconds.
- Real route geometry renders as the 2D route style projected onto the 3D surface.
- Real route geometry has no gray outline, thick gray bed, or flickering layered shadow in 3D.
- Estimated fallback route renders dashed and is clearly labelled.
- Text in 3D UI contains no mojibake.
- Route hash, first point, last point, and length diagnostics are exposed in debug state.
- Geo asset upstream failure exposes degraded state in `window.__threeDebug__.quality`.

P1 visual acceptance:

- Waterways visibly carve downward or sit in a depressed channel.
- Roads and bridges emerge from the ground after the foundation.
- Bridge decks read as crossing structures.
- Buildings first appear as rectangular massing clusters.
- Near-view buildings dissolve into more detailed outlines without popping.
- Route guidance stays readable above all geographic and building layers.
- Timeline screenshot gates can capture foundation, carved geography, route highlight, massing, dissolve, and route focus states.

P2 visual acceptance:

- City scenes prioritize route, roads, POI, and building massing over exaggerated terrain.
- Scenic and hiking scenes prioritize terrain relief, slope, and route elevation.
- Close-up inspect mode shows local terrain relationships without loading whole-city detail.

Engineering acceptance:

- Nonblank slab appears within 1.5 seconds.
- Accepted generation timing is 4 seconds on the desktop target: 1s foundation, 1s terrain/water/roads, 1s building massing, 1s building dissolve.
- Route length error is within 1%.
- Route clearance P95 is within 0.3m above terrain/road surface.
- Terrain variance is nonzero unless the scene explicitly reports flat fallback.
- Building base terrain error P95 is <= 0.25m in seeded scenes.
- Console errors are zero except whitelisted third-party noise.
- Every visible real-world asset has source, licence, attribution, and updatedAt.

## 7. Immediate Implementation Order

The evidence-first infrastructure, QA v1, P2 water/bridge gates, and P3 building massing/dissolve
work are now implemented enough that Gate 50 is blocked by presentation quality rather than missing
low-level renderer capability. The next implementation order is:

1. Gate 50 live-review packet expansion:
   - eight-shot minimum: hiking overview/route-focus, old-street overview/inspect, landmark
     route-focus/inspect, river-bridge overview/inspect;
   - river-bridge live packet must assert water coverage, bridge continuity, route visibility, blue
     water pixels, no piers without provenance, and z-fighting budget.

2. Terrain presentation pack:
   - add relief-lite cues for hiking without abandoning the bone-white planning style;
   - collect `terrainReliefContrast`, `nonBackgroundPixelRatio`, and
     `visibleSemanticLayerCount` in warn mode.

3. Camera composition pack:
   - tune overview, route-focus, and inspect presets as product shots, not only test utilities;
   - measure first-screen route legibility and route/context adjacency.

4. Urban semantic density pack:
   - improve old-street and landmark inspect co-visibility for route, road, building, POI/landmark,
     and local context;
   - keep all fallback context labelled as synthetic planning massing.

5. Route dominance, focus edge, and QA hygiene:
   - preserve the no-gray-route policy;
   - improve work-area figure-ground contrast through dimming/falloff, not decorative borders;
   - clear or classify `MISSING_PROVENANCE_FIELDS` before promoting Gate 50.

Do not start DEM tile precision, real landmark restoration, commercial 3D provider routing, engine
replacement, or broad scene expansion until the eight-shot Gate 50 packet is accepted or rejected
with a specific defect class.
