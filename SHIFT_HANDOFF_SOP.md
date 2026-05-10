# SHIFT_HANDOFF_SOP

Updated: 2026-05-10.

## Purpose

Ensure each shift transfers clinical, stock, commercial, provider, and incident responsibility without relying on tribal knowledge. This SOP does not claim staffing coverage; it defines the handoff that must be performed when named staff exist.

## Required participants

- Outgoing pharmacist or pharmacist-in-charge when regulated queues exist.
- Incoming pharmacist before any H/H1/X or prescription-required release.
- Store manager or shift lead.
- Incident commander if any P0/P1 incident, emergency stop, launch freeze, provider outage, or unresolved reconciliation drift is open.

## Handoff checklist

| Domain | Required review | Required evidence |
| --- | --- | --- |
| Queue review | New prescription orders, held/rejected prescriptions, H/H1/X holds, pending repeat requests, unresolved customer calls. | Queue snapshot/time, owner, next action. |
| Shift reconciliation | Sales, refunds, payments, cash/manual transactions, cancelled orders, partial approvals. | Shift reconciliation note and variance list. |
| Inventory spot-checks | High-value, H/H1/X, cold-chain, negative/near-zero, quarantined, and discrepancy batches. | Count results, discrepancy IDs, frozen/reopened status. |
| Rider handoff | Orders packed, out-for-delivery, failed delivery, COD/cash exposure, POD gaps. | Delivery task list and rider acknowledgement. |
| Dead-letter review | Provider dead letters, worker dead letters, retry queues, unresolved webhooks. | Dead-letter count, oldest age, owner. |
| Overrides | Manual overrides since prior handoff, reasons, approvals, reconciliation linkage. | Override review log. |
| Refund review | Initiated/failed/successful refunds, reversal postings, customer communication. | Refund ledger/reconciliation status. |
| Incidents | Open incidents, emergency stops, degraded mode, rollback/freeze status. | Incident ID, commander, next checkpoint. |

## Stop-the-line triggers during handoff

Stop regulated release until resolved if any of the following are unknown: incoming pharmacist identity, prescription queue owner, H/H1/X held order state, affected batch stock truth, dead-letter owner for provider release messages, cash/payment variance owner, or emergency stop reopen criteria.

## Signoff

Outgoing and incoming shift owners must record: names/roles, store, time, open blockers, unresolved drift, explicit acceptance of pharmacist gates, and whether controlled-drug capability remains open or frozen.
