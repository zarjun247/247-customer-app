# INCIDENT_ESCALATION_MATRIX

Updated: 2026-05-10.

## Purpose

Define who owns operational incidents, who can stop work, who can roll back/freeze, and how pharmacy, store, provider, and platform escalations converge. This matrix creates doctrine only; it does not prove a live rota exists.

## Severity definitions

| Severity | Examples | Required response |
| --- | --- | --- |
| P0 stop-the-line | Patient-safety risk, H/H1/X gate bypass, PHI/PII exposure, uncontrolled stock mutation, payment marked paid without provider proof, production data loss, unauthorized access, controlled-drug discrepancy. | Immediate freeze/stop, incident commander assigned, pharmacist/manager notified, evidence preservation, hourly checkpoints until contained. |
| P1 launch blocker | Provider outage affecting release, dead-letter backlog beyond threshold, unresolved reconciliation drift, failed rollback/restore rehearsal, staff access scope error, supplier duplicate dispute blocking purchasing. | Same-day owner, affected workflow paused or degraded, daily checkpoint until closed. |
| P2 scale blocker | Missing SLA rollup, recurring provider latency, UX/operator friction, incomplete command-center metric. | Planned remediation owner and target date. |
| P3 improvement | Non-critical polish or training reinforcement. | Backlog and training update. |

## Roles and authority

| Role | Primary responsibility | Authority |
| --- | --- | --- |
| Incident commander | Own incident timeline, decisions, communications, evidence, checkpoint cadence, closure review. | Can freeze launch scope, coordinate rollback, require emergency stop, assign owners. |
| Pharmacist-in-charge | Own clinical/regulated release decisions and H/H1/X/controlled-drug safety. | Stop-the-line authority for any dispensing or prescription concern; cannot be overruled by software/AI/manager convenience. |
| Store manager | Own staffing, cash/payment reconciliation, rider handoff, local inventory discipline, customer operational communication. | Stop ordinary store operations for stock/payment/staffing risk; request provider/rollback escalation. |
| Platform owner | Own release artifact, runtime, feature flags/freeze, rollback execution, data preservation. | Emergency freeze and rollback authority with incident commander approval unless immediate containment is needed. |
| Provider owner | Own payment/OCR/WhatsApp/SMS/maps/storage/accounting provider incident tracking. | Disable or degrade provider-dependent workflows; cannot mark fake success. |

## Escalation chain

1. Detect and record incident with severity, scope, entities, reporter, and immediate safety action.
2. Assign incident commander for P0/P1.
3. Notify pharmacist-in-charge for any prescription, H/H1/X, controlled-drug, stock discrepancy, or patient-safety risk.
4. Notify store manager for staffing, delivery, payment, cash, inventory, customer-facing, or rider risks.
5. Notify provider owner for provider/webhook/dead-letter failures.
6. Notify platform owner for deploy, rollback, database, queue, security, or access risks.
7. Preserve logs/evidence with PHI/PII minimization.
8. Close only after reconciliation, customer/provider/staff follow-up, and post-incident review.

## Rollback, stop-the-line, and emergency freeze

- **Rollback authority:** incident commander plus platform owner; pharmacist-in-charge may demand rollback/freeze if software behavior threatens regulated release safety.
- **Stop-the-line authority:** pharmacist-in-charge, store manager, incident commander, platform owner for their domains.
- **Emergency freeze authority:** any trained staff may initiate immediate freeze for suspected patient-safety, PHI/PII, controlled-drug, or stock-truth breach; incident commander confirms scope afterward.
