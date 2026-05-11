# STORE_OPENING_CHECKLIST

Updated: 2026-05-10.

## Opening rule

A store may not begin regulated dispensing for the shift until opening checks are complete and a licensed pharmacist is confirmed for pharmacist-gated workflows. This checklist is operational evidence only and does not replace legal licence review.

## Opening checklist

| Area | Check | Fail-closed action |
| --- | --- | --- |
| Staff access | Named staff logged in with role and store scope; no shared admin. | Disable shift start for affected user; escalate to manager. |
| Pharmacist coverage | Pharmacist identity, registration details on file, shift time, and escalation contact confirmed. | Block prescription/H/H1/X release. |
| Queue review | Overnight prescriptions, rejected/held orders, repeat requests, failed delivery, unresolved customer calls. | Assign owner and review time before accepting new regulated release. |
| Dead letters | Provider/worker dead-letter counts, oldest age, failed webhooks, OCR/payment/notification failures. | Escalate if launch threshold exceeded; pause affected automation. |
| Inventory spot-check | H/H1/X, controlled-drug, high-value, cold-chain, quarantine, near-expiry, negative/near-zero stock. | Freeze affected batch and open discrepancy. |
| Reconciliation | Prior closing variance, refunds, cash/manual transactions, supplier invoice disputes, pending overrides. | Manager signoff required before ordinary operations. |
| Rider readiness | Named riders, delivery handoff method, POD device/process, COD exposure rules. | Do not dispatch without accountable rider handoff. |
| Emergency controls | Emergency stop contacts, incident commander, rollback/freeze procedure, manual fallback packet available. | Delay opening if no emergency owner is reachable. |

## Opening signoff fields

Store, date/time, opening manager, pharmacist, incident commander contact, unresolved blockers accepted/rejected, controlled-drug status (closed/open/frozen), and first reconciliation checkpoint time.
