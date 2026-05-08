# Observability Implementation Status

Date: 2026-05-08
Branch: `feat/healthchecks-observability`

## Summary

This PR adds a minimal observability foundation focused on safe health reporting and structured log redaction. It does not change pharmacy business logic, stock/reservation mutation behavior, payment lifecycle behavior, or provider connector behavior.

## Healthcheck routes/services added

- `server/services/healthcheck.ts`
  - `createLivenessReport()` for minimal public liveness.
  - `createHealthReport()` for readiness/admin health composition.
  - `readinessSummary()` for public-safe readiness output.
- `server/routers/healthRouter.ts`
  - Registers public liveness/readiness routes and protected admin health routes.
- Existing server bootstrap now calls `registerHealthRoutes(app)` and uses request logging middleware.

## Endpoint behavior

Public/minimal:

- `GET /healthz`
- `GET /api/healthz`

Public readiness summary:

- `GET /readyz`
- `GET /api/readyz`
- `GET /api/health` (kept for compatibility with the prior health endpoint)

Protected detailed health:

- `GET /admin/health`
- `GET /api/admin/health`

Admin health authorization:

- In production, a configured `ADMIN_HEALTH_TOKEN` or `WORKER_ADMIN_TOKEN` is required.
- Accepted headers are `Authorization: Bearer <token>` or `x-admin-health-token: <token>`.
- In non-production, detailed health is available without this token to support local validation.

## Checks implemented

All component statuses use only these explicit values:

- `healthy`
- `degraded`
- `unhealthy`
- `not_configured`
- `disabled`
- `unknown`

Implemented components:

- App process liveness and uptime.
- DB connectivity through a lightweight `select 1` query with latency.
- Migration tracking smoke query against `__drizzle_migrations` when present.
- Object storage configuration status.
- Razorpay/payment and payment webhook configuration status.
- WhatsApp provider configuration status.
- SMS provider configuration status.
- OTP provider and rate-limit backend configuration status.
- OCR provider configuration status.
- Printer provider configuration status.
- Tally/ERP/export configuration status.
- Maps/geocoding configuration status.
- Worker trigger configuration status.
- OCR queue backlog count when the `ocr_jobs` table is queryable.
- Negative stock sanity count from `store_skus`.
- Active and expired active reservation counts from `stock_reservations`.

## Provider config behavior

Provider checks are read-only configuration checks. They do not call external APIs and therefore do not claim providers are healthy solely because credentials exist.

- Disabled providers report `disabled`.
- Enabled providers with missing required env names report `not_configured` and list missing variable names only.
- Enabled providers with required config present report `degraded` with `configuration present; external ping not performed`.
- Secret values are never included in responses.

## DB/migration behavior

DB health:

- Uses a lightweight read-only `select 1 as ok` query.
- Returns `unhealthy` if the DB object is missing or the query fails.
- Includes latency in milliseconds when a query is attempted.
- Does not include `DATABASE_URL` or credentials.

Migration health:

- Detects the latest local SQL migration filename when the `drizzle` directory is readable.
- Performs a smoke query against `__drizzle_migrations` if DB is available.
- Reports `unknown` if the migration table is unavailable.
- Reports `degraded` when local migration files exist and the migration table can be queried, because the current schema does not expose a reliable filename-to-applied-version comparison.

## Worker/cron behavior

Worker health reports trigger configuration only:

- `disabled` if `WORKER_DISABLED` is enabled.
- `unknown` if a cron/admin token is configured, because durable last-run heartbeat storage does not exist yet.
- `not_configured` if worker trigger auth is missing.

Queue health checks the OCR queue table only when DB access is available. No worker business logic was added or changed.

## Stock/reservation sanity behavior

Stock and reservation sanity checks are read-only:

- Negative `stockQty` or `softLockedQty` rows are counted from `store_skus`.
- Active reservations and expired active reservations are counted from `stock_reservations`.
- No stock is mutated.
- No reservations are released, expired, or fixed automatically.

## Logging/redaction behavior

- `server/services/observability.ts` adds structured log helpers.
- `server/middleware/requestLogger.ts` emits completion logs with request ID, route, actor ID, store ID, duration, status, and error fields when available.
- The logger redacts OTP/code fields, auth cookies/tokens, API keys, secrets, payment signatures, prescription image/base64 values, raw payloads, and medical payload fields.

## Files changed

- `server/services/healthcheck.ts`
- `server/services/observability.ts`
- `server/middleware/requestLogger.ts`
- `server/routers/healthRouter.ts`
- `server/_core/index.ts`
- `server/healthcheck.test.ts`
- `server/observability.test.ts`
- `OBSERVABILITY_IMPLEMENTATION_STATUS.md`
- `PRODUCTION_HEALTHCHECK_STATUS.md`

## Validation results

Validation commands requested for this PR:

- `pnpm install`
- `pnpm run check`
- `pnpm test -- --runInBand`
- `pnpm run build`
- `git diff --check`

See final PR notes for the exact results from this branch.

## Remaining risks

### P0

- None known from this observability-only change.

### P1

- Detailed admin health depends on correctly setting `ADMIN_HEALTH_TOKEN` or `WORKER_ADMIN_TOKEN` in production.
- Migration comparison is a smoke check only; exact applied-file matching needs a durable migration version contract.
- Worker health cannot report last successful run until durable heartbeat storage exists.

### P2

- External provider checks intentionally do not ping providers; a future explicitly safe provider-status contract can improve signal.
- Queue backlog currently covers OCR jobs only because no broader queue abstraction was found.
