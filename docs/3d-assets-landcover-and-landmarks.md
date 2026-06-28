# 3D Assets, Landcover, and Landmarks

## 1. Product boundary

The 3D view is a planning diorama, not a claim that every building is a survey-grade model. Real geometry always wins over generated geometry. Generated geometry must be visibly neutral and may not be labelled as a real building model.

## 2. Building fallback catalog

Every use scenario has exactly five stable procedural templates. A hash of `location.id` selects one, so refreshes never reshuffle the scene.

| Scenario    | Templates                                |
| ----------- | ---------------------------------------- |
| Lodging     | courtyard, tower, terrace, annex, canopy |
| Food        | shopfront, gable, arcade, terrace, annex |
| Retail      | arcade, box, canopy, terrace, tower      |
| Culture     | courtyard, gable, terrace, tower, box    |
| Transport   | canopy, arcade, box, tower, annex        |
| Residential | gable, terrace, courtyard, annex, tower  |
| Generic     | box, gable, terrace, annex, courtyard    |

Source priority: licensed GLB/CityGML model -> licensed building footprint with height/levels -> OSM-compatible footprint where its licence and attribution are accepted -> this POI template. The UI must preserve provenance on every record. If an attributable footprint cannot pass the terrain-base tolerance gate, the renderer degrades it to neutral synthetic massing at the footprint center instead of silently dropping all building context.

## 3. Mountains and vegetation

DEM provides height only; it cannot justify vegetation. The terrain mesh reveals from a flat plane by interpolating each vertex height, so ridges rise before their lower slopes rather than the whole mesh being vertically scaled.

Vegetation can render only when a licensed land-cover/forest polygon is available. A provider normalizes that data into:

```js
{
  id, source, licence, licensed: true,
  points: [{ x, z }],
  cover: 'forest' | 'scrub' | 'grass',
  confidence: 'surveyed' | 'classified'
}
```

The renderer chooses one of five reusable cluster templates (`conifer-cluster`, `broadleaf-cluster`, `shrub-cluster`, `ridge-conifer`, `low-cover`) and applies deterministic seeded placement. Future production work must replace individual meshes with `InstancedMesh`, chunk the scene by terrain tile, and cull chunks outside the camera frustum. No vegetation is rendered for missing, unlicensed, water, road, building, or low-confidence cover areas.

## 4. Roads

The current client uses the selected route's travel mode only to set a visual road width. Production road geometry needs an actual licensed road graph/centerline with `highway`, surface, bridge, tunnel, access, and footway/path attributes. Geometry priority is: route polyline -> licensed road centerline -> no road mesh. A road is a terrain-conforming ribbon; the industrial safety-yellow guidance stripe remains an itinerary overlay, never the road itself.

## 5. Terrain foundation, waterways, and bridges

The terrain never begins as a zero-height sheet. A sampled DEM produces two heights: a compressed absolute-elevation foundation and relative local relief. This gives a flat but elevated district a slight, stable base while keeping a mountain legible without turning the entire scene into a vertical wall. With no DEM, the renderer uses only a low neutral fallback surface and labels the confidence accordingly.

The entry sequence is fixed: first the selected terrain foundation rises as a clean, uniform-height
plane; second, local terrain relief, water surfaces, roads, and bridge structures emerge together
from that base; last, buildings dissolve in and their close-range detail LOD becomes eligible.
Route and water vertices share the terrain reveal progress, which prevents floating route lines and
blank river cuts while the terrain is forming. Exit runs the same sequence in reverse.

Provider-neutral water and bridge input is retained only with provenance:

```js
{
  waterways: [{
    id, polygon: [[lng, lat], ...],
    // or centerline plus a measured/attributed width
    centerline: [[lng, lat], ...], widthMeters,
    provenance: { source, licence, attribution, updatedAt }
  }],
  bridges: [{
    id, centerline: [[lng, lat], ...],
    widthMeters, deckHeightMeters,
    provenance: { source, licence, attribution, updatedAt }
  }]
}
```

Waterway geometry renders as either an authoritative polygon or a width-derived ribbon. A bridge starts as deck-first crossing geometry located from its centerline and terrain; piers or structural detail require explicit provider data or approved templates. Ingestion must supply actual water/bridge geometry; no provider data means no speculative river or bridge mesh.

## 6. Landmark restoration pipeline

1. Resolve a landmark using a stable provider ID, name aliases, and coordinate tolerance.
2. Fetch only owner-provided, municipal open-data, or explicitly licensed models. Never scrape map imagery or proprietary 3D scenes.
3. Validate licence, attribution, geographic CRS, unit scale, and permitted derivative use; write a provenance manifest before publishing.
4. Align model origin/heading to surveyed control points, then compare its footprint against the authoritative footprint.
5. Produce LOD2/LOD1/placeholder outputs, texture atlas limits, and a thumbnail for review. Near view can use LOD2; overview must use LOD1 or a neutral footprint extrusion.
6. Run visual review from four fixed camera positions and automatically reject missing textures, floating geometry, terrain intersections, or more than 2 m footprint drift.
7. Ship with source attribution and an immediate fallback to the procedural template when assets fail or the licence expires.

Candidate data classes to evaluate during provider onboarding: official municipal CityGML/CityJSON portals, owner-supplied GLB, licensed commercial city-model tiles, OpenStreetMap/Overpass building and road tags, and permissioned street-level imagery for manual verification. Each candidate requires legal, coverage, freshness, rate-limit, and attribution review before code integration.

