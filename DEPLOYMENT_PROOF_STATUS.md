# Deployment Proof Status

## Deployment prerequisites

Before any multi-store beta or production claim, operators must collect evidence for the following prerequisites:

1. A clean build from the current branch using `pnpm run build`.
2. TypeScript validation using `pnpm run check`.
3. Script and application tests using `pnpm test -- --runInBand`.
4. Static migration verification using `pnpm run migrations:verify`.
5. Environment posture validation using `pnpm run env:validate -- --mode production` with real production secrets supplied by the deployment platform, not by the repository.
6. A backup dry-run and restore drill dry-run from the exact database endpoint family that will be promoted.
7. A generated release-gate report from `pnpm run release:gate -- --mode production`.

## Environment matrix

| Category | Test / CI mode | Production mode |
| --- | --- | --- |
| Runtime mode | Advisory; `--mode test` does not require production secrets. | `NODE_ENV=production` and `APP_ENV=production` must be explicit. |
| Database URL | Presence is advisory in test mode. | `DATABASE_URL` is required and must not look like localhost, demo, example, or test unless `ALLOW_PRODUCTION_LOCAL_DATABASE=true` is deliberately set. |
| Session/JWT secrets | Missing values are warnings in test mode. | `JWT_SECRET` plus `SESSION_SECRET` or `COOKIE_SECRET` must be present and strong. |
| Payment | Missing Razorpay credentials are warnings in test mode. | Razorpay key id, secret, and webhook secret are blocking requirements. |
| Communications | Missing WhatsApp/SMS/email posture is advisory in test mode. | At least one outbound provider posture must be configured before production notification claims. |
| Object storage | Missing posture is advisory in test mode. | Object storage endpoint and credential posture are blocking requirements. |
| OCR | Not blocking when production OCR is disabled. | If `OCR_PRODUCTION_ENABLED=true`, OCR provider credentials or endpoint are required. |
| CORS | Wildcards are tolerated outside production only. | Wildcard or missing allowed origins are blocking. |
| Admin health/auth | Missing posture is advisory in test mode. | Strong admin health token, worker admin token, or admin auth provider is required. |
| Encryption | Missing posture is advisory in test mode. | Strong encryption key material is required. |
| Demo/test flags | Allowed only outside production. | Demo, mock, seed-demo, or auth-bypass flags are blocking. |

## Release-gate command

Use the safe CI/test mode gate when production secrets are unavailable:

```bash
pnpm run release:gate -- --mode test
```

Use production mode only in a protected deployment environment where real secret values are injected by the platform:

```bash
pnpm run release:gate -- --mode production
```

The gate writes `tmp/artifacts/RELEASE_GATE_REPORT.md` and exits nonzero for blocking failures.

## CI usage

CI includes an advisory release-gate job that runs migration verification and the release gate in test mode. It intentionally does not require production secrets. Production-mode validation remains a deployment-environment responsibility.

## Known limitations

- The release gate references build and full test commands but does not run them inline, so CI and release runbooks must preserve separate build/test evidence.
- Environment validation proves posture only from variable presence, strength, and safety patterns; it does not call external providers.
- Migration verification is static and does not apply migrations.
- Backup and restore scripts default to dry-run command generation and safety checks; successful backup/restore evidence requires executing the generated commands in controlled infrastructure.
