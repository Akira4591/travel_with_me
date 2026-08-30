# Codex Blackboard

## Current Task Goal

Keep the active product 2D-only, enforce a non-regressing archive boundary around the frozen 3D implementation, and harden the confirmed 2D data/import/async flows.

## Constraints

- Do not modify global Codex configuration or install hooks.
- Preserve untracked `data/` and `test-tmp-integration/` until ownership is known.
- Keep archived 3D source available for history, but never reconnect it to the 2D entry point, default tests, dependencies, UI, or BFF routes.
- Verify every product change with automated evidence.

## Known Evidence

- Active branch: `codex/2d-isolation-hardening`, created from local `main` at `6b43c1c`.
- `scripts/check-2d-runtime-boundary.mjs` recursively scans the active `js/main.js` import graph and checks HTML, CSS, package, server, Docker, E2E, and quality-gate surfaces.
- The production server serves 37 explicitly approved 2D browser modules; 73 inactive JavaScript files are sealed behind the HTTP allowlist. The active server package retains the 2D SQLite/BM25 guide-import RAG modules.
- The production Docker stage is assembled from a 46-file allowlist instead of copying the repository tree.
- Default lint, formatting, renderer-boundary, encoding, unit, and E2E gates are routed through the active 2D manifests; archived 3D tests require the explicit `@archived-3d` tag.
- Data protections cover semantic deletion during normalization, shared-trip collisions/full workspaces, durable-storage failures, import shape validation, bounded guide days, cancellation, city-aware geocoding, and trip-owned async coordinate results.
- Bulk guide import emits one render-driving state change; stale search/reverse-geocode responses are ignored.
- The route-card keyboard E2E now models a multi-marker fit center and passed 10 concurrent repeats; it no longer mistakes the preceding single-marker animation for route activation.
- Latest gates: `npm run check` passed across 92 active quality files; `npm test` passed with 17 files / 163 tests; full 2D E2E passed with 17 executed and 13 viewport-inapplicable instances skipped; guide-import evaluation and `npm audit --audit-level=high` passed.
- Node support and CI use Node 22.22.1; CI runs the complete 2D architecture check and default Playwright suite.
- Browser review passed at 1440x900 and 390x844: nonblank 2D map/list rendering, no 3D DOM, visible mobile live status, modal focus/background isolation, and no console warnings/errors.
- `npm audit` reports zero known vulnerabilities after compatible Hono and transitive dependency updates.

## Risks

- Archived 3D source and historical documents intentionally remain in the repository; they are not served or included in the production image.
- Old persisted `annotations`/`geoAssets` fields are preserved as opaque compatibility data so a 2D save does not destroy archived user data.
- Live AMap/DeepSeek behavior still depends on external credentials and providers; browser smoke uses deterministic mocks.
- A real Docker image build remains blocked before source transfer because Docker Hub metadata retrieval returns `unexpected EOF`; the local allowlist assembly and Docker contract gate passed.
- Credentialed AMap smoke is pending because the three AMap environment variables are absent locally.
- Fetched `origin/main` at `c568aa4` has been reconciled locally. Its RAG/BM25 capability and documentation layout were retained; its 3D runtime remained sealed.
- `data/` and `test-tmp-integration/` remain untracked and untouched.

## Next Queue

- Complete final Git review and publish only after explicit approval.
- Treat any future 3D revival as a separate entry point, package, service surface, and verification pipeline.
