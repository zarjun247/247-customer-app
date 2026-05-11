# OBSERVABILITY_STATUS

Updated: 2026-05-10.

## Audit result

Status: hardened foundation, not a full command-center product.

The merged operational visibility sprint was audited after landing on main. The audit found useful primitives, but also found unsafe gaps that are now corrected:

- `/metrics` and `/api/observability/*` are now staff/admin gated through the existing request authentication path.
- HTTP request logging now emits structured metadata only and sanitizes request identifiers/path labels before logging.
- Provider/dead-letter visibility is derived from durable runtime tables: `provider_webhook_events`, `provider_dead_letters`, and `worker_jobs`.
- Dashboard JSON definitions no longer claim unbacked stock, audit, refill, reconciliation, incident, SLA, or provider heartbeat capabilities.
- No `stockInvariant`, commercial lifecycle, H/H1, or pharmacist gate semantics were weakened by this pass.

## Backed endpoints and metrics

| Surface | Backing source | Status |
| --- | --- | --- |
| `/metrics` | Prometheus registry plus DB refresh for provider/dead-letter/worker counts | Staff/admin gated |
| `/api/observability/dashboards` | Static dashboard definitions plus supported metric catalog | Staff/admin gated |
| `/api/observability/health-summary` | Provider event visibility summary | Staff/admin gated |
| `/api/observability/provider-events` | `provider_webhook_events`, `provider_dead_letters`, `worker_jobs` | Staff/admin gated |

Backed metric names after audit:

- `api_latency_seconds`
- `queue_backlog`
- `worker_processed_total`
- `worker_job_backlog`
- `worker_job_dead_letter_total`
- `provider_webhook_events_total`
- `provider_webhook_failed_total`
- `provider_retry_scheduled_total`
- `provider_dead_letter_total`

## Explicitly not claimed yet

- No synthetic provider uptime board.
- No fake incident count.
- No stock anomaly board until stock anomaly detection derives from canonical stock/reservation/ledger flows.
- No audit anomaly board until audit anomaly rules are implemented against durable audit trails.
- No refill/reconciliation dashboards until runtime services expose real counters.
- No PHI/PII payload logging.
