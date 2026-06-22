# Quality Gate Status

Last verified: 2026-06-23

This document is the current status ledger for engineering, 2D map, 3D generation, data provenance, visual, and release quality gates. Source gates are consolidated from:

- `docs/product-architecture-blueprint.md`
- `docs/3d-deep-research-integration.md`
- `docs/3d-generation-process-alignment.md`
- `docs/3d-assets-landcover-and-landmarks.md`
- `docs/release-playbook.md`
- `TODO.md`

## Verification Evidence

Commands run on 2026-06-23:

| Check                                                                | Result                                                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `npm.cmd run check`                                                  | Passed                                                                                                                                 |
| `npm.cmd test`                                                       | Passed: 30 files, 146 tests                                                                                                            |
| `npm.cmd run check:encoding`                                         | Passed: 310 visible source/doc/test files scanned                                                                                      |
| `npm.cmd run check:architecture`                                     | Passed: 37 render files scanned; renderer/provider boundary enforced                                                                   |
| `npm.cmd run check:provenance`                                       | Passed: 42 scene fixture files scanned                                                                                                 |
| `npm.cmd run check:landmarks`                                        | Passed: 1 landmark record scanned with allowlist, integrity, LOD, and budget validation                                                |
| `npx.cmd playwright test tests/e2e/smoke.spec.js --project=chromium` | Passed: 12 desktop tests, 1 mobile-only test skipped in Chromium                                                                       |
| `npx.cmd playwright test tests/e2e/live-provider.spec.js`            | Passed by skip: live provider smoke is explicit opt-in only                                                                            |
| Full visual baseline suite                                           | Passed: 24 local ROI fixture captures/interactions with QA JSON and screenshots in 12.4m                                               |
| Beta route-yellow fixture calibration                                | Passed: all maintained visual fixtures declare `route.minYellowPixelRatio`; visual suite rejects missing values                        |
| Beta water/bridge fixture expansion                                  | Passed: `river-bridge` and `wide-river-bridges` water/bridge ROI gates                                                                 |
| targeted 3D/2D gate E2E                                              | Passed: nonblank 3D, geo assets, WASD camera, geometry P95, 2D fallback, 60s no-auto-exit                                              |
| tracked-source secret scan for known AMap/DeepSeek patterns          | Passed: no matches in tracked source                                                                                                   |
| in-app browser 2D/3D visual check                                    | Passed: 2D marker selection enters bounded 3D; QA passed; route gray outline is 0; initial/loading/idle camera uses one overview orbit |
| manual 3D screenshot review                                          | Pending after VQ0 implementation; previous screenshot scored 1/10 before bounded work-area and route-layer repair                      |

## Manual Visual Override

The automated gates above prove structural presence and deterministic fixture behavior. They do
not yet prove that the current live 3D composition is acceptable. The 2026-06-22 manual screenshot
review reopened the visual-quality gate. VQ0 is now implemented at code level, but P4 DEM tiles,
P5 landmark restoration, and additional decorative detail work remain blocked until the user
accepts the new bounded 3D visual output.

VQ0 target state:

- 2D 3D-button click enters red-pin center selection.
- 3D is built from a fixed square work area, not from full route/all-point bounds.
- Default work area is 800m; profile defaults are urban 600m, scenic 1000m, hiking 2000m.
- V1 hard cap is 2000m.
- Selected square raises first as a uniform-height plane; outside context is dimmed or simplified.
- 3D route guidance has no gray outline/bed and keeps yellow as the only primary route layer.
- 3D yellow guidance is a narrow 2D-style navigation line, not a thick road-surface band.
- Initial camera pose is the same high-angle overview orbit before terrain data loads, during entry, and after idle auto-rotate starts.
- Route pixels remain stable during drag, WASD, and wheel camera stress.

## Summary

| Status       | Count | Meaning                                                                                             |
| ------------ | ----: | --------------------------------------------------------------------------------------------------- |
| Complete     |    49 | Implemented and covered by automated evidence or current browser verification                       |
| Partial      |     1 | Implemented or directionally present, but missing final manual acceptance or full repeated baseline |
| Not complete |     0 | Contradicted by current manual visual evidence                                                      |
| Total        |    50 | Current tracked quality gates                                                                       |

## Completed Gates

