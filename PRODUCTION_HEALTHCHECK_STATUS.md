# Production Healthcheck Status — Wave 0 Prompt 3

## Component status matrix

| Component | Endpoint visibility | Probe type | Status behavior | Production note |
|---|---:|---|---|---|
| App runtime | liveness/readiness/admin | In-process | `healthy` when process responds | Does not prove dependencies are ready. |
| Database | readiness/admin | `select 1` read-only probe | `healthy`, `degraded`, or `not_configured` | No writes or migrations are performed. |
| Migrations | readiness/admin | Read-only metadata-table visibility check | `healthy` or `unknown` | `unknown` requires operator review; healthcheck never runs migrations. |
| Object storage | readiness/admin | Provider contract/env configuration summary | `healthy`, `not_configured`, `disabled`, or `unknown` | Does not call live storage APIs. |
| Payments | readiness/admin | Provider contract/env configuration summary | `healthy`, `not_configured`, `disabled`, or `unknown` | `provider_unconfigured` is not treated as success. |
| WhatsApp/SMS/email | readiness/admin | Provider contract/env configuration summary | `healthy`, `not_configured`, `disabled`, or `unknown` | No live send is attempted. |
| OCR | readiness/admin | Provider contract/env configuration summary | `healthy`, `not_configured`, `disabled`, or `unknown` | No live OCR call is attempted. |
| Worker/OCR queue | readiness/admin | Read-only queue-table counters | `healthy` or `unknown` | Requires `ocr_jobs` visibility. |
| Stock sanity | readiness/admin | Read-only anomaly counters | `healthy`, `degraded`, or `unknown` | Negative stock/batch and reservation-over-available anomalies are counted when queryable. |
| Reservation sanity | readiness/admin | Read-only anomaly counters | `healthy`, `degraded`, or `unknown` | Expired active reservations and missing references are counted when queryable. |

Allowed health status values are `healthy`, `degraded`, `unhealthy`, `not_configured`, `disabled`, and `unknown`.

## Load balancer usage

- Use `GET /healthz` or `GET /api/healthz` for liveness only.
- Use `GET /readyz` or `GET /api/readyz` for readiness before sending traffic.
- `GET /api/health` is retained as a readiness-compatible API health route for existing monitors.
- Do not use `/admin/health` as a public load balancer target because it is protected and intended for operators.

Recommended behavior:

1. Restart or replace instances only when `/healthz` fails repeatedly.
2. Remove an instance from service when `/readyz` returns `503` or repeatedly reports a critical dependency as degraded/unhealthy.
3. Treat `not_configured` provider states as launch blockers for the provider-dependent feature, not as proof the feature is production ready.

## Admin health usage

- Use `GET /admin/health` or `GET /api/admin/health` for operator checks.
- In production, configure `ADMIN_HEALTH_TOKEN` or `HEALTHCHECK_ADMIN_TOKEN`.
- Send the token via `x-admin-health-token`, `x-healthcheck-token`, or `Authorization: Bearer <token>`.
- If no token is configured in production, admin health fails closed with `admin_health_token_not_configured`.
- Admin health still never exposes secrets, environment values, DB URLs, provider credentials, customer data, order data, prescription payloads, or raw file data.

## What remains before multi-store production

- Replace the token-only admin health guard with existing admin auth/RBAC when an Express-compatible guard is available.
- Establish production alert thresholds for database, queue, stock anomaly, and reservation anomaly degradation.
- Add operational dashboards for request IDs, route latency, error rates, store-level degradation, and provider configuration drift.
- Validate migration-table naming against the deployed migration runner.
- Validate stock and reservation query assumptions against the production schema after each schema-changing release.
- Confirm load balancer and uptime monitor configuration in staging before enabling in production.

## Scope statement

This PR adds read-only observability and healthchecks only; it does not change commercial, stock, payment, prescription, or compliance lifecycle behavior.
