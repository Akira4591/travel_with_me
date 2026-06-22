# Quality Gate Status

Last verified: 2026-06-22

This document is the current status ledger for engineering, 2D map, 3D generation, data provenance, visual, and release quality gates. Source gates are consolidated from:

- `docs/product-architecture-blueprint.md`
- `docs/3d-deep-research-integration.md`
- `docs/3d-generation-process-alignment.md`
- `docs/3d-assets-landcover-and-landmarks.md`
- `docs/release-playbook.md`
- `TODO.md`

## Verification Evidence

Commands run on 2026-06-22:

| Check                                                                | Result                                                                                    |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm.cmd run check`                                                  | Passed                                                                                    |
| `npm.cmd test`                                                       | Passed: 27 files, 133 tests                                                               |
| `npm.cmd run check:encoding`                                         | Passed: 279 visible source/doc/test files scanned                                         |
| `npm.cmd run check:architecture`                                     | Passed: 34 render files scanned; renderer/provider boundary enforced                      |
| `npm.cmd run check:provenance`                                       | Passed: 18 scene fixture files scanned                                                    |
| `npx.cmd playwright test tests/e2e/smoke.spec.js --project=chromium` | Passed: 12 desktop tests, 1 mobile-only test skipped in Chromium                          |
| `npx.cmd playwright test tests/e2e/live-provider.spec.js`            | Passed by skip: live provider smoke is explicit opt-in only                               |
| `npm.cmd run test:e2e:visual`                                        | Passed: 10 local ROI fixture captures/interactions with QA JSON and screenshots           |
| targeted 3D/2D gate E2E                                              | Passed: nonblank 3D, geo assets, WASD camera, geometry P95, 2D fallback, 60s no-auto-exit |
| tracked-source secret scan for known AMap/DeepSeek patterns          | Passed: no matches in tracked source                                                      |
| in-app browser 2D/3D visual check                                    | Passed: 2D AMap provider loaded, 3D enters, canvas visible, 3D DOM metrics populated      |

## Summary

| Status       | Count | Meaning                                                                                               |
| ------------ | ----: | ----------------------------------------------------------------------------------------------------- |
| Complete     |    41 | Implemented and covered by automated evidence or current browser verification                         |
| Partial      |     1 | Implemented or directionally present, but missing a dedicated gate, full scenario, or visual baseline |
| Not complete |     4 | Not implemented, not verified, or contradicted by current evidence                                    |
| Total        |    46 | Current tracked quality gates                                                                         |

## Completed Gates

|   # | Gate                                                                             | Evidence                                                            |
| --: | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
|   1 | Format, lint, and source style pass                                              | `npm.cmd run check`                                                 |
|   2 | Unit tests pass                                                                  | `npm.cmd test`: 27 files, 131 tests                                 |
|   3 | Desktop browser smoke tests pass                                                 | Chromium smoke: 12 passed, 1 mobile-only skipped                    |
|   4 | Tracked source does not contain known real API keys                              | `git grep` secret scan returned no matches                          |
|   5 | 2D AMap mode renders real map content after CSP fixes                            | Browser and E2E map flow                                            |
|   6 | Local 2D fallback renders when AMap JS SDK fails                                 | `desktop falls back to local 2D map when AMap JS SDK fails`         |
|   7 | 3D button stays in the bottom-right map control area                             | Desktop 3D E2E bounding-box assertions                              |
|   8 | 3D entry remains available for degraded overview                                 | Fallback/degraded 3D E2E                                            |
|   9 | Nonblank 3D slab/canvas appears within the current gate                          | `data-first-slab-ms <= 1500` E2E assertion                          |
|  10 | 2D and 3D route hash match                                                       | Desktop 3D E2E route diagnostics                                    |
|  11 | 2D and 3D route endpoints match                                                  | Desktop 3D E2E endpoint key assertion                               |
|  12 | 2D and 3D route length stays consistent                                          | Desktop 3D E2E length assertion                                     |
|  13 | Persisted route geometry is preserved through 3D render paths                    | `route-guidance-renderer` tests and E2E route hash                  |
|  14 | Real routes render as continuous industrial safety-yellow guidance               | 3D smoke and shared `route-guidance.js`                             |
|  15 | Estimated fallback routes render as dashed geometry                              | `route-guidance-renderer.test.js`                                   |
|  16 | Geo asset upstream failure exposes degraded state                                | Desktop 3D E2E degraded-state assertions                            |
|  17 | Named generation timeline exists                                                 | `generation-timeline.test.js`                                       |
|  18 | Timeline exposes foundation, terrain, carving, massing, and dissolve progress    | `generation-timeline.test.js`                                       |
|  19 | Scene debug exposes route, camera, counts, quality, and provenance               | Desktop 3D E2E `window.__threeDebug__` assertions                   |
|  20 | Camera supports unlocked WASD translation with terrain-relative y clamp          | `desktop 3D camera supports unlocked WASD...` E2E                   |
|  21 | Terrain foundation is separate from terrain relief                               | `terrain-foundation.js`, `terrain-model.test.js`, 3D entry sequence |
|  22 | Bridge decks render from attributable bridge data                                | `geo-asset-renderer.test.js` and water/bridge E2E                   |
|  23 | Roads render as muted terrain-following ribbons                                  | `geo-asset-renderer.test.js` and water/road E2E                     |
|  24 | 3D overview can enter and exit without blanking                                  | `desktop can enter and exit nonblank 3D map view`                   |
|  25 | 3D mode never auto-exits after 60 seconds                                        | `desktop 3D stays open after 60 seconds idle`                       |
|  26 | No visible UI mojibake in maintained source, tests, and docs                     | `npm.cmd run check:encoding`: 273 files scanned                     |
|  27 | Accepted 4s generation timing replaces the old `<= 3s` detail budget             | `generation-timing.js` and `generation-timeline.test.js`            |
|  28 | Route clearance P95 is within 0.3m above terrain/road surface                    | `route-guidance-renderer.test.js` and WASD 3D E2E geometry metrics  |
|  29 | Building base terrain error P95 is <= 0.25m in seeded scenes                     | `window.__threeDebug__.geometryMetrics` and WASD 3D E2E             |
|  30 | Renderer modules cannot directly import provider/API or server modules           | `check:architecture`, ESLint `no-restricted-imports`                |
|  31 | Live provider checks are explicit opt-in and excluded from default CI            | `test:e2e:live-provider`, skipped default test, manual workflow     |
|  32 | Real fixture assets require complete source/licence/attribution/updatedAt        | `check:provenance`, `geo-assets.test.js`, scene fixture scan        |
|  33 | Micro-street building LOD increases at inspect distance and recedes in overview  | `micro-street building LOD...` visual E2E and `qa.lod` metrics      |
|  34 | River-bridge 30s camera stress preserves route readability and z-fighting budget | `river-bridge route remains readable during 30s camera stress` E2E  |
|  35 | Micro-street 30s dense-building stress preserves route readability               | `micro-street route remains readable during 30s dense-building...`  |
|  36 | Hiking-terrain 30s terrain stress preserves route readability                    | `hiking-terrain route remains readable during 30s terrain...`       |
|  37 | Vegetation per-area template density is capped and QA-gated                      | `VEGETATION_DENSITY_CAP_EXCEEDED` unit gate and hiking visual E2E   |
|  38 | Micro-street inspect close view is readable with terrain-relative y clamp        | `micro-street inspect view remains readable...` visual E2E          |
|  39 | Waterways visibly carve downward or sit in a depressed channel                   | `terrainCarvingDepthP50` visual E2E gate                            |
|  40 | Attributable water renders blue-grey water pixels instead of blank terrain       | `waterBluePixelRatio` visual E2E gate                               |
|  41 | Close view building dissolve has no popping                                      | `micro-street building dissolve changes smoothly...` visual E2E     |

## Partial Gates

|   # | Gate                                                                     | Current status                                       | Missing work                                                        |
| --: | ------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
|  42 | Route guidance remains readable above all geographic and building layers | Dense building stress gate exists for `micro-street` | Extend occlusion/readability gates to old-street and landmark cases |

## Not Complete Gates

|   # | Gate                                                                                                                | Reason                                                                                                     |
| --: | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
|  43 | Timeline screenshot gates capture foundation, carved geography, route highlight, massing, dissolve, and route focus | E2E checks behavior, but no maintained screenshot baseline set exists.                                     |
|  44 | City/scenic/hiking scenes each pass scenario-specific terrain precision review                                      | Terrain modes exist; scenario visual baselines are not complete.                                           |
|  45 | Mountain, old-street storefront, and landmark route screenshots pass overview and inspect review                    | No maintained screenshot set for these three scenes.                                                       |
|  46 | Landmark true-restoration pipeline is release-gated                                                                 | Landmark records are retained, but remote model allowlist/content validation/optimization is not complete. |

## Immediate Fix Order

1. Add deterministic visual proof infrastructure before more visual fixes: **first Alpha subset implemented**
   - ROI screenshots for `river-bridge`, `micro-street`, and `hiking-terrain`;
   - fixed camera presets;
   - screenshot normalization stylesheet;
   - visual attachments with screenshots, fixture JSON, camera JSON, QA JSON, and Playwright report context.
2. Formalize `window.__threeDebug__.qa` v1 and expose geometry, budget, provenance, and layer metrics. **implemented**
3. Close P2 visual correctness: **river-bridge first gate expanded; broader calibration remains**
   - `waterCoverageRatio`;
   - `bridgeContinuity`;
   - `terrainCarvingDepthP50`;
   - `routeVisiblePixelRatio`;
   - `routeYellowPixelRatio`;
   - `routeGroundClearanceP95`;
   - `zFightingRisk`;
   - `bridgePierCount === 0` when no pier/support provenance exists.
4. Add P3-adjacent building LOD response and no-pop gates. **implemented for micro-street**
   - `qa.lod.buildingDetailAlphaAverage`;
   - `qa.lod.buildingDetailRatio`;
   - `qa.lod.buildingDistanceP50`;
   - near/far zoom interaction evidence;
   - stepped zoom-in evidence with bounded alpha deltas.
5. Continue P3 building massing/dissolve modularization and inspect-camera visual review after more P2 fixture shapes are calibrated.
6. Add 30-second P2 camera stress gate for route readability and z-fighting. **implemented for river-bridge and micro-street**
