# Production Healthcheck Status

Date: 2026-05-08

## Exact endpoints

| Endpoint | Exposure | Purpose | Response detail |
| --- | --- | --- | --- |
| `GET /healthz` | Public | Basic liveness | App process only |
| `GET /api/healthz` | Public | Basic liveness alias | App process only |
| `GET /readyz` | Public/internal LB safe | Readiness summary | App, DB, migrations |
| `GET /api/readyz` | Public/internal LB safe | Readiness summary alias | App, DB, migrations |
| `GET /api/health` | Compatibility | Readiness summary replacing previous basic route | App, DB, migrations |
| `GET /admin/health` | Protected | Detailed operator health | DB, migrations, storage, providers, worker, queue, stock, reservations |
| `GET /api/admin/health` | Protected | Detailed operator health alias | DB, migrations, storage, providers, worker, queue, stock, reservations |

## Expected statuses

All health components return one of:

- `healthy`
- `degraded`
- `unhealthy`
- `not_configured`
- `disabled`
- `unknown`

Expected production interpretation:

- `healthy`: A local/read-only check passed.
- `degraded`: Configuration or local state exists, but live external health is not proven or a non-fatal sanity issue exists.
- `unhealthy`: A required local dependency failed, for example DB connectivity.
- `not_configured`: A provider/worker is enabled or expected but required configuration names are missing.
- `disabled`: A provider/worker is explicitly disabled.
- `unknown`: The code could not safely determine health without additional durable state or contracts.

## What must be wired before production

Required before production launch:

- Set a production `ADMIN_HEALTH_TOKEN` or `WORKER_ADMIN_TOKEN` so detailed health endpoints are protected.
- Configure load balancers to use `/healthz` for liveness and `/readyz` or `/api/readyz` for readiness.
- Ensure DB migrations run before application rollout.
- Confirm `DATABASE_URL` is set and not exposed in logs or health output.
- Decide which providers are intentionally disabled versus expected to be configured:
  - `STORAGE_PROVIDER_ENABLED`
  - `PAYMENT_PROVIDER_ENABLED`
  - `PAYMENT_WEBHOOK_ENABLED`
  - `WHATSAPP_PROVIDER_ENABLED`
  - `SMS_PROVIDER_ENABLED`
  - `OTP_PROVIDER_ENABLED`
  - `OCR_PROVIDER_ENABLED`
  - `PRINTER_PROVIDER_ENABLED`
  - `ERP_PROVIDER_ENABLED`
  - `MAPS_PROVIDER_ENABLED`
- Wire durable worker heartbeat storage if production needs last-run/staleness proof.
- Add an explicit safe provider ping contract before treating external providers as truly healthy.

## Staging/prod verification checklist

1. Call `GET /healthz` and confirm only app liveness fields are returned.
2. Call `GET /readyz` and confirm DB status is `healthy` after migrations are applied.
3. Call `GET /admin/health` without a token in production and confirm `401`.
4. Call `GET /admin/health` with the configured token and confirm detailed components are returned.
5. Confirm no API keys, tokens, DB URLs, cookies, payment signatures, prescription images, or medical payloads appear in responses.
6. Confirm intentionally disabled providers report `disabled`.
7. Confirm enabled but incomplete providers report `not_configured`, not `healthy`.
8. Confirm configured providers report `degraded` unless a future safe live ping is implemented.
9. Confirm stock sanity and reservation sanity are read-only and never mutate rows.
10. Confirm request logs include `requestId`, route, status, duration, and redact sensitive fields.
