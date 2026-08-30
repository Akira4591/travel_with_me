# Codex Verification Log

Use this file to record verification for meaningful project changes. Keep entries short, factual, and tied to commands, screenshots, or file checks.

## Entry Template

### YYYY-MM-DD - Task Name

**Expected Observation**

- What should be true before running the command, opening the page, checking the file, or taking the screenshot.

**Actual Result**

- What actually happened.

**Deviation / Surprise**

- Any difference from expectation, unexpected warning, failed command, visual mismatch, or untrusted data issue.

**Verification Command**

```powershell
# command, test, screenshot path, or file inspection used for verification
```

**Residual Risk**

- Remaining uncertainty, untested edge case, external dependency risk, or manual review item.

## Log

### 2026-08-30 - Close the active 2D branch

**Expected Observation**

- The flaky keyboard route test should distinguish event focus from route fitting without retries or product-code fallbacks.
- Node support, CI, live-provider workflow, README, and the active roadmap should match the 2D-only runtime.

**Actual Result**

- The AMap mock now computes the center of all fitted markers; the keyboard route test passed 10 concurrent repeats.
- Node and CI now target 22.22.1, CI runs the full 2D check and default Playwright suite, and the live-provider workflow only exposes its implemented AMap target.
- Remote `main@c568aa4` was reconciled locally. Its SQLite/BM25 guide-import RAG remains active and tested; its 3D code and tests remain outside the default runtime and gates.
- `npm run check`, 163 tests in 17 files, 12 guide-import evaluation cases, the zero-vulnerability audit, and the full 2D E2E suite passed. E2E executed 17 applicable cases and skipped 13 viewport-inapplicable instances.

**Deviation / Surprise**

- Docker reached the daemon but could not read Node 22 base-image metadata because the Docker Hub connection returned `unexpected EOF`; no source build step ran.
- Credentialed live-provider smoke could not run because the three required AMap variables are absent.
- The remote merge introduced an untagged 3D Playwright file; the default runner now selects the explicit active 2D smoke file, and the architecture gate enforces that selection.

**Verification Command**

```powershell
npx playwright test tests/e2e/smoke.spec.js --grep "desktop keyboard activates itinerary and route map links" --project=chromium --repeat-each=10 --reporter=line
npm run check
npm test
npm run test:guide-import
npm audit --audit-level=high
npm run test:e2e -- --reporter=line
docker build --tag travel-with-me:2d-closure .
```

**Residual Risk**

- Docker and credentialed AMap verification remain external gates.
- Local verification used Node 24.15.0; CI remains responsible for the exact Node 22.22.1 run.

### 2026-08-12 - Seal 3D and harden the 2D product

**Expected Observation**

- The active startup graph, UI, dependency manifest, default gates, and BFF expose no 3D runtime.
- Confirmed 2D data-loss, unbounded-import, persistence, cancellation, city, and async-ownership defects have regression coverage.

**Actual Result**

- Added a recursive 2D runtime boundary gate and browser boundary test; the server now serves 37 approved modules and rejects 63 inactive JavaScript files.
- Added a 46-file production assembly allowlist and multi-stage Docker runtime; default formatting, lint, renderer, encoding, unit, and E2E gates now use the active 2D manifests.
- Added regression coverage and fixes for shared-trip overwrite, semantic normalization deletion, localStorage recovery failures, invalid import/coordinate shapes, duplicate IDs, day caps, guide cancellation, city-aware geocoding, trip-owned async writes, stale search results, batched imports, keyboard cards, mobile live status, and stacked-modal focus isolation.
- `npm run check` passed; `npm test` passed with 12 files and 98 tests; default E2E passed with 17 executed and 13 viewport-inapplicable instances skipped.
- Browser review at 1440x900 and 390x844 found a nonblank 2D map/list, visible mobile status, correct modal focus restoration, no 3D DOM, and no console warnings/errors.
- `npm audit` passed with zero known vulnerabilities after updating Hono, the Node adapter, and four transitive development packages without running lifecycle scripts.

**Deviation / Surprise**

- The original bare-word `3D` exclusion also removed the new negative isolation test; explicit `@archived-3d` tagging now keeps the isolation test in the default suite.
- A new stacked-modal regression exposed focus falling back to `body` after the AI preview re-rendered; the top-modal keyboard guard and focus restoration were corrected before final verification.

**Verification Command**

```powershell
npm run check
npm test
npx playwright test tests/e2e/smoke.spec.js --grep "2D runtime does not load or expose archived 3D surfaces"
npx playwright test tests/e2e/smoke.spec.js --grep "loads the trip planner shell|mobile can switch|desktop can open share"
npm run test:e2e -- --reporter=line
npm audit --json
git diff --check
```

**Residual Risk**

- Live provider behavior was not exercised. Dockerfile behavior passed static and local assembly checks, but a real image build was blocked by a registry `unexpected EOF`.

### 2026-07-22 - Refresh Codex project summary

**Expected Observation**

- The blackboard reflects the current `main` checkout, the isolated feature-branch commit, latest verification results, and known runtime artifacts.
- No product code or untracked runtime output is modified.

**Actual Result**

- Updated `work/codex-blackboard.md` with current branch, commit, summary-bar behavior, tests, risks, and next queue.
- Current checkout remains `main` at `6f8bda3`; `data/` and `test-tmp-integration/` remain untracked and untouched.

**Deviation / Surprise**

- Full E2E smoke previously exposed one whitespace-sensitive assertion and Overpass network resets; the corrected targeted test passed.

**Verification Command**

```powershell
git status --short --branch
git log --oneline --decorate -2
Get-Content -Raw work/codex-blackboard.md
```

**Residual Risk**

- The feature-branch summary-bar change is not merged into `main`, and the generated runtime directories still need ownership review.

### 2026-06-24 - Enable Codex SAPIEN-Lite local workflow

**Expected Observation**

- `AGENTS.md` exists with a `Codex Workflow` section.
- `work/codex-blackboard.md`, `work/codex-verification-log.md`, and `work/codex-evaluation-harness.md` exist with their required structures.
- No global configuration, hooks, or long-term memory files are modified.

**Actual Result**

- All four files exist.
- Required sections were found with `Select-String`.
- `git status --short` shows only `AGENTS.md` and `work/` as new repository-local changes.

**Deviation / Surprise**

- None.

**Verification Command**

```powershell
Test-Path AGENTS.md
Test-Path work/codex-blackboard.md
Test-Path work/codex-verification-log.md
Test-Path work/codex-evaluation-harness.md
Select-String -Path AGENTS.md,work/codex-*.md -Pattern "Codex Workflow|Current Task Goal|Expected Observation|Task Category"
git status --short
```

**Residual Risk**

- The workflow only helps if future tasks actively keep the blackboard and verification log current.
