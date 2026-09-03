# 2D Release Playbook

This playbook applies only to the active 2D product. Archived 3D code and historical Gate50
evidence are outside the release boundary.

## Candidate contract

A release candidate is one exact 40-character Git commit on a named branch. Before any evidence
can authorize release, the candidate must be clean, frozen, reviewed for its full change scope,
and paired with a verified rollback revision. Any later change invalidates the evidence and
authorization and returns the decision to `HOLD`.

The machine-readable manifest is authoritative. Its seven required layers are:

1. local automation;
2. CI on Node.js `22.22.1`;
3. credentialed AMap LIVE_E2E;
4. credentialed DeepSeek LIVE_E2E;
5. actual container build plus `/healthz` and `/readyz`;
6. named human review at `1280x800`, `1440x900`, `1920x1080`, and `390x844`;
7. explicit release authorization.

Allowed statuses are `PASS`, `FAIL`, `BLOCKED`, and `NOT_RUN`. Missing, skipped, fixture, mock,
stale, or commit-mismatched evidence cannot be `PASS`. A human acknowledgement cannot replace
technical evidence. AMap and DeepSeek are always recorded separately. Manifests and review packets
must not contain credentials.

## Commands

Run from a clean checkout of the candidate:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run test:guide-import
npm.cmd audit --audit-level=high
npm.cmd run test:e2e
```

Use the default CI workflow for the Node.js `22.22.1` result. Run the manual live-provider workflow
and retain distinct AMap and DeepSeek job artifacts. Do not convert a missing secret or skipped job
to a pass.

Build the exact candidate image, start it with the production environment, and require both:

- `GET /healthz` -> HTTP `200`, `status: ok`;
- `GET /readyz` -> HTTP `200`, `status: ready`.

Validate and render the same manifest with:

```powershell
npm.cmd run release:evidence:check -- work/release/current-manifest.json
npm.cmd run release:review -- work/release/current-manifest.json work/release/review.html
```

The generated review is read-only and cannot alter the candidate or its evidence.

## Closure and rollback

Every unresolved row records its reason, responsible role, required evidence or action, rollback
point, and closure condition. Release remains disabled until all seven layers are `PASS`, the
candidate is clean and frozen, the rollback revision is verified, and authorization names the
same exact commit.

On regression, shift traffic to the verified rollback revision. Record the failed revision,
health and readiness responses, browser console context, and affected 2D endpoint before another
candidate is formed. This playbook does not authorize automatic retry, push, deployment, secret
rotation, or release.
