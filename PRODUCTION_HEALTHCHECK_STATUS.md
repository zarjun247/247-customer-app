# PRODUCTION_HEALTHCHECK_STATUS

## Current implementation status

Production-safe healthcheck code is now implemented for liveness, readiness, protected detailed health, request IDs, structured request logging, and redaction.

| Item | Value |
| --- | --- |
| Branch | `feat/production-observability-healthchecks-redaction` |
| Latest main SHA inspected | `200fafcc20451cc43e8d6272588ec7e26e12d9c8` |
| Migrations added | No |
| Schema changed | No |

## Endpoint list

| Endpoint | Access | Expected status behavior | Response model |
| --- | --- | --- | --- |
| `GET /healthz` | Public | 200 if Node/Express process can respond. | Minimal liveness only. No DB/provider internals. |
| `GET /api/healthz` | Public | 200 if Node/Express process can respond. | Same as `/healthz`. |
| `GET /readyz` | Public | 200 only when critical DB/migration checks are ready; 503 otherwise. | Secret-free status names for DB and migrations only. |
| `GET /api/readyz` | Public | 200 only when critical DB/migration checks are ready; 503 otherwise. | Same as `/readyz`. |
| `GET /api/health` | Staff/admin protected | 200 for accessible detailed report unless critical status is unhealthy; 503 when detailed report is unhealthy. Unauthenticated production requests fail closed with 404. | Detailed safe component statuses. |
| `GET /api/admin/health` | Staff/admin protected | Same as `/api/health`. | Detailed safe component statuses. |

## Production protection model

- Public endpoints are intentionally minimal and safe for load balancers.
- Detailed endpoints use the existing session authentication path and allow only staff/admin roles.
- In production, detailed health fails closed for unauthenticated/unauthorized requests with 404 rather than exposing endpoint existence or internals.
- Detailed health does not expose environment variable values, provider keys, DB URLs, payment signatures, files, raw customer data, or PHI.

## No-fake-health doctrine

- `configured` means required configuration appears present; it does **not** mean the provider is healthy.
- `not_configured` is never upgraded to `healthy`.
- Healthchecks do not send SMS/WhatsApp messages, process worker jobs, retry queues, mutate payments/refunds, mutate reservations/stock, or write health probe files.
- Provider live success is not claimed without a safe, explicit provider-specific proof path.

## Staging verification checklist

- [ ] Confirm `/healthz` and `/api/healthz` return only minimal liveness.
- [ ] Confirm `/readyz` and `/api/readyz` return 200 with healthy DB/migration checks and 503 when DB is unavailable.
- [ ] Confirm `/api/health` and `/api/admin/health` require staff/admin session.
- [ ] Confirm detailed health contains no secrets or raw customer/medical data.
- [ ] Confirm request logs include `requestId`, method, path, status, duration, and safe actor/store context only.
- [ ] Confirm no request body, prescription payload, OTP, cookie, payment signature, or provider token appears in logs.
- [ ] Confirm migration duplicate detection is read-only.
- [ ] Confirm worker queue health does not process or retry jobs.
- [ ] Confirm stock/reservation sanity checks do not correct or mutate records.

## Production verification checklist

- [ ] Point load balancer liveness to `/healthz` or `/api/healthz`.
- [ ] Point traffic readiness to `/readyz` or `/api/readyz`.
- [ ] Restrict detailed health endpoint access to authenticated staff/admin operators and trusted monitoring only.
- [ ] Verify production health output under real environment contains no `DATABASE_URL`, secrets, tokens, keys, payment signatures, prescription files, medical notes, phone numbers, or emails.
- [ ] Run DB smoke proof with `TEST_DATABASE_URL` before claiming database proof.
- [ ] Validate alert thresholds on readiness failures, dead-letter jobs, stale workers, migration duplicate status, negative stock counts, and stale active reservations.

## Alerting follow-up

External alerting/monitoring is still a follow-up. Recommended next work:

1. Add deployment smoke script that calls `/healthz`, `/readyz`, and protected detailed health with an operator/monitor token.
2. Add uptime/alert integrations for readiness 503, DB unhealthy, migration unhealthy, worker dead letters/stale workers, and stock/reservation degraded status.
3. Add dashboard panels for p95 request duration, 4xx/5xx rates, readiness failures, queue backlog, and degraded component counts.
