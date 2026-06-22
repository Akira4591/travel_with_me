# Working Tree Inventory - 2026-06-22

## Baseline

- Branch: `s2-6-3d-annotations-refactor`
- Status records: 98
- Current phase: desktop Web 3D quality-proof convergence
- Latest verified gate set:
  - `npm.cmd run check`
  - `npm.cmd test`
  - `npm.cmd run check:encoding`
  - `npm.cmd run check:architecture`
  - `npx.cmd playwright test tests/e2e/smoke.spec.js --project=chromium`

## Risk

The current worktree mixes code, tests, documentation consolidation, deleted historical docs, and new quality-gate files. This is acceptable during active restructuring, but it is not safe for commercial-quality visual baseline work unless changes are reviewed and committed by concern.

## Review Buckets

Use these buckets for the next commits or PR review:

| Bucket                       | Examples                                                            | Review rule                            |
| ---------------------------- | ------------------------------------------------------------------- | -------------------------------------- |
| Runtime code                 | `js/**`, `server/**`, `css/**`, `index.html`                        | Must pass unit and E2E tests           |
| Tests and gates              | `js/__tests__/**`, `tests/**`, `scripts/**`, `playwright.config.js` | Must be deterministic by default       |
| Documentation                | `README.md`, `TODO.md`, `ARCHITECTURE.md`, `docs/**`                | Must preserve one owner per decision   |
| Historical cleanup           | deleted obsolete docs and merged context files                      | Verify replacement documents exist     |
| Generated or local artifacts | screenshots, reports, runtime outputs                               | Must be ignored or explicitly reviewed |

## Commercialization Rule

Do not add screenshot baselines or live-provider output files to this worktree without first assigning them to a fixture or artifact bucket. Visual QA files must be reproducible from local fixtures.
