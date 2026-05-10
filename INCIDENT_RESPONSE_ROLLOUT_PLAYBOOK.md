# INCIDENT_RESPONSE_ROLLOUT_PLAYBOOK

Updated: 2026-05-10.

## Scope

This playbook governs incident handling during controlled rollout. It is intentionally conservative because pharmacy operations combine regulated medicines, PHI/PII, payments, stock, provider callbacks, delivery, and statutory records.

## Incident severity

| Severity | Definition | Examples | Required response |
| --- | --- | --- | --- |
| SEV-0 | Patient safety, regulated release, PHI/PII exposure, payment double-settlement, or stock truth corruption risk. | H/H1 release without pharmacist approval, prescription data leak, provider double capture, negative stock dispensed, destructive migration risk. | Emergency stop, incident commander engaged immediately, pharmacist/compliance/engineering leads engaged, preserve evidence, no resume without written go. |
| SEV-1 | Live operations materially degraded with commercial/statutory risk but no confirmed patient safety or data exposure. | Provider outage with pending payments, refund dead-letter backlog, restore failure in staging during launch, store isolation anomaly. | Degraded mode/manual fallback, hourly updates, same-day reconciliation, owner signoff to resume normal flow. |
| SEV-2 | Operational defect with workaround and bounded impact. | Printer failure, OCR degradation, notification delays, UX confusion causing staff delay. | Track owner, workaround, daily review until closed. |
| SEV-3 | Polish/documentation/training issue. | Minor copy issue, report formatting, non-blocking UX polish. | Backlog and batch for post-launch sprint. |

## Incident roles

- **Incident commander:** owns severity, timeline, stop/resume decision coordination, and communications cadence.
- **Pharmacist lead:** owns regulated medicine, prescription, substitution, and patient-safety decisions.
- **Engineering lead:** owns technical diagnosis, rollback, queue/provider controls, and evidence preservation.
- **Operations lead:** owns staff coordination, manual fallback, reconciliation, and store communication.
- **Compliance/legal lead:** owns PHI/PII, breach, statutory, and regulator/customer communication decisions.
- **Provider owner:** owns payment/message/OCR/storage/print/map/accounting vendor escalation.

## Emergency stop triggers

Use emergency stop immediately for:

- Suspected PHI/PII/secret exposure.
- H/H1/X or prescription-required product released without required pharmacist/compliance gate.
- StockInvariant breach affecting physical dispensing or availability promises.
- Provider double capture, refund over-settlement, or unexplained payment/refund variance.
- Cross-store data visibility or store assignment anomaly.
- Destructive migration, restore, or data corruption risk.
- Worker/provider dead-letter spike affecting regulated or commercial truth.
- Unauthorized staff/admin access.

## First 15 minutes

1. Declare severity and incident commander.
2. Stop affected workflow/channel/provider/worker if continuing could worsen stock, payment, PHI/PII, or regulated risk.
3. Preserve evidence: timestamps, order IDs, provider IDs, staff actor IDs, audit IDs, logs, database snapshot references, and screenshots where allowed.
4. Move affected orders/refunds/prescriptions/stock movements to manual review.
5. Notify pharmacist lead, operations lead, engineering lead, compliance/legal lead, and provider owner.
6. Start an incident timeline.

## First hour

1. Determine blast radius by store, workflow, provider, staff role, SKU/batch, and time window.
2. Run safe read-only checks for provider events, dead letters, worker backlog, refunds, stock exceptions, prescription gates, and store isolation.
3. Decide: continue degraded mode, rollback release, disable provider, pause store, or full emergency stop.
4. Communicate status to launch staff and leadership.
5. Assign reconciliation owner and next update time.

## Recovery rules

- Do not resume regulated workflows until pharmacist lead signs off.
- Do not resume payment/refund workflows until provider owner and reconciliation owner sign off.
- Do not resume stock-affecting workflows until stock exception owner signs off.
- Do not resume normal operations after PHI/PII issue until compliance/legal lead signs off.
- Do not re-run provider callbacks manually unless idempotency and accounting impact are documented.
- Do not run destructive database operations from this repository; use approved provider tooling/runbook only.

## Post-incident review

Within 2 business days:

1. Publish timeline, impact, root cause, detection source, and response actions.
2. Record affected stores, users, orders, prescriptions, batches, provider events, refunds, and statutory records.
3. Identify whether stockInvariant, commercial truth, H/H1/pharmacist gates, PHI/PII redaction, AI governance, or migration safety were threatened.
4. Define corrective actions with owner/date/classification.
5. Decide whether rollout remains paused, returns to one-store cap, or may continue.

## Launch communications cadence

- SEV-0: every 15 minutes until contained, then every 30 minutes until stable.
- SEV-1: every 30 minutes until contained, then hourly until stable.
- SEV-2: daily launch review.
- SEV-3: backlog review.
