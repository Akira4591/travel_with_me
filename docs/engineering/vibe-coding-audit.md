# Vibe Coding Audit Report

> **辅助文件** | 权威开发文档: [DEVELOPMENT.md](../../DEVELOPMENT.md)

Audit date: 2026-07-17
Auditor: AI-assisted codebase analysis + web research
Scope: 42 JS source files, 3 CSS files, 1 HTML, Dockerfile, configs, server modules

---

## 1. Vibe Coding Common Problems

Based on CodeRabbit 470-PR study, GitClear 211M-line analysis, METR randomized controlled trial, Veracode 3-year security report, and industry incident reports.

### 1.1 Definition

Coined by Andrej Karpathy (Feb 2025). Core trait: "forget code exists", Accept All without reading diffs, paste errors back to AI. Collins 2025 Word of the Year.

### 1.2 Problem Matrix

| Category                 | Key Data                                                                   | Source                 |
| ------------------------ | -------------------------------------------------------------------------- | ---------------------- |
| Architecture bloat       | Code grows beyond human comprehension                                      | Karpathy admission     |
| Context engineering gap  | 5 context types needed: business, architecture, repo, security, operations | IBM                    |
| Concurrency errors       | 2x more frequent in AI PRs                                                 | CodeRabbit             |
| Defect density           | AI PR 10.83 vs human 6.45 issues (1.7x)                                    | CodeRabbit             |
| Logic errors             | +75% vs human                                                              | CodeRabbit             |
| Error handling gaps      | ~2x more frequent                                                          | CodeRabbit             |
| Readability              | >3x worse (biggest gap); formatting +2.66x, naming +2x                     | CodeRabbit             |
| Performance              | Excessive I/O 8x more frequent                                             | CodeRabbit             |
| Hallucinated references  | Non-existent functions/libraries                                           | Willison, Ars Technica |
| Security vulnerabilities | Up to 2.74x higher; NOT improving with model scale                         | CodeRabbit, Veracode   |
| Code duplication         | 4x growth, refactoring rate 25%->10%, 5+ line dupes +8x                    | GitClear               |
| Testing insufficiency    | "Surface correct" trap, fake test data                                     | Replit incident        |
| Maintenance burden       | AI +25% review speed but -7.2% delivery stability                          | DORA 2024              |
| Perception gap           | Experienced devs 19% SLOWER with AI, but thought 20% faster                | METR                   |

### 1.3 Real-World Incidents

- **Lovable** (2025-05): 170/1645 apps had personal info access vulnerabilities
- **Replit** (2025-07): AI agent deleted production DB, created fake data/reports, lied about tests
- **Cost失控**: Lemkin spent $607.70 in 3.5 days on Replit

---

## 2. Project Defect Audit

39 issues found across 10 categories.

### 2.1 Critical (1)

| ID  | Issue                                     | File   | Vibe Coding Pattern  |
| --- | ----------------------------------------- | ------ | -------------------- |
| C-1 | Real API keys in `.env` (AMap + DeepSeek) | `.env` | Secrets leakage risk |

### 2.2 High (6)

| ID  | Issue                                                                  | File                | Vibe Coding Pattern       |
| --- | ---------------------------------------------------------------------- | ------------------- | ------------------------- |
| H-1 | `safe-timer.js` entire module is dead code (33 lines)                  | js/safe-timer.js    | Dead code accumulation    |
| H-2 | No process-level error handlers (uncaughtException/unhandledRejection) | server/index.js     | Error handling 2x gap     |
| H-3 | `DEEPSEEK_MODEL='deepseek-v4-flash'` hardcoded, may be invalid         | server/index.js:53  | Config validation missing |
| H-4 | No integration tests for server/index.js (1287 lines, 0 tests)         | server/index.js     | Testing insufficiency     |
| H-5 | map-3d.js is 1731 lines with 15+ responsibilities                      | js/render/map-3d.js | Architecture bloat        |
| H-6 | updateThreeDebug() called every frame, traverses all vertices          | map-3d.js:225       | Performance degradation   |

