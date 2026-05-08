# Observability Implementation Status — Wave 0 Prompt 3

## Endpoints added

- `GET /healthz` and `GET /api/healthz` provide public liveness.
- `GET /readyz`, `GET /api/readyz`, and `GET /api/health` provide readiness summaries.
- `GET /admin/health` and `GET /api/admin/health` provide protected admin component summaries.

## Data exposed

Public liveness exposes only:

- `status`
- `timestamp`
- `service`
- `version`

Readiness and admin health expose non-secret component status summaries for:

- app runtime
- database read-only probe
- migration metadata visibility
- object storage provider configuration state
- payment provider configuration state
- WhatsApp/SMS/email provider configuration state
- OCR provider configuration state
- worker/OCR queue visibility
- stock sanity counters where safely queryable
- reservation sanity counters where safely queryable

## Data not exposed

Healthchecks must not expose:

- environment variables or DB URLs
- provider credentials or API keys
- bearer tokens, cookies, webhook secrets, payment secrets, or signatures
- stack traces
- private runtime config
- customer, order, prescription, or raw file data

## Request logging behavior

`requestLogger` accepts a safe incoming `x-request-id` when it is 1-80 characters and contains only letters, digits, `.`, `_`, `:`, or `-`. Unsafe or missing values are replaced with a generated UUID. The response always receives an `x-request-id` header.

The emitted structured log shape is intentionally limited to:

- `requestId`
- `method`
- `route`
- `path`
- `statusCode`
- `durationMs`
- `actorId` when already safely available on the request
- `actorRole` when already safely available on the request
- `storeId` when already safely available on the request
- `errorCode` when safely available on `res.locals`

## Redaction rules

The observability helper redacts or masks:

- OTPs and one-time codes
- bearer tokens and authorization values
- cookies and set-cookie values
- passwords
- API keys and secrets
- payment signatures and Razorpay secret material
- WhatsApp tokens
- prescription image/base64 fields and raw file/blob-like payloads
- long base64 blobs
- email addresses and phone numbers in free text

## Production token/auth requirements

Admin health is intentionally fail-closed in production when no `ADMIN_HEALTH_TOKEN` or `HEALTHCHECK_ADMIN_TOKEN` is configured. Operators should send the token using one of:

- `x-admin-health-token`
- `x-healthcheck-token`
- `Authorization: Bearer <token>`

Follow-up: replace or augment this token gate with the platform's existing admin session/RBAC guard once a server-side Express-compatible admin guard is available for non-tRPC routes.

## Known limitations

- DB, migration, stock, reservation, and queue checks are read-only smoke checks, not full data audits.
- Migration health reports `unknown` when migration metadata is absent or cannot be safely introspected; it never runs migrations.
- Provider health reports configuration states only and does not call live external providers.
- Worker/queue visibility depends on the `ocr_jobs` table being present and queryable.
- Stock and reservation sanity use defensive schema-aware SQL; if schema drift prevents safe introspection, the component reports `unknown`.

## Follow-up tasks

1. Wire admin health to a first-class Express admin auth/RBAC guard when available.
2. Add alert routing for sustained `unhealthy` database state and degraded stock/reservation anomalies.
3. Add dashboards that aggregate structured request logs by request ID, route, status, duration, actor role, and store.
4. Expand queue checks if additional production queue backends are introduced.
5. Document operational SLO thresholds after real traffic baselines exist.

## Scope statement

This implementation is read-only observability and healthchecks only. It does not change commercial lifecycle, stock mutation, payment lifecycle, prescription, H1, refund, or accounting behavior.
