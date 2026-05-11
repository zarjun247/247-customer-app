# OPERATIONAL_OWNERSHIP_MATRIX

Updated: 2026-05-10.

## Purpose

Assign accountable owners for operational domains without inventing a live rota. Names, contacts, and alternates must be attached before controlled production.

| Domain | Primary owner role | Secondary owner role | Required cadence | Evidence required before live launch |
| --- | --- | --- | --- | --- |
| Prescription intake/review | Pharmacist-in-charge | Shift pharmacist | Every shift and every regulated order. | Signed pharmacist SOP, roster, queue report. |
| H/H1/X/controlled-drug release | Pharmacist-in-charge | Compliance/legal reviewer for policy questions | Every release; daily exception review. | Capability evidence, SOP signoff, statutory record process. |
| Store staffing/access | Store manager | Platform access admin | Opening, closing, staff change. | Named staff roster, role/store scope, offboarding path. |
| Inventory/stockInvariant | Store manager | Pharmacist for regulated stock | Opening, closing, discrepancy event. | Spot-check log, stock discrepancy register. |
| Reconciliation truth | Reconciliation owner | Store manager | Daily close, weekly trend, incident event. | Reconciliation report and variance signoff. |
| Overrides | Store manager | Incident commander for risky overrides | Daily during launch. | Reason, approver, before/after, linked reconciliation. |
| Refunds/payments | Finance/reconciliation owner | Store manager | Daily during launch. | Provider proof, ledger/reversal report, variance owner. |
| Supplier invoices/disputes | Purchase owner | Reconciliation owner | On receipt; weekly dispute review. | Invoice import report, duplicate dispute log. |
| Dead letters/provider failures | Provider owner | Incident commander | Opening/closing and threshold breach. | Dead-letter board count/oldest age/action owner. |
| Deployment/rollback | Platform owner | Incident commander | Every release and incident. | Artifact ID, rollback target, rehearsal/proof. |
| Monitoring/on-call | Incident commander | Platform owner | Launch daily and incident triggered. | Rota, alert thresholds, escalation contacts. |
| Legal/compliance review | Legal/compliance owner | Pharmacist-in-charge | Before launch and policy changes. | Written approval or accountable exception. |

## RACI shorthand

- Pharmacist is accountable for dispensing judgement and regulated release.
- Store manager is accountable for local execution discipline.
- Platform owner is accountable for runtime/deploy controls.
- Incident commander is accountable for cross-functional incident coordination.
- Legal/compliance owner is accountable for external review evidence.
