# STORE_CLOSING_CHECKLIST

Updated: 2026-05-10.

## Closing rule

Closing is not complete until unresolved clinical, stock, commercial, provider, and delivery items are assigned to a named next owner. Closing does not certify legal compliance or stock correctness unless supporting evidence is attached.

## Closing checklist

| Area | Required closeout | Escalate if |
| --- | --- | --- |
| Prescription queue | No unowned H/H1/X/rejected/held/repeat orders; pending items assigned to next pharmacist. | Any regulated order lacks pharmacist owner. |
| Shift reconciliation | Sales, payment provider statuses, cash/manual transactions, refunds, cancellations, journal/reversal status. | Any variance lacks reason/owner. |
| Inventory | Spot-check regulated/high-value/cold-chain/quarantine/near-expiry batches and record discrepancies. | Negative stock, missing batch, unexplained movement, or open controlled-drug discrepancy. |
| Rider/delivery | Returned medicines, failed delivery, COD, POD gaps, customer communication. | Rider handoff or cash exposure is unacknowledged. |
| Dead letters | Review provider/worker dead letters, retry queue, oldest age, unresolved webhooks. | Dead-letter owner or next action missing. |
| Overrides | Review all shift overrides with reason, approver, before/after, reconciliation link. | Any override lacks reason or appears to bypass gates. |
| Supplier disputes | New invoice mismatch, duplicate suspicion, credit note/refund linkage. | Supplier/store/invoice-number duplicate or mismatch not assigned. |
| Incidents | Status, commander, freeze/rollback state, reopen criteria, next checkpoint. | P0/P1 incident lacks commander or log. |

## Closing signoff fields

Store, date/time, closing manager, pharmacist, cash/payment variance, stock variance, dead-letter count/oldest age, override count, refund variance, open incidents, handoff owner, and next review time.
