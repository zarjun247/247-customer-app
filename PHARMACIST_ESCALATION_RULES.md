# PHARMACIST_ESCALATION_RULES

Updated: 2026-05-10.

## Non-negotiable rule

The pharmacist may stop any prescription, H/H1/X, controlled-drug, substitution, stock-discrepancy, or patient-safety workflow. AI, customer-support, rider, manager, provider status, SLA pressure, or revenue pressure cannot override pharmacist judgement.

## Escalation rules

| Trigger | Pharmacist action | Escalate to | Release state |
| --- | --- | --- | --- |
| Illegible/incomplete prescription | Reject or hold for resubmission/clarification. | Store manager if customer dispute; incident commander if repeated/fraud risk. | Blocked. |
| Suspected forged/altered prescription | Emergency hold and evidence preservation. | Pharmacist-in-charge, store manager, incident commander, legal/compliance owner. | Blocked/frozen. |
| H/H1/X uncertainty | Hold; complete statutory/context review. | Pharmacist-in-charge and legal/compliance owner if policy unclear. | Blocked. |
| Controlled-drug capability uncertainty | Freeze controlled-drug release. | Store manager, platform owner, incident commander. | Frozen. |
| Early repeat/unusual quantity | Hold and seek clarification. | Pharmacist-in-charge. | Blocked or partial only if justified. |
| Stock discrepancy for prescribed item | Freeze affected batch and request count/reconciliation. | Store manager and reconciliation owner. | Blocked for affected batch. |
| AI/OCR suggestion conflicts with prescription | Ignore AI output; manually verify. | Platform owner if systematic. | Pharmacist decision only. |
| Provider/payment state inconsistent | Do not release if payment/provider proof is required. | Provider owner and reconciliation owner. | Held/degraded. |
| Rider/customer identity mismatch | Hold delivery/return package. | Store manager and incident commander if regulated. | Not delivered. |

## Required escalation metadata

Every escalation must include severity, store, order/prescription reference, product/batch if relevant, actor, pharmacist, reason category, free-text note, current release state, next owner, target response time, and reopen criteria.