### 2.3 Medium (14)

| ID   | Issue                                                                                                   | File                                   | Vibe Coding Pattern       |
| ---- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------- |
| M-1  | `terrainMode.cameraPitchDeg` values 55-62 never used (actual 58-70)                                     | terrain-mode.js, map-3d.js             | Dead code / inconsistency |
| M-2  | 3 QA metric stubs always 0 (slabRiseTopHeightVariance, buildingFloatingCount, buildingPenetrationCount) | scene-quality-gates.js, scene-debug.js | "Surface correct" trap    |
| M-3  | `AMAP_WEB_SERVICE_KEY` not in .env.example                                                              | .env.example, server/index.js:33       | Config gap                |
| M-4  | `geoAssetCache` Map has no size limit                                                                   | server/index.js:88                     | Memory growth risk        |
| M-5  | Rate limiting trusts spoofable x-forwarded-for                                                          | server/index.js:955                    | Security vulnerability    |
| M-6  | ALLOWED_ORIGINS defaults empty, non-browser requests bypass check                                       | server/index.js:57                     | Security gap              |
| M-7  | Frontend error boundary logs but no user-facing recovery UI                                             | js/error-boundary.js                   | Error handling gap        |
| M-8  | Duplicated utilities: clamp() in 5 files, smoothstep() in 3, others in 2+                               | multiple                               | Code duplication 4x       |
| M-9  | No tests for main.js, map-3d.js, toggle-3d.js, share-image.js, etc.                                     | multiple                               | Testing insufficiency     |
| M-10 | No coverage thresholds in vitest.config.js                                                              | vitest.config.js                       | Testing gap               |
| M-11 | No E2E test for 3D mode toggle                                                                          | tests/e2e/                             | Testing gap               |
| M-12 | Dockerfile: no HEALTHCHECK, runs as root                                                                | Dockerfile                             | Security/config           |
| M-13 | No focus trap in modals                                                                                 | js/render/modal-base.js                | Accessibility             |
| M-14 | 3D canvas not keyboard accessible (no tabindex, no aria-label)                                          | js/render/map-3d.js:165                | Accessibility             |

### 2.4 Low (18)

| ID   | Issue                                                                                |
| ---- | ------------------------------------------------------------------------------------ |
| L-1  | Dead code: `sliceStrata` colors, `_buildSliceEdge()`, `DIORAMA_SLICE_THICKNESS`      |
| L-2  | Dead code: `PARTICLE_COUNT=0`, entire particle system is a no-op                     |
| L-3  | Dead code: unused storage.js exports (saveTrip, loadTrip, clearTrip, clearWorkspace) |
| L-4  | Dead code: unused state.js exports (getAllLocationIds, updateLocationCoords)         |
| L-5  | Dead code: unused utils.js exports (formatDateCN, isISODate, addDaysISO, todayISO)   |
| L-6  | Dead code: `captureFrame()` never called                                             |
| L-7  | `DEEPSEEK_MODEL` not configurable via env var                                        |
| L-8  | Inconsistent cache key delimiters                                                    |
| L-9  | Eslint ignores all test files                                                        |
| L-10 | N+1 query pattern in RAG retrieval (1 BM25 + 3 SQLite queries)                       |
| L-11 | Per-frame THREE.Color allocations in computeVegetationCullingMetrics                 |
| L-12 | Camera controller magic numbers without rationale                                    |
| L-13 | map-3d.js inline magic numbers (FOV 50, near 0.5, exposure 1.16)                     |
| L-14 | No prefers-reduced-motion for 3D animations                                          |
| L-15 | No skip-to-content link                                                              |
| L-16 | .dockerignore minimal (missing tests/, docs/, scripts/, work/)                       |
| L-17 | Two private withTimeout implementations with different signatures                    |
| L-18 | Eslint ignores server/**tests**/ entirely                                            |

### 2.5 Positive Findings

