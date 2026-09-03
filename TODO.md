# Travel With Me Roadmap

Last updated: 2026-08-30

The active product is 2D-only. Historical 3D work is frozen under `archive/3d/` and is not part of this backlog.

## Current Stage

2D stability and data-integrity closure before review and release preparation.

## Closure Gates

- Keep `npm run check`, `npm test`, `npm run test:guide-import`, `npm run test:e2e`, and `npm audit --audit-level=high` green on Node.js 22.22.1 or newer.
- Keep the active browser import graph, server allowlist, production image, default tests, dependencies, and UI free of 3D runtime code.
- Complete one credentialed AMap live-provider smoke and one real Docker image build before release approval.
- Reconcile this branch with current remote `main`, then review and stage only product-owned files. Exclude runtime databases and integration-test output.

## Deferred Product Work

- Cloud sync and account ownership.
- Provider quotas, monitoring, and operational alerts.
- Real-user desktop acceptance and mobile compatibility review.

Any 3D revival requires a separate entry point, dependency surface, service boundary, test pipeline, and explicit product decision.