## 7. Release gates

- A missing provider must fail closed to neutral templates, not invented detail.
- Every visible real asset must have `source`, `licence`, `updatedAt`, and `attribution`.
- Flat-terrain and mountain screenshots must both show a nonzero ground foundation; the first
  selected-plane lift must be uniform-height, and route/water surfaces may not float during the
  entry animation.
- A waterway/bridge scene must have no terrain-colored gap where an attributable polygon or centerline is present.
- Vegetation density is capped per terrain chunk and disabled before it harms itinerary/road readability.
- At least one mountain, an old-street storefront, and a landmark route must pass desktop screenshot review at overview and inspect distances.
- Landmark model metadata must pass `npm.cmd run check:landmarks` before a record can survive normalization. The gate validates URL allowlist, `model/gltf-*` content type, byte size, texture budget, triangle/material budgets, footprint drift, `sha256-*` integrity, `optimized: true`, and required LOD1 plus placeholder outputs.

## 8. Implemented workspace contract

`trip.geoAssets` is now the provider-neutral ingestion boundary. It is persisted with the workspace and normalized before any renderer sees it.

```js
{
  buildings: [{
    id: 'building-42', locationId: 'poi-id', // optional for surrounding context buildings
    footprint: [[lng, lat], [lng, lat], [lng, lat]],
    heightMeters: 18, roof: 'flat',
    provenance: { source, licence, attribution, updatedAt }
  }],
  roads: [{
    id: 'street-8', centerline: [[lng, lat], [lng, lat]],
    kind: 'major' | 'local' | 'path', widthMeters: 8,
    provenance: { source, licence, attribution, updatedAt }
  }],
  landcover: [{
    id: 'forest-7', licensed: true, cover: 'forest',
    polygon: [[lng, lat], [lng, lat], [lng, lat]],
    provenance: { source, licence, attribution, updatedAt }
  }],
  waterways: [{
    id: 'canal-7', centerline: [[lng, lat], [lng, lat]], widthMeters: 16,
    provenance: { source, licence, attribution, updatedAt }
  }],
  bridges: [{
    id: 'bridge-2', centerline: [[lng, lat], [lng, lat]],
    widthMeters: 10, deckHeightMeters: 6,
    provenance: { source, licence, attribution, updatedAt }
  }],
  landmarks: [{
    id: 'landmark-1', lnglat: [lng, lat], modelUrl: 'https://...',
    asset: {
      sourceFormat: 'owner-provided-glb' | 'municipal-cityjson' | 'municipal-citygml',
      contentType: 'model/gltf-binary' | 'model/gltf+json',
      byteSize, textureBytes, triangleCount, materialCount,
      footprintDriftMeters,
      optimized: true,
      integrity: 'sha256-...',
      lods: [
        { level: 'LOD2', modelUrl, byteSize, triangleCount, integrity: 'sha256-...' },
        { level: 'LOD1', modelUrl, byteSize, triangleCount, integrity: 'sha256-...' },
        { level: 'placeholder', modelUrl, byteSize, triangleCount, integrity: 'sha256-...' }
      ]
    },
    provenance: { source, licence, attribution, updatedAt }
  }]
}
```

Current renderer behavior: an authorized `buildings[].locationId` replaces that POI's fallback block with a footprint extrusion. An attributable building without `locationId` is rendered as surrounding context, capped to keep the frame and GPU budget stable. Rejected footprint extrusions fall back to neutral synthetic massing and are not presented as real exterior models. Repeated fallback low-poly massing is batched with `InstancedMesh`; close-range detail and dissolve LOD remain per building. Attributable roads become a muted terrain-conforming base layer, while the selected itinerary uses a warm road bed, graphite outline, and industrial safety-yellow guidance stripe. Authorized land-cover polygons generate deterministic vegetation clusters on the terrain; attributable waterways and bridges render on the same terrain model as roads. Landmark records are retained only after `js/render/landmark-assets.js` validates their release-gate metadata. The renderer still does not auto-load remote model URLs; the gate exists so future model loading cannot begin without allowlist, content-type/size validation, integrity metadata, LOD outputs, and GLTF/GLB optimization.

### OpenStreetMap context ingestion

The desktop 3D entry flow now queries the BFF endpoint `/_geo-assets` when no trip-level asset pack exists. The BFF makes a bounded Overpass request around the active itinerary locations, persists the normalized result in `trip.geoAssets`, and returns ODbL provenance (`© OpenStreetMap contributors`). It ingests building footprints, road centerlines, waterways, bridges, and forest/grass/scrub cover. This is a context layer, not an authoritative landmark pipeline: no remote model URL is imported, and no waterway, bridge, road, or vegetation is fabricated when the provider returns no matching geometry.

The route equivalent is `event.routeToNext.geometry`. Successful AMap Web Service routing is cached as `source: 'amap-web-service'` plus the real `paths`; legacy `amap-navigation` records remain readable during migration. 3D uses the longest valid cached route path regardless of its provider label before it considers a two-point fallback, so imported and future licensed route sources retain the same path contract.

The 2D and 3D renderers share `js/route-guidance.js`: the renderer changes, but the route state does not. Both modes use the same industrial safety-yellow identity, white/neutral support layer, selected-segment halo, and `segmentId`. A 3D selected route receives terrain-conforming directional markers and a short camera focus transition from the same sidebar route card. A two-point fallback remains dashed in both modes and must never be presented as a verified road path.
