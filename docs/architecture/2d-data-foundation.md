# 2D Data Foundation

## Purpose

The 2D map is the project's geographic source of truth. The 3D renderer may reinterpret this data, but it must never invent a coordinate, route, waterway, bridge, or building geometry that is absent from the persisted trip.

## Canonical records

| Record          | Persisted field              | Primary source                             | 2D behavior                 | 3D behavior                        |
| --------------- | ---------------------------- | ------------------------------------------ | --------------------------- | ---------------------------------- |
| Place           | `locations[id]`              | AMap Web Service POI/geocode or user input | marker and address          | anchor/marker/building fallback    |
| Itinerary route | `event.routeToNext.geometry` | AMap Web Service direction response        | route polyline              | terrain-conforming road ribbon     |
| Waterway        | `geoAssets.waterways[]`      | authorized polygon/centerline provider     | water overlay when enabled  | carved channel and water surface   |
| Bridge          | `geoAssets.bridges[]`        | authorized centerline provider             | bridge overlay when enabled | deck-first crossing geometry       |
| Land cover      | `geoAssets.landcover[]`      | licensed land-cover provider               | optional map layer          | deterministic vegetation templates |

## Acceptance contract

1. A resolved place must contain a valid `[lng, lat]` and a `source`; AMap Web Service results use `source: 'amap-web-service'`.
2. A real route must contain two or more ordered coordinate points, `mode`, `fetchedAt`, and `source: 'amap-web-service'`. A failed request may render an estimated 2D line, but it must not be cached as real geometry.
3. Waterways, bridges, land cover, landmarks, and authoritative building footprints require `source`, `licence`, `attribution`, and `updatedAt` provenance. Missing provenance fails closed to no geometry or a neutral procedural building fallback.
4. The 2D renderer and 3D renderer consume the same persisted fields. They must not perform independent provider lookups for the same displayed trip state.
5. The BFF allowlists only the AMap endpoints used by these records. It replaces any client-supplied key with the server-held Web Service Key.

## Validation gates

- Place search accepts both AMap Web Service `"lng,lat"` values and JS SDK location objects, then stores a normalized tuple.
- Reverse geocoding, POI search, and route planning use the BFF before an SDK fallback.
- A seeded browser test stubs the BFF, not only the JS SDK, so CI cannot silently depend on live AMap data.
- A real local verification must show resolved places, at least one completed route, and a visible 3D entry control before P2 3D asset work begins.

## Current provider boundary

AMap supplies POIs, geocoding, and itinerary routing. It is not treated as a source of reusable waterway, bridge, terrain, vegetation, or building geometry. The desktop prototype uses a bounded OpenStreetMap/Overpass context query for attributable building, waterway, and bridge geometry; its ODbL provenance is persisted in `geoAssets`. A commercial landmark pipeline still requires an explicitly licensed source and does not use this context query for remote models.