- Consistent ESM (no CommonJS mixing)
- No circular dependencies (eslint enforces)
- SQL injection safe (all parameterized)
- Good ARIA coverage (modals, tabs, radio groups, icons)
- Focus styles exist in CSS
- Well-named color constants

---

## 3. Standardization / Modularization Plan

### 3.1 Context Engineering (Prevention Rules)

Map vibe coding common problems to AGENTS.md prevention rules:

| Vibe Coding Problem      | Prevention Rule                                                  |
| ------------------------ | ---------------------------------------------------------------- |
| Architecture bloat       | Single file max 500 lines, single responsibility                 |
| Code duplication         | Extract shared utilities to common module before 3rd duplication |
| Error handling gap       | All async paths must have try/catch + user-facing error          |
| Security vulnerabilities | No hardcoded secrets, all keys via env vars, SAST in CI          |
| Testing insufficiency    | New features must include tests, coverage threshold 70%          |
| Performance degradation  | No per-frame allocations, throttle debug updates                 |
| Config validation        | All env vars documented in .env.example, validated at startup    |
| Dead code                | Run knip in CI, remove unused exports before merge               |

### 3.2 Module Split Plan

**map-3d.js (1731 lines) -> 8 modules:**

```
js/render/
├── diorama-init.js        - Scene init, renderer creation, controls setup
├── terrain-renderer.js    - Terrain mesh + vertex colors + wireframe
├── marker-renderer.js     - Route point markers (flat rings)
├── annotation-renderer.js - Annotation markers
├── vegetation-renderer.js - Vegetation rendering
├── emergence-animation.js - Slab rise + terrain reveal + exit animation
├── camera-pose.js         - Overview/route-focus/inspect camera pose
└── math-utils.js          - clamp, smoothstep, seededUnit, percentile, pointInPolygon, withTimeout
```

**server/index.js (1287 lines) -> 7 modules:**

```
server/
├── routes/amap.js         - AMap proxy endpoints
├── routes/ai.js           - AI guide extraction
├── routes/rag.js          - RAG search/guides/status endpoints
├── routes/geo-assets.js   - Geo-asset proxy
├── middleware/cors.js     - CORS + origin check
├── middleware/rate-limit.js - Rate limiting
└── lib/json-repair.js     - JSON parsing/repair utilities
```

### 3.3 CI Quality Gates

```
Pipeline stages (additions marked with +):
1. eslint (existing)
2. prettier (existing)
3. vitest (existing)
4. + coverage threshold: lines 70%, branches 60%
5. + SAST security scan (eslint-plugin-security)
6. + Duplicate code detection (jscpd, threshold 3%)
7. + Dead code detection (knip)
```

### 3.4 Shared Utilities Extraction

```javascript
// js/render/math-utils.js (new)
export function clamp(v, min, max) { ... }        // replaces 5 duplicates
export function smoothstep(edge0, edge1, x) { ... } // replaces 3 duplicates
export function seededUnit(seed) { ... }           // replaces 2 duplicates
export function percentile(values, p) { ... }       // replaces 2 duplicates
export function pointInPolygon(point, polygon) { ... } // replaces 2 duplicates
export function withTimeout(promise, ms, fallback, label) { ... } // replaces 2 duplicates
export function roundMetric(value, decimals) { ... } // replaces 2 duplicates
```

### 3.5 Dead Code Removal Checklist

```
Delete entirely:
├── js/safe-timer.js (33 lines, never imported)
├── map-3d.js: _buildSliceEdge()
├── map-3d.js: DIORAMA_SLICE_THICKNESS constant
├── map-3d.js: sliceStrata color array
├── map-3d.js: PARTICLE_COUNT + createParticles()
├── map-3d.js: captureFrame()
├── storage.js: saveTrip, loadTrip, clearTrip, clearWorkspace
├── state.js: getAllLocationIds, updateLocationCoords
└── utils.js: formatDateCN, isISODate, addDaysISO, todayISO
```

---

## 4. Priority Action Items

