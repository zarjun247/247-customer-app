# PRODUCTION_HEALTHCHECK_STATUS

Documentation-only healthcheck specification. No healthcheck code is implemented here. The requirements below describe what production health endpoints, startup checks, deploy smoke tests, or dashboards should cover before go-live.

## Healthcheck principles
- Separate **liveness** (process is running) from **readiness** (safe to receive traffic) and **dependency health** (providers/workers are usable).
- Healthchecks must not mutate business data.
- Sensitive secrets must never be returned in healthcheck responses.
- Production readiness must fail closed when a required dependency is unavailable for an enabled feature.
- Healthcheck output should include environment, app version/commit, timestamp, and degraded dependency list.

## Required healthcheck requirements

| Requirement | Expected check | Readiness impact | Notes |
| --- | --- | --- | --- |
| DB connectivity | Open connection and execute a lightweight read-only query. | Fail readiness if unavailable. | Include latency and database role/cluster where safe. |
| Migration version/current schema | Compare applied migration/schema version against expected release metadata. | Fail readiness if expected migration is missing or drift is detected. | Do not run migrations from healthcheck. |
| Object storage | Verify configured bucket/prefix exists and app can perform safe read/list or write/delete probe in a healthcheck prefix. | Degrade or fail depending on whether prescriptions/invoices/reports require storage for active flows. | Avoid touching real customer files. |
| Payment provider config | Confirm payment provider enabled/disabled state and required Razorpay keys/webhook secret presence when enabled. | Fail readiness for payment flows if enabled but incomplete. | Do not expose key values; optionally verify webhook secret presence only. |
| SMS provider config | Confirm SMS provider enabled/disabled state and required credentials/sender config. | Fail readiness for OTP-critical flows if enabled but incomplete. | If SMS is required for login/OTP, treat as critical. |
| WhatsApp provider config | Confirm WhatsApp access token, webhook verify token, phone/business IDs, and template mode where applicable. | Degrade notification readiness if incomplete; fail critical WhatsApp-only flows. | Distinguish send capability from webhook verification. |
| Printer/provider config | Confirm printer host/port/name or queue configuration for store label printing. | Degrade label printing readiness; do not block unrelated app traffic unless labels are mandatory for go-live step. | Include per-store printer config where applicable. |
| ERP/Tally export config | Confirm export destination/company mapping/provider mode. | Degrade accounting export readiness if incomplete. | Export health must not create duplicate production exports. |
| Worker/cron health | Check heartbeat/last successful run for workers and cron jobs. | Fail readiness for flows dependent on background processing if stale. | Include reservation expiry, notifications, webhooks/retry, reports, and exports as applicable. |
| Queue backlog if queue exists | Report oldest job age, ready/retry/dead-letter counts, and queue processing rate. | Degrade or fail when backlog exceeds SLA. | If no queue exists, health should explicitly report `not_applicable`. |
| Stock invariant sanity check | Read-only query or sampled assertion that aggregate stock values are non-negative and ledger/summary mismatch threshold is acceptable. | Fail operational readiness for affected store/SKU class when invariant breach exists. | Must not auto-correct in healthcheck. |
| Reservation expiry sanity check | Count expired active reservations and max age beyond expiry. | Degrade/fail when backlog exceeds threshold. | Link to worker runbook for safe replay/repair. |

## Suggested endpoint shape

If implemented later, expose separate endpoints or modes:

- `/health/live`: process liveness only; no heavy dependency checks.
- `/health/ready`: DB, migration, required config, and critical dependency readiness.
- `/health/dependencies`: detailed provider/worker/storage/queue state for authenticated operators or internal monitoring.

## Deployment smoke checklist

- [ ] Liveness returns healthy after deploy.
- [ ] Readiness remains disabled until migrations are current.
- [ ] DB connectivity passes with expected latency.
- [ ] Object storage probe passes in non-customer health prefix.
- [ ] Required providers report configured or intentionally disabled.
- [ ] Workers/cron heartbeat after enablement.
- [ ] Queue backlog is within threshold or explicitly not applicable.
- [ ] Stock invariant sanity has no critical breach.
- [ ] Reservation expiry backlog is within threshold.
- [ ] Health output redacts all secrets.

## Current status placeholder

- Implementation status: **Specification only**.
- Required before production go-live: map these checks to actual endpoints, infrastructure probes, CI/deploy smoke scripts, or dashboards and record evidence.
