# Product and Architecture Blueprint

## Product definition

Travel With Me is a desktop-first travel planning workspace. It turns Chinese travel notes and selected places into an editable multi-day itinerary, proves that itinerary on a real 2D map, then offers 3D only when it adds planning value. It is not turn-by-turn navigation or a generic 3D city viewer.

The authoritative 2D data contract is maintained in [2D Data Foundation](./2d-data-foundation.md).

## Core rule

**2D is the geographic source of truth; 3D is a spatial interpretation of the same data.** No 3D object may invent a route, coordinate, elevation conclusion, building identity, land-cover claim, or landmark appearance. Missing authoritative data produces a neutral template or no visual at all.

## Canonical flow

```text
User / AI guide
  -> itinerary draft
  -> 2D data foundation
       BFF Web Service API: POI, geocode, nearby search, route
       locations[].lnglat, routeToNext.geometry, annotations[]
  -> persisted trip/workspace
  -> 2D map: markers, route, route card
  -> 3D: projection, terrain, route ribbon, authorized assets
```

`trip` is the only persistent business model. The 2D map and Three.js scene are renderers, never competing stores.

## Credential boundary

| Credential      | Location       | Responsibility                       |
| --------------- | -------------- | ------------------------------------ |
| Web JS API Key  | browser config | AMap JS API 2.0 map rendering        |
| jscode          | server `.env`  | JS API security configuration        |
| Web Service Key | server `.env`  | POI, geocode, nearby search, routing |

The BFF owns all Web Service calls, overwrites browser-supplied keys, applies source/rate limits, and never returns the service key.

## 2D contract

Before a day can enter useful 3D, 2D must have resolved location coordinates, a real route geometry or explicit estimated/failure state, visible marker/route feedback, and persisted route provenance (`source`, `mode`, `paths`, `fetchedAt`). Estimated straight lines may render in 2D but never masquerade as real roads in 3D.

## 3D contract

| 2D fact                      | 3D expression                                         |
| ---------------------------- | ----------------------------------------------------- |
| `locations[].lnglat`         | scene projection, marker and fallback-building anchor |
| `routeToNext.geometry.paths` | terrain-conforming road ribbon and itinerary line     |
| elevation provider           | terrain mesh and confidence-gated slope insight       |
| `annotations[]`              | shared user markers                                   |
| authorized `geoAssets`       | footprint, vegetation, landmark detail                |

3D is an inspection surface with a reliable 2D exit, not the default editor.

## Delivery stages

### D0: Data foundation — closed for the desktop private-test baseline

- Complete BFF-first POI, geocode, nearby search, and routing.
- Persist real route geometry and its provenance.
- Keep CI mocked; run live AMap checks separately.

Exit: a desktop user can create/import a trip, resolve locations, inspect real 2D routes, reload, and retain the result.

### D1: 3D route and terrain truth — current priority

- Require cached 2D route geometry for real-road rendering.
- Gate terrain claims on elevation confidence.
- Follow the fixed generation state machine: freeze 2D, derive scene envelope, raise slab, refine terrain, carve water, emerge roads and bridges, highlight route, raise building massing, dissolve building detail.
- Add overview/route-focus/inspect camera states, route elevation summaries, and visual gates.

Current D1 execution is evidence-first:

```text
Alpha visual proof infrastructure
  -> Beta P2 water / road / bridge visual correctness
  -> Gamma P3 building massing / dissolve
  -> Delta inspect camera and scene precision profiles
```

P4 DEM tiles, P5 landmark restoration, and commercial provider routing are blocked until Alpha/Beta visual gates are stable.

### D2: Authorized place detail

- Ingest licensed building footprints, roads, water, bridges, land cover, and landmark assets with provenance.
- Chunk/cull terrain and vegetation and enforce LOD budgets.

### D3: Private beta and commercial readiness

- Accounts, cloud persistence, quota/observability, privacy controls, and real-user evaluation.

Mobile Web is compatibility-only. Native Android is a separate Kotlin product decision after D1/D2 validation.

## Quality gates

- Format, lint, unit tests, and mocked browser tests pass for every merge.
- Live provider checks are credentialed, opt-in, and excluded from CI.
- 3D is reviewed at overview, entering, inspect, and exit states.
- 3D visual changes require deterministic ROI screenshots plus `window.__threeDebug__.qa` metrics once the Alpha gate is active.
- Every external asset records source, licence, attribution, and update metadata.

## Document ownership

| Document                                    | Role                                             |
| ------------------------------------------- | ------------------------------------------------ |
| This blueprint                              | product direction, data truth, delivery gates    |
| `docs/documentation-index.md`               | maintained document map and removed-history list |
| `ARCHITECTURE.md`                           | implemented module boundaries and ADRs           |
| `docs/api.md`                               | BFF/API contracts and environment variables      |
| `docs/quality-gate-status.md`               | current quality gate verification ledger         |
| `docs/3d-deep-research-integration.md`      | latest 3D technical decisions and QA gates       |
| `docs/3d-generation-process-alignment.md`   | required 2D-to-3D user-visible process           |
| `docs/3d-top-down-execution-roadmap.md`     | P0-P6 3D implementation order                    |
| `docs/qa/visual-baseline.md`                | ROI visual baseline execution                    |
| `docs/qa/debug-contract.md`                 | `window.__threeDebug__.qa` schema                |
| `docs/3d-assets-landcover-and-landmarks.md` | licensed asset pipeline                          |
| `TODO.md`                                   | active backlog only                              |
| `commercialization-solutions.md`            | post-validation market decisions                 |
