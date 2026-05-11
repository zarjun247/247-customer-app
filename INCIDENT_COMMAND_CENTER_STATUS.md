# INCIDENT_COMMAND_CENTER_STATUS

Updated: 2026-05-10.

## Current status

The Incident Command Center remains a foundation-only capability. This audit keeps the command-center surface honest by exposing only real runtime signals and marking unsupported dashboards as blocked.

## What is merge-ready now

- Admin/staff-gated observability route wiring.
- Prometheus metric shape for API latency, OCR worker counters, worker job backlog/dead-letter counts, provider webhook counts, retry-scheduled counts, and provider dead-letter counts.
- Provider incident visibility derived from provider event/dead-letter tables.
- Dashboard definitions that do not fabricate stock, audit, refill, reconciliation, or open-incident data.

## Remaining blockers before calling this a command center

1. Incident entities/runbooks are not persisted as first-class operational records.
2. Provider heartbeat/latency rollups are not yet wired from each provider integration.
3. SLA breach counters are not yet emitted from order/provider delivery flows.
4. Stock anomaly signals need to come from canonical `batch_ledger` / `stockInvariant` checks without changing stock semantics.
5. Audit anomaly signals need durable audit-rule evaluation, not dashboard-only labels.
6. Access logging and scrape access policy need deployment-level documentation for whichever staff/admin token/cookie path production uses.

## Readiness score after audit

- Operational visibility foundation: 7.2 / 10.
- Incident Command Center: 4.8 / 10.

Rationale: the foundation is safer and route-gated, but the product should not be presented as a complete incident command center until real incident, SLA, provider heartbeat, and anomaly flows are implemented.
