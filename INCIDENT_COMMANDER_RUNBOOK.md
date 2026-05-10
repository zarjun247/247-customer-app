# INCIDENT_COMMANDER_RUNBOOK

Updated: 2026-05-10.

## Purpose

Provide an executable runbook for launch incidents, degraded mode, emergency freeze, rollback coordination, evidence preservation, and post-incident reconciliation. This runbook does not prove that a live incident commander rota exists.

## First 15 minutes

1. Record reporter, time, severity, affected store/order/batch/provider/system, and immediate safety risk.
2. Freeze the narrowest safe scope; broaden immediately if patient safety, PHI/PII, H/H1/X, controlled-drug, stock truth, or payment truth may be affected.
3. Assign incident commander if not already assigned.
4. Notify pharmacist-in-charge for clinical/regulated/stock discrepancy risks.
5. Notify store manager for local operations, delivery, payment/cash, staffing, and customer communications.
6. Notify platform/provider owner for runtime, queue, provider, security, rollback, or data risk.
7. Preserve evidence with minimum PHI/PII exposure.

## Decision tree

| Question | If yes | If no |
| --- | --- | --- |
| Patient safety or regulated release risk? | Stop affected dispensing immediately; pharmacist owns release decision. | Continue triage. |
| PHI/PII/security exposure? | Freeze affected access/channel, preserve logs, escalate legal/compliance. | Continue triage. |
| Stock or reconciliation truth uncertain? | Freeze affected batch/order/workflow until reconstruction. | Continue triage. |
| Provider state unreliable? | Degrade/disable affected provider workflow; no fake success. | Continue triage. |
| Deployment caused incident? | Prepare rollback with platform owner; verify data/reconciliation after rollback. | Continue operational mitigation. |

## Rollback awareness

Rollback requires artifact ID, rollback target, owner, command/procedure, expected data impact, customer communication, verification outputs, and reconciliation review. Do not declare rollback complete until health/readiness, queues, provider/dead-letter state, stock, payments/refunds, and regulated order queues are reviewed.

## Degraded-mode handling

Approve degraded mode only with scope, start time, owner, customer impact, manual fallback path, reconciliation backfill owner, review cadence, and explicit prohibited actions. Degraded mode cannot bypass pharmacist gates, AI governance, stockInvariant, provider truth, or PHI/PII controls.

## Closure checklist

- Safety risk contained and release state correct.
- Pharmacist/manager/provider/platform owners have closed domain actions.
- Stock/commercial/reconciliation/dead-letter impacts are reviewed.
- Customer communications complete where needed.
- Evidence stored without unnecessary PHI/PII.
- Root cause, prevention, training/doc updates, and reopen criteria recorded.