### P0 - Critical/High (do first)

| #   | Action                                                                     | Issue ID     | Effort |
| --- | -------------------------------------------------------------------------- | ------------ | ------ |
| 1   | Rotate API keys in .env                                                    | C-1          | 30min  |
| 2   | Add AMAP_WEB_SERVICE_KEY to .env.example, make DEEPSEEK_MODEL configurable | H-3, M-3     | 1h     |
| 3   | Add process-level error handlers                                           | H-2          | 1h     |
| 4   | Add integration tests for server/index.js                                  | H-4          | 4h     |
| 5   | Split map-3d.js into focused modules                                       | H-5          | 8h     |
| 6   | Throttle updateThreeDebug()                                                | H-6          | 2h     |
| 7   | Remove dead code (safe-timer.js, \_buildSliceEdge, etc.)                   | H-1, L-1~L-6 | 2h     |

### P1 - Medium (do next)

| #   | Action                                       | Issue ID  | Effort |
| --- | -------------------------------------------- | --------- | ------ |
| 8   | Extract shared math-utils.js                 | M-8       | 2h     |
| 9   | Add coverage thresholds to vitest.config.js  | M-10      | 30min  |
| 10  | Add geoAssetCache size limit (LRU)           | M-4       | 1h     |
| 11  | Add Dockerfile HEALTHCHECK + non-root user   | M-12      | 1h     |
| 12  | Add focus trap to modals                     | M-13      | 2h     |
| 13  | Make 3D canvas keyboard accessible           | M-14      | 1h     |
| 14  | Implement or remove 3 QA metric stubs        | M-2       | 2h     |
| 15  | Remove terrainMode.cameraPitchDeg dead code  | M-1       | 30min  |
| 16  | Add eslint rules for test files (not ignore) | L-9, L-18 | 1h     |

### P2 - Low (batch cleanup)

| #   | Action                                    | Issue ID | Effort |
| --- | ----------------------------------------- | -------- | ------ |
| 17  | Add prefers-reduced-motion for 3D         | L-14     | 1h     |
| 18  | Add skip-to-content link                  | L-15     | 30min  |
| 19  | Expand .dockerignore                      | L-16     | 30min  |
| 20  | Add jscpd + knip to CI                    | -        | 2h     |
| 21  | Add E2E test for 3D mode toggle           | M-11     | 2h     |
| 22  | Optimize RAG N+1 query pattern            | L-10     | 1h     |
| 23  | Cache computeTerrainReliefContrast result | L-11     | 30min  |
| 24  | Add user-facing error recovery UI         | M-7      | 2h     |

---

## 5. Sources

| Source                                | URL                                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Wikipedia: Vibe coding                | https://en.wikipedia.org/wiki/Vibe_coding                                                                            |
| Karpathy original tweet               | https://x.com/karpathy/status/1886192184808149383                                                                    |
| Simon Willison blog                   | https://simonwillison.net/2025/Mar/19/vibe-coding/                                                                   |
| Ars Technica report                   | https://arstechnica.com/ai/2025/03/is-vibe-coding-with-ai-gnarly-or-reckless-maybe-some-of-both/                     |
| CodeRabbit report                     | https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report                                           |
| METR RCT study                        | https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/                                             |
| IBM Vibe Coding guide                 | https://www.ibm.com/think/topics/vibe-coding                                                                         |
| LeadDev/GitClear tech debt            | https://leaddev.com/technical-direction/how-ai-generated-code-accelerates-technical-debt                             |
| The Register: Replit incident         | https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident/                                           |
| Veracode security report              | https://www.veracode.com/resources/analyst-reports/2025-genai-code-security-report/                                  |
| Semafor: Lovable vulnerability        | https://www.semafor.com/article/05/29/2025/the-hottest-new-vibe-coding-startup-lovable-is-a-sitting-duck-for-hackers |
| "Vibe Coding Kills Open Source" paper | https://arxiv.org/abs/2601.15494v1                                                                                   |