|   # | Gate                                                                                                                | Evidence                                                                       |
| --: | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
|   1 | Format, lint, and source style pass                                                                                 | `npm.cmd run check`                                                            |
|   2 | Unit tests pass                                                                                                     | `npm.cmd test`: 30 files, 146 tests                                            |
|   3 | Desktop browser smoke tests pass                                                                                    | Chromium smoke: 12 passed, 1 mobile-only skipped                               |
|   4 | Tracked source does not contain known real API keys                                                                 | `git grep` secret scan returned no matches                                     |
|   5 | 2D AMap mode renders real map content after CSP fixes                                                               | Browser and E2E map flow                                                       |
|   6 | Local 2D fallback renders when AMap JS SDK fails                                                                    | `desktop falls back to local 2D map when AMap JS SDK fails`                    |
|   7 | 3D button stays in the bottom-right map control area                                                                | Desktop 3D E2E bounding-box assertions                                         |
|   8 | 3D entry remains available for degraded overview                                                                    | Fallback/degraded 3D E2E                                                       |
|   9 | Nonblank 3D slab/canvas appears within the current gate                                                             | `data-first-slab-ms <= 1500` E2E assertion                                     |
|  10 | 2D and 3D route hash match                                                                                          | Desktop 3D E2E route diagnostics                                               |
|  11 | 2D and 3D route endpoints match                                                                                     | Desktop 3D E2E endpoint key assertion                                          |
|  12 | 2D and 3D route length stays consistent                                                                             | Desktop 3D E2E length assertion                                                |
|  13 | Persisted route geometry is preserved through 3D render paths                                                       | `route-guidance-renderer` tests and E2E route hash                             |
|  14 | Real routes render as continuous industrial safety-yellow guidance                                                  | 3D smoke and shared `route-guidance.js`                                        |
|  15 | Estimated fallback routes render as dashed geometry                                                                 | `route-guidance-renderer.test.js`                                              |
|  16 | Geo asset upstream failure exposes degraded state                                                                   | Desktop 3D E2E degraded-state assertions                                       |
|  17 | Named generation timeline exists                                                                                    | `generation-timeline.test.js`                                                  |
|  18 | Timeline exposes foundation, terrain, carving, massing, and dissolve progress                                       | `generation-timeline.test.js`                                                  |
|  19 | Scene debug exposes route, camera, counts, quality, and provenance                                                  | Desktop 3D E2E `window.__threeDebug__` assertions                              |
|  20 | Camera supports unlocked WASD translation with terrain-relative y clamp                                             | `desktop 3D camera supports unlocked WASD...` E2E                              |
|  21 | Terrain foundation is separate from terrain relief                                                                  | `terrain-foundation.js`, `terrain-model.test.js`, 3D entry sequence            |
|  22 | Bridge decks render from attributable bridge data                                                                   | `geo-asset-renderer.test.js` and water/bridge E2E                              |
|  23 | Roads render as muted terrain-following ribbons                                                                     | `geo-asset-renderer.test.js` and water/road E2E                                |
|  24 | 3D overview can enter and exit without blanking                                                                     | `desktop can enter and exit nonblank 3D map view`                              |
|  25 | 3D mode never auto-exits after 60 seconds                                                                           | `desktop 3D stays open after 60 seconds idle`                                  |
|  26 | No visible UI mojibake in maintained source, tests, and docs                                                        | `npm.cmd run check:encoding`: 310 files scanned                                |
|  27 | Accepted 4s generation timing replaces the old `<= 3s` detail budget                                                | `generation-timing.js` and `generation-timeline.test.js`                       |
|  28 | Route clearance P95 is within 0.3m above terrain/road surface                                                       | `route-guidance-renderer.test.js` and WASD 3D E2E geometry metrics             |
|  29 | Building base terrain error P95 is <= 0.25m in seeded scenes                                                        | `window.__threeDebug__.geometryMetrics` and WASD 3D E2E                        |
|  30 | Renderer modules cannot directly import provider/API or server modules                                              | `check:architecture`, ESLint `no-restricted-imports`                           |
|  31 | Live provider checks are explicit opt-in and excluded from default CI                                               | `test:e2e:live-provider`, skipped default test, manual workflow                |
|  32 | Real fixture assets require complete source/licence/attribution/updatedAt                                           | `check:provenance`, `geo-assets.test.js`, scene fixture scan                   |
|  33 | Micro-street building LOD increases at inspect distance and recedes in overview                                     | `micro-street building LOD...` visual E2E and `qa.lod` metrics                 |
|  34 | River-bridge 30s camera stress preserves route readability and z-fighting budget                                    | `river-bridge route remains readable during 30s camera stress` E2E             |
|  35 | Micro-street 30s dense-building stress preserves route readability                                                  | `micro-street route remains readable during 30s dense-building...`             |
|  36 | Hiking-terrain 30s terrain stress preserves route readability                                                       | `hiking-terrain route remains readable during 30s terrain...`                  |
|  37 | Vegetation per-area template density is capped and QA-gated                                                         | `VEGETATION_DENSITY_CAP_EXCEEDED` unit gate and hiking visual E2E              |
|  38 | Micro-street inspect close view is readable with terrain-relative y clamp                                           | `micro-street inspect view remains readable...` visual E2E                     |
|  39 | Waterways visibly carve downward or sit in a depressed channel                                                      | `terrainCarvingDepthP50` visual E2E gate                                       |
|  40 | Attributable water renders blue-grey water pixels instead of blank terrain                                          | `waterBluePixelRatio` visual E2E gate                                          |
|  41 | Close view building dissolve has no popping                                                                         | `micro-street`, `old-street`, and `landmark-pilot` stepped dissolve visual E2E |
|  42 | Route guidance remains readable above geographic, old-street, and landmark layers                                   | `old-street` and `landmark-pilot` visual readability E2E                       |
|  43 | Timeline screenshot gates capture foundation, carved geography, route highlight, massing, dissolve, and route focus | `river-bridge captures timeline visual stages...` visual E2E                   |
|  44 | City, scenic, and hiking scenes pass scenario-specific terrain precision review                                     | `passes ... terrain precision review` visual E2E                               |
|  45 | Mountain, old-street storefront, and landmark route screenshots pass overview and inspect review                    | `passes overview and inspect screenshot review` visual E2E                     |
|  46 | Landmark true-restoration pipeline is release-gated                                                                 | `check:landmarks`, `landmark-assets.test.js`, QA allowlist metrics             |
|  47 | Water and bridge correctness covers both narrow centerline river and wide polygon/multi-bridge shapes               | `river-bridge` and `wide-river-bridges` visual ROI gates                       |
|  48 | Building LOD near/far response covers old-street storefront and landmark scenes                                     | `old-street` and `landmark-pilot` building LOD visual E2E                      |
|  49 | Licensed vegetation exposes chunk/frustum telemetry and keeps it internally consistent                              | Landcover chunk bounds, `hiking-terrain` visual E2E, and QA tests              |

