# Observability Implementation Status

## Source baseline

- Branch built from local latest available baseline SHA: `f7d049825eb17922e9fa0c47326620e26a396186`.
- Remote `origin` was not configured in this container, so `git fetch origin main` / `git pull --rebase origin main` could not be completed here.
- Open/stale PR #91 was attempted via the GitHub API and returned `404 Not Found` without repository credentials, so no PR #91 code was copied.
- This rebuild was implemented from the current tree only.

## What was rebuilt

- Production-safe health service in `server/services/healthcheck.ts`.
- Safe observability/redaction helpers in `server/services/observability.ts`.
- Express health routes in `server/routers/healthRouter.ts`.
- Request ID + safe request logging middleware in `server/middleware/requestLogger.ts`.
- Server wiring in `server/_core/index.ts`.
- Regression tests in `server/healthcheck.test.ts` and `server/observability.test.ts`.

## What was not copied

- No stale PR #80/#91 code was copied blindly.
- No migrations were added or edited.
- `drizzle/schema.ts` and `drizzle/*.sql` were not modified.
- No stock, reservation, payment lifecycle, Rx/H1 release, compliance, or provider connector mutation behavior was changed.
- No alerting/telemetry integration is claimed; alerting remains a separate production follow-up.

## Endpoints

Public minimal liveness:

- `GET /healthz`
- `GET /api/healthz`

Public-safe readiness:

- `GET /readyz`
- `GET /api/readyz`

Protected detailed health:

- `GET /api/health`
- `GET /api/admin/health`

## Public vs protected behavior

- Public liveness only reports process liveness and request ID support.
- Public readiness only reports coarse component statuses for app, database, and migrations.
- Detailed health fails closed in production unless `HEALTHCHECK_INTERNAL_TOKEN` is configured and supplied via `x-healthcheck-token`, `x-internal-health-token`, or bearer authorization.
- Detailed health is allowed in non-production without the internal token for local/staging debugging.

## Provider status behavior

Provider status values are honest and do not claim external health from environment variables alone:

- `healthy` is reserved for real successful checks.
- `configured` means required configuration exists but no external ping was performed.
- `not_configured` means required configuration is absent.
- `disabled` means an explicit feature flag disables the provider.
- `degraded`, `unhealthy`, and `unknown` are used for real failure/uncertainty states.

Providers covered:

- Razorpay/payment
- Payment webhook
- WhatsApp
- SMS
- OTP
- OCR
- Printer
- Storage/S3
- Tally/ERP/export
- Maps/geocoding

## Worker status behavior

Worker health is read-only. It collects in-memory queue stats and, when a DB is available, read-only DB counters for pending, dead-letter, and stale running jobs. It never reserves, processes, retries, or dead-letters jobs.

## Stock/reservation sanity behavior

Stock/reservation sanity is read-only. It counts negative stock and expired active reservations when a DB is available. It does not mutate stock, release reservations, expire reservations, or correct data.

## Redaction behavior

The redaction helper removes or masks:

- OTP codes
- Passwords
- Cookies
- Bearer tokens
- Session tokens
- API keys
- Razorpay/payment secrets and signatures
- WhatsApp tokens
- AWS keys
- DB URLs
- Prescription images/base64/blob-like content
- Medical notes
- Raw customer phone/email values

## Remaining gaps

- Alerting is not wired in this PR.
- External provider pings are not performed unless a safe existing ping is introduced later; therefore configured providers are not marked `healthy`.
- DB-backed proof depends on a valid runtime `DATABASE_URL` / test database. In this container, DB checks degrade safely when no DB is available.
- Latest GitHub main and PR #91 could not be authenticated from this container because no `origin` remote or GitHub credentials were available.

## Validation results

See PR body and final response for command-by-command validation results.

## Production limitations

- Configure `HEALTHCHECK_INTERNAL_TOKEN` before using detailed health in production.
- Wire alerts separately for readiness degradation, DB failure, dead-letter growth, stale worker jobs, negative stock, and expired active reservations.
- Do not treat provider `configured` as provider `healthy`.

## Validation command results

- `pnpm install`: passed; pnpm warned that build scripts for `@tailwindcss/oxide` and `esbuild` were ignored pending `pnpm approve-builds`.
- `pnpm run check`: passed.
- `pnpm test -- --runInBand`: passed with `86 passed | 1 skipped` test files and `503 passed | 1 skipped` tests; MySQL lifecycle DB integration skipped because `TEST_DATABASE_URL` is not set.
- `pnpm run build`: passed; Vite warned that analytics placeholders are not defined and that some chunks exceed 500 kB.
- `node scripts/verify-migrations.mjs`: passed with `0 blocking issue(s), 0 warning(s)`, latest migration `0048`.
- `node scripts/ci-governance-guards.mjs all`: failed with four findings outside this PR scope: one pre-existing scanner fixture provider-risk in `scripts/check-runtime-placeholders.mjs`, and three pre-existing stock mutation regex findings in `server/services/stockTruthCertification.ts`.
- `git diff --check`: passed.
