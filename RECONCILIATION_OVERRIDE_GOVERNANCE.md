# RECONCILIATION_OVERRIDE_GOVERNANCE

Updated: 2026-05-10.

## Purpose

Formalize override, reconciliation, drift, supplier dispute, dead-letter, and rollback review governance while preserving stockInvariant, commercial truth, reconciliation truth, and pharmacist gates.

## Override review process

1. Override request must state entity, previous value, proposed value, reason category, business reason, actor, approver, affected store, and affected order/batch/payment/refund/provider reference.
2. Overrides cannot approve prescriptions, release H/H1/X/controlled-drug items, fabricate provider success, bypass stockInvariant, erase audit logs, or downgrade reconciliation truth.
3. High-risk overrides require same-day independent review by store manager/reconciliation owner; regulated overrides require pharmacist review.
4. Launch-period overrides are reviewed daily; post-launch cadence may move to weekly only after incident-free evidence.

## Required override reason categories

Inventory count correction, quarantine/disposal, supplier invoice correction, refund/payment correction, customer/order correction, delivery/POD correction, provider retry/dead-letter remediation, rollback/backfill correction, legal/compliance instruction, pharmacist correction, other with mandatory note.

## Reconciliation cadence

| Cadence | Review scope | Owner |
| --- | --- | --- |
| Opening | Prior close variances, dead letters, held orders, refunds, stock discrepancy carryover. | Store manager + pharmacist where regulated. |
| Shift handoff | Sales/refunds/cash, stock spot-checks, overrides, rider handoffs, dead letters. | Outgoing/incoming shift owners. |
| Closing | Full daily sales/payment/refund/stock/provider/dead-letter variance list. | Store manager + reconciliation owner. |
| Weekly | Trend review, supplier disputes, duplicate invoice risk, rollback/backfill records. | Reconciliation owner + platform/purchase owner. |
| Incident | Affected entity reconstruction before reopen. | Incident commander. |

## Unresolved drift handling

- Classify drift as stock, payment, refund, supplier, provider, delivery, prescription, access/security, or rollback/backfill.
- Assign owner, severity, customer impact, financial exposure, regulated impact, and next checkpoint.
- Freeze affected workflow when drift can affect patient safety, H/H1/X release, stock truth, payment truth, or PHI/PII.
- Do not close drift as “accepted” without written accountable approval and mitigation.

## Supplier invoice dispute handling

Supplier disputes must track supplier, store, invoice number, date, amount, product/batch lines, duplicate suspicion, credit note/refund linkage, purchase owner, reconciliation owner, and final resolution. Hard uniqueness on supplier + store + invoice number still requires business-reviewed backfill before destructive-risk migration.

## Dead-letter review cadence

Provider and worker dead letters are reviewed at store opening, shift handoff, store closing, and immediately when thresholds are breached. Each unresolved dead letter requires owner, retry/resolve decision, customer/financial/clinical impact classification, and no fake success state.

## Rollback review cadence

Every rollback or rollback rehearsal requires artifact ID, rollback target, initiating reason, commander, execution owner, data/reconciliation impact, customer communication owner, verification output, and reopen criteria. Rollback is not successful until stock, commercial, provider, and regulated queues are reconciled.