## Partial Gates

|   # | Gate                                                                 | Evidence                                                                                                                                                                                                               | Required fix                                                                                       |
| --: | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
|  50 | Live 3D composition reaches product-quality bounded diorama standard | VQ0 code path implemented; in-app browser QA passed with high-angle bounded overview, narrow yellow route, and no gray route outline; final user screenshot review has not yet accepted the new bounded 3D composition | Run user manual visual review on the new VQ0 output, then promote the gate to complete if accepted |

## Not Complete Gates

No not-complete gates remain in the current ledger. Gate 50 remains partial until manual review accepts the new bounded composition.

Real landmark model rendering still remains a future P5 feature, but the release gate that prevents unsafe or unlicensed landmark assets from entering the renderer is now implemented.

## Beta Self-Audit

Self-audit on 2026-06-23 after `codex/next-beta-visual-calibration`:

- Route-yellow readability thresholds are fixture-owned and missing thresholds fail the visual suite.
- Water/bridge correctness now covers both the original narrow `river-bridge` fixture and the `wide-river-bridges` polygon-water, multi-span fixture.
- The `river-bridge` timeline gate proves rectangular building massing appears before building dissolve: partial massing progress, zero dissolve progress, and a present building layer at the `building-massing` checkpoint.
- Building near/far LOD response and stepped no-pop dissolve are gated for `micro-street`, `old-street`, and `landmark-pilot`.
- Building dissolve now uses a tested distance hysteresis band so threshold-adjacent camera movement preserves the current massing/detail state instead of flickering.
- Repeated fallback low-poly building massing now uses `InstancedMesh`; direct renderer tests prove deterministic fallback rebuilds, authoritative footprint extrusion, and synthetic fallback for rejected unlocated footprints.
- Licensed vegetation now reports density, chunk count, visible chunk count, and frustum-culled chunk count through `qa.budgets`.
- Vegetation frustum telemetry now uses landcover chunk bounds, keeping camera-stress telemetry aligned with actual licensed vegetation areas.
- The live 3D entry now starts on the same high-angle overview orbit before terrain data loads, during entry, and after idle auto-rotate starts; it renders the 3D route as a narrow yellow guidance line.
- Remaining partial item is not an automated gap: the live bounded 3D composition still needs manual product-quality acceptance before gate 50 can close.

