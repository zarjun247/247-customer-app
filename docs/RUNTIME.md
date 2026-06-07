# Runtime Reference

This document describes the observability stack, SLO framework, incident tooling, dead-letter remediation, provider health monitoring, and on-call expectations for 24/7 Pharmacy OS.

See also: [OPERATIONS.md](./OPERATIONS.md) §Incident response, [COMPLIANCE.md](./COMPLIANCE.md) §Audit log requirements.

---

## Observability stack

The stack as of 2026-05-11 (PR #157 merged):

### OpenTelemetry traces

OTel SDK is initialized as the first call in `server/_core/index.ts` before Express and server creation. This is sufficient for HTTP + Express auto-instrumentation via shimmer prototype patching.

**Configuration (all optional env vars — omit for local dev, set for staging/prod):**

| Env var | Purpose | Default when unset |
|---------|---------|-------------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP endpoint for trace export. | No export (local no-op). |
| `OTEL_SERVICE_NAME` | Service name in spans. | `247-pharmacy-os` |
| `OTEL_TRACES_SAMPLER` | Sampler type (e.g., `parentbased_traceidratio`). | 100% sampling. |
| `OTEL_TRACES_SAMPLER_ARG` | Sampler argument (e.g., `0.1` for 10% sampling). | — |

**Important design note (from PR 4.1):** If DB-level instrumentation is added in the future (e.g., `@opentelemetry/instrumentation-mysql2`), a separate `server/bootstrap.ts` entry file using dynamic `import()` will be required so the OTel SDK starts before `mysql2` is required. Revisit before adding DB-level OTel instrumentation.

**Source:** `server/_core/telemetry.ts`, initialized from `server/_core/index.ts`.

---

### Prometheus metrics

Metrics are exported from `prom-client` at the `/metrics` endpoint.

- **Access:** Staff/admin gated — requires a valid session with `ops_admin`, `admin`, or `super_admin` role. Never publicly accessible.
- **Counters/gauges include:** provider dead-letter counts, worker queue lengths, stock anomaly counts, refund/payment exception counts, request latency histograms.
- Provider and dead-letter metrics are derived from durable `provider_dead_letters` and `worker_jobs` tables — not from in-memory state.

**Source:** `server/_core/observability.ts`, metrics endpoint registered in `server/_core/index.ts`.

---

### Structured logging (pino)

All server-side logging uses `pino` with `pino-http`. Log format is JSON. Sensitive HTTP fields are sanitized before logging.

**Redaction rules (enforced in observability.ts):**
- `authorization`, `cookie`, `x-api-key` headers → redacted.
- Phone numbers, prescription identifiers, payment signatures → redacted via `redactString()`.
- Raw OTP values, JWT payloads, S3 presigned URLs → never logged.

**Log levels:** `error` and `warn` for operational issues; `info` for business events; `debug` for development (never in production).

---

### Health endpoints

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /health/live` | None (public) | Kubernetes/load-balancer liveness: returns 200 if process is alive. |
| `GET /health/ready` | None (public) | Readiness: checks DB connectivity, migration version, stock reservation sanity, and worker queue. Returns 503 if not ready. |
| `GET /metrics` | Staff/admin | Prometheus metrics scrape endpoint. |
| `GET /api/admin/runtime/detail` | Admin | Full runtime detail including provider health, dead-letter counts, queue stats. Returns PHI-free aggregate data only. |

**What readiness asserts:**
- DB is reachable and schema version matches the expected migration count.
- Stock reservation sanity: no pending reservations reference non-existent batches.
- Worker queue: heartbeat within threshold.

**Stop-the-line trigger:** If readiness returns 503, no stock-changing operation should proceed.

---

## SLO definitions and budgets

> **Note:** Formal SLO tracking via `sloService.ts` is being implemented in the current MP1-rest PR-A (Terminal A, branch `roadmap/mp1-rest-pr-a-metrics-and-slo`). This section defines the SLO targets; implementation status reflects what is available at time of reading.

### Target SLOs

| SLO | Target | Alert threshold |
|-----|--------|----------------|
| Order-to-allocation time (OTC/Rx cleared) | ≤ 5 minutes p95 | > 10 minutes |
| Order-to-door (delivered, within SLA promise) | ≥ 95% within promised ETA | < 92% over rolling 24h |
| Prescription pharmacist review turnaround | ≤ 15 minutes p95 (shift hours) | > 30 minutes |
| Stock reservation success rate | ≥ 99% | < 98% |
| Dead-letter resolution rate (launch window) | Same-day owner assigned | Any dead letter older than 4 hours without owner |
| Payment webhook processing (success path) | ≤ 30 seconds p99 | > 60 seconds |
| App/API 500 error rate | < 0.5% of requests | > 1% over 5-minute window |

### SLA formula references (from docs/PHARMACY_OS_BLUEPRINT.md)

```
promised_eta_at = prerequisites_cleared_at + queue_estimate + pick_pack_estimate + travel_estimate
sla_remaining_seconds = promised_eta_at - now
sla_hit_rate = delivered_within_promise / total_delivered_orders
```

The customer-facing SLA clock starts only after prerequisites are satisfied. For Rx orders: after pharmacist approval. For OTC: after stock reservation.

---

## Incident command tooling

### Admin UI surfaces

- **`AdminCommandCenter`** (`client/src/pages/admin/AdminCommandCenter.tsx`) — real-time SLA board, stock anomalies, dead-letter counts, provider health, override queue. Requires admin/ops role.
- **`AdminRuntimeIncident`** (wired in MP1, PR #156) — incident logging, status tracking, escalation recording from the admin UI.

Both surfaces are staff/admin gated. They display aggregate metadata only — no PHI, no raw prescription images, no patient identifiers.

### tRPC surfaces for runtime monitoring

- `trpc.admin.runtime.*` — deployment readiness, provider health, worker queue health.
- `trpc.admin.commandCenter.*` — SLA board data, dead-letter counts, stock anomaly counts.
- `trpc.admin.incident.*` — incident creation, status updates, resolution (wired in MP1).

### Evidence capture during incidents

Operators must capture from these surfaces (without copy-pasting PHI):
- Liveness/readiness output (timestamp, environment, operator).
- Provider health status per provider.
- Dead-letter counts and oldest unresolved age.
- Worker queue length and heartbeat freshness.
- Stock anomaly count (negative stock rows, quarantined batches).

---

## Dead-letter remediation

### Sources of dead letters

| Source | Table/location | Review trigger |
|--------|---------------|----------------|
| Payment provider events | `provider_dead_letters` | Threshold breach or at opening/closing. |
| Worker jobs | `worker_jobs` where `status = 'dead_letter'` | Same as above. |
| WhatsApp/SMS failures | `provider_dead_letters` (provider type = whatsapp/sms) | At shift handoff. |
| OCR/inwarding jobs | `worker_jobs` where task = ocr | At opening. |

### Remediation procedure

1. **Review:** Do not replay without reading the dead letter payload, understanding why it failed, and confirming the business state (order/payment/stock) is consistent.
2. **Classify impact:** Patient safety / H/H1/X risk? PHI/PII exposure? Commercial truth (payment/refund marked incorrectly)? Stock truth? Low-impact retry?
3. **Assign owner:** Every dead letter gets a named owner and next-action deadline before shift ends.
4. **Retry rules:**
   - Never replay a dead letter that would double-settle a payment.
   - Never replay a dead letter that would create a duplicate H1 statutory record.
   - Never replay a dead letter for a prescription release without pharmacist re-review.
   - Safe retries (failed notification delivery, failed OCR re-queue for already-reviewed items) may be replayed by store manager.
5. **No fake success:** A dead letter must not be marked resolved by fabricating a success state. Provider truth is the source of truth.
6. **Evidence:** Record dead letter ID, business entity (order/payment/prescription), replay decision and reason, before/after state, reconciliation reviewer.

### Launch threshold

During the first 14 launch days: any dead letter without an assigned owner that is older than 4 hours is a P1 incident trigger.

---

## Provider health monitoring

### Covered providers

| Provider | What's monitored | Fail-closed behavior |
|----------|-----------------|----------------------|
| Payment (Razorpay) | Webhook signature verification; payment capture success rate; refund settlement rate. | No payment marked captured without provider webhook proof. No refund settled without provider confirmation. |
| WhatsApp (Meta Cloud API) | Template message delivery status; webhook verification token validation; inbound message receipt. | Order status notifications fall back to SMS/manual; order truth is unaffected. |
| SMS (OTP provider) | OTP delivery rate; provider enabled/disabled state. | OTP fail-closed: login blocked if SMS provider is down and no fallback is configured. |
| OCR (invoice inwarding) | Job failure rate; dead-letter age for OCR workers. | Inwarding falls back to manual entry; OCR output is assistive-only so a failed job never blocks pharmacist gate. |
| Object storage (S3-compatible) | Prescription upload success; presigned URL generation. | Prescription upload blocks Rx order progression if storage is unavailable. |
| Printer | Label print queue depth; printer heartbeat. | Failed print queues are retried; inwarding is not blocked by printer failure. |
| ERP/Tally export | Export job success; duplicate export guard. | Export failure is a P1 operational issue, not a P0 stop-the-line (sales are not blocked). |

### Provider health check cadence

- **Every 5 minutes:** Dead-letter count check and heartbeat.
- **Every 15 minutes:** Full provider health poll (payment config valid, storage writable, WhatsApp webhook active).
- **On every deployment:** Full provider health verification before workers are enabled.

### Degraded-mode protocol

When a provider is degraded, the operator must:
1. Disable the provider-dependent workflow (not the entire store).
2. Log degraded-mode scope, start time, owner, customer impact, manual fallback path.
3. Record reconciliation backfill owner for any transactions during degraded mode.
4. Restore only after provider health is confirmed and pending dead letters are reconciled.

---

## On-call expectations

### Roles during launch period (first 14 days)

| Role | Coverage | Escalation trigger |
|------|---------|-------------------|
| Incident commander | Named primary + secondary. Must be reachable within 15 minutes for P0. | Any P0 trigger from stop-the-line list. |
| Pharmacist-in-charge | On-shift for every hour of regulated dispensing. After-hours: named escalation contact. | Any prescription/H/H1/X/controlled-drug concern. |
| Provider owner | Business hours + on-call for payment/WhatsApp. | Payment double-settlement risk or WhatsApp outage affecting order flow. |
| Platform owner | On-call for deployment/rollback. | Failed deployment, failed rollback, DB readiness failure. |
| Store manager | On-shift. | Staffing, cash/reconciliation, rider, local ops. |

### Alert thresholds (trigger escalation)

- Dead letters without owner > 4 hours during launch window.
- Readiness endpoint returning 503 for > 2 minutes.
- Payment webhook failure rate > 5% over 10-minute window.
- Stock negative count increasing (new negative stock rows).
- H/H1/X gate error (unexpected bypass attempt logged in audit).
- PHI/PII keyword appearing in pino logs (detected by redaction guard test).

### Monitoring checklist (what operators must have set up before controlled production)

- [ ] Named primary/secondary on-call rota with phone contacts.
- [ ] Alert thresholds configured in monitoring tool of choice (Grafana, Datadog, etc.).
- [ ] `/metrics` scrape job configured with correct auth.
- [ ] Dead-letter dashboard accessible to incident commander.
- [ ] Provider dashboard access granted to provider owner.
- [ ] Escalation path verified: store manager → incident commander → platform owner → legal/compliance.

> **Current status (2026-05-11):** Monitoring tooling infrastructure is in place; named on-call rota and alert thresholds are not yet evidenced. See OPEN_BLOCKERS.md §Live monitoring ownership missing.

---

## Operational ownership matrix

| Domain | Primary role | Secondary role | Required cadence |
|--------|-------------|----------------|-----------------|
| Prescription intake/review | Pharmacist-in-charge | Shift pharmacist | Every shift and every regulated order. |
| H/H1/X/controlled-drug release | Pharmacist-in-charge | Compliance/legal for policy questions. | Every release; daily exception review. |
| Store staffing/access | Store manager | Platform access admin. | Opening, closing, staff change. |
| Inventory/stockInvariant | Store manager | Pharmacist for regulated stock. | Opening, closing, discrepancy event. |
| Reconciliation truth | Reconciliation owner | Store manager. | Daily close, weekly trend, incident event. |
| Overrides | Store manager | Incident commander for risky overrides. | Daily during launch. |
| Refunds/payments | Finance/reconciliation owner | Store manager. | Daily during launch. |
| Supplier invoices/disputes | Purchase owner | Reconciliation owner. | On receipt; weekly dispute review. |
| Dead letters/provider failures | Provider owner | Incident commander. | Opening/closing and threshold breach. |
| Deployment/rollback | Platform owner | Incident commander. | Every release and incident. |
| Monitoring/on-call | Incident commander | Platform owner. | Launch daily and incident triggered. |
| Legal/compliance review | Legal/compliance owner | Pharmacist-in-charge. | Before launch and policy changes. |
