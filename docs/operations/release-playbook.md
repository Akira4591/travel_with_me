# Release Playbook

> **辅助文件** | 权威开发文档: [DEVELOPMENT.md](../../DEVELOPMENT.md)

## Deployment contract

- Runtime: Node.js 18+ using `npm start`.
- Health probe: `GET /healthz` must return `200` and `status: ok`.
- Readiness probe: `GET /readyz` must return `200` and `status: ready` before traffic is shifted.
- Required environment: `AMAP_JSCODE`, `AMAP_WEB_SERVICE_KEY`.
- Optional environment: `DEEPSEEK_API_KEY`, `DEEPSEEK_TIMEOUT_MS`, `ALLOWED_ORIGINS`, `ELEVATION_*`, `GEO_ASSETS_*`.

## Release gate

1. Run `npm run check`, `npm test`, and `npm run test:e2e` on the candidate commit.
2. Build and start the container or platform preview with production environment variables.
3. Check `/healthz` and `/readyz`; do not expose the preview to users on a degraded readiness result.
4. Verify map load, POI search, one real route, 3D entry, 2D exit, and share-image preview on desktop.
5. Confirm browser source does not contain Web Service or AI secret values.
6. For 3D-related releases, run or attach the maintained ROI visual baselines for foundation rise, carved geography, route highlight, building massing/dissolve, and route focus. Route hash and endpoints must match the persisted 2D route.
7. Attach `window.__threeDebug__.qa` evidence for any 3D visual release candidate once the Alpha visual baseline gate is active.

## Canary and rollback

1. Deploy as a preview/canary revision and send only internal traffic first.
2. Observe 15 minutes of request failures, BFF upstream failures, AI failures, and readiness status.
3. Promote only when route planning and 3D entry have no release-blocking errors.
4. On regression, immediately shift traffic to the previous healthy revision; do not edit secrets or data in-place during rollback.
5. Record the failed revision, health response, browser console context, and affected endpoint before retrying.

## Operational signals

- `/healthz` availability.
- `/readyz` dependency state.
- HTTP 4xx/5xx rate on `/_AMapService/*`, `/_ai/*`, `/_elevation`, and `/_geo-assets`.
- Rate-limit events and BFF upstream failures.
- Browser-side global error-boundary events.
- 3D `window.__threeDebug__.qa` geometry, budget, provenance, and layer metrics.