## Gamma P3 Self-Audit

P3 building massing and dissolve are complete at code level, but not a release claim that the live
3D composition has passed final product taste review.

Evidence:

- `building-massing-renderer.js` owns massing geometry, authoritative footprint extrusion,
  deterministic fallback massing, terrain-error rejection, and synthetic fallback metadata.
- `building-dissolve-renderer.js` owns camera-distance detail alpha, distance hysteresis, LOD
  metrics, and publish-signature throttling.
- `building-massing-renderer.test.js` proves deterministic fallback rebuilds, authoritative
  footprint extrusion on flat terrain, and synthetic massing fallback for rejected unlocated
  footprints.
- `building-lod.test.js` proves near/far detail alpha and the hysteresis band.
- `river-bridge` timeline visual evidence proves building massing occurs before dissolve.
- `micro-street`, `old-street`, and `landmark-pilot` visual gates prove near/far LOD response and
  stepped dissolve smoothness.

Boundary:

- P4 DEM tile precision, P5 landmark restoration, and commercial 3D provider routing remain blocked
  until gate 50 manual visual acceptance closes or a new user screenshot defines the next visual
  defect source of truth.

## Immediate Fix Order

1. Complete VQ0 manual acceptance: **blocking**
   - review the new bounded 3D output after route de-gray, red-pin selection, fixed square work area, outside dimming, and VQ0 QA fields;
   - if accepted, promote gate 50 to complete;
   - if rejected, use the screenshot as the next visual-defect source of truth.
2. Add deterministic visual proof infrastructure before more visual fixes: **first Alpha subset implemented**
   - ROI screenshots for `river-bridge`, `micro-street`, and `hiking-terrain`;
   - fixed camera presets;
   - screenshot normalization stylesheet;
   - visual attachments with screenshots, fixture JSON, camera JSON, QA JSON, and Playwright report context.
3. Formalize `window.__threeDebug__.qa` v1 and expose geometry, budget, provenance, and layer metrics. **implemented**
4. Close P2 visual correctness: **river-bridge and wide-river-bridges gates expanded; route-yellow fixture thresholds calibrated**
   - `waterCoverageRatio`;
   - `bridgeContinuity`;
   - `terrainCarvingDepthP50`;
   - `routeVisiblePixelRatio`;
   - `routeYellowPixelRatio` now reads explicit `expectations.route.minYellowPixelRatio` per fixture;
   - `routeGroundClearanceP95`;
   - `zFightingRisk`;
   - `bridgePierCount === 0` when no pier/support provenance exists.
5. Add P3-adjacent building LOD response and no-pop gates. **near/far LOD and stepped no-pop implemented for micro-street, old-street, and landmark-pilot**
   - `qa.lod.buildingDetailAlphaAverage`;
   - `qa.lod.buildingDetailRatio`;
   - `qa.lod.buildingDistanceP50`;
   - near/far zoom interaction evidence;
   - stepped zoom-in evidence with bounded alpha deltas.
6. Continue P3 building massing/dissolve modularization after the current visual gates are stable. **Renderer split implemented:** `building-massing-renderer.js` owns geometry and `building-dissolve-renderer.js` owns LOD/dissolve state; inspect-camera visual review and fallback massing instancing are implemented for maintained review scenes.
7. Add 30-second P2 camera stress gate for route readability and z-fighting. **implemented for river-bridge, micro-street, and hiking-terrain**
8. Extend route readability above dense contextual layers. **implemented for old-street and landmark-pilot**
9. Extend vegetation budget work from density caps to chunk/frustum telemetry. **implemented for licensed landcover visual gates**
