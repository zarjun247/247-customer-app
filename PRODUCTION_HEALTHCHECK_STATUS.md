# Production Healthcheck Status

## No-fake-health doctrine

This implementation does not claim green health unless a real check succeeded. Environment variables can establish `configured`, but they do not establish `healthy` for third-party providers.

## Liveness endpoint

- `GET /healthz`
- `GET /api/healthz`

Expected public-safe response shape:

```json
{
  "status": "ok",
  "requestIdSupported": true
}
```

## Readiness endpoint

- `GET /readyz`
- `GET /api/readyz`

Expected public-safe response shape:

```json
{
  "status": "ok|degraded|unhealthy",
  "ready": true,
  "checks": {
    "app": "healthy",
    "database": "healthy|degraded|unhealthy|unknown",
    "migrations": "healthy|unhealthy|unknown"
  }
}
```

## Detailed/admin endpoint

- `GET /api/health`
- `GET /api/admin/health`

Expected protected response shape includes:

- `app`
- `database`
- `migrations`
- `providers`
- `workerQueue`
- `stockReservationSanity`

## Protection model

- Production detailed health fails closed unless `HEALTHCHECK_INTERNAL_TOKEN` is configured and supplied.
- Accepted token carriers: `x-healthcheck-token`, `x-internal-health-token`, or `Authorization: Bearer <token>`.
- Public endpoints never expose secrets, tokens, DB URLs, customer data, medical notes, prescription content, or raw provider keys.

## Staging verification checklist

- Confirm `/healthz` and `/readyz` return without authentication.
- Confirm public endpoints do not include provider maps, raw env names, DB URLs, tokens, or medical data.
- Configure `HEALTHCHECK_INTERNAL_TOKEN` and confirm `/api/admin/health` works only with the token.
- Confirm unconfigured providers appear as `not_configured` or `disabled`, not `healthy`.
- Confirm DB failures produce degraded/unhealthy readiness without crashing the process.

## Production verification checklist

- Configure `HEALTHCHECK_INTERNAL_TOKEN` with a high-entropy secret.
- Restrict detailed health endpoint access at the network/WAF layer where possible.
- Point load balancers at `/readyz` and uptime checks at `/healthz`.
- Confirm logs include request IDs and safe metadata only.
- Confirm redaction removes OTPs, cookies, bearer tokens, payment signatures, prescription blobs, DB URLs, and raw phone/email.

## Alerting follow-up

Production alerting is intentionally not claimed as complete in this PR. Follow-up alert rules should cover:

- readiness `unhealthy`
- database `unhealthy`
- migration duplicate prefix detection
- worker dead-letter count growth
- stale running workers
- negative stock count
- expired active reservation count
- provider status transitions from configured to unhealthy if real pings are added later
