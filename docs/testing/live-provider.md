# Live Provider Smoke

Live provider checks are explicit opt-in only. Default CI and local regression commands must use fixtures, mocks, or local fallback data.

## Local Command

```powershell
npm.cmd run test:e2e:live-provider
```

The script sets `LIVE_PROVIDER=1` and runs only tests tagged `@live-provider`.

Required local environment variables:

- `AMAP_JS_KEY`
- `AMAP_JSCODE`
- `AMAP_WEB_SERVICE_KEY`

Optional:

- `DEEPSEEK_API_KEY`

## CI Policy

Default CI must not run live provider tests. The only approved CI path is the manual GitHub Actions workflow:

```text
.github/workflows/live-provider-smoke.yml
```

The workflow uses `workflow_dispatch`, a protected `live-provider` environment, repository/environment secrets, and a concurrency group. Provider failures caused by expired certificates, rate limits, quota, upstream outages, or regional network instability are release signals, not default regression failures.

## Rules

- Do not commit real keys.
- Do not expose server-only keys to browser code.
- Do not silently fall back from fixture tests to live providers.
- Do not add live provider tests without the `@live-provider` tag.
- Do not make live provider success a prerequisite for ordinary pull-request checks.
