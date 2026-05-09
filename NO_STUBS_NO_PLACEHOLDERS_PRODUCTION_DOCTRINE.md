# NO_STUBS_NO_PLACEHOLDERS_PRODUCTION_DOCTRINE

## Observability and healthcheck doctrine update — 2026-05-09

- Healthchecks must not fake provider success. A provider with required configuration present may report `configured`, but not `healthy`, unless a safe real health proof exists.
- Unconfigured providers must never be reported as healthy.
- Public liveness/readiness endpoints must not expose secrets, provider internals, DB URLs, PHI, prescription data, customer contact data, payment signatures, or raw environment values.
- Detailed health must be protected in production and fail closed when authentication/authorization is unavailable.
- Request logs must never include raw request bodies, prescription blobs/base64/images, OTPs, cookies, tokens, payment signatures, provider secrets, or raw customer medical/contact data.
- Read-only sanity checks may report degraded/unknown/unhealthy states, but must not repair stock, consume reservations, process queues, retry jobs, send messages, mutate payments, or create provider side effects.
- Production monitoring is not complete until real external probes, dashboards, alert thresholds, and escalation paths are implemented and evidenced.
