# PHARMACIST_OPERATIONS_SOP

Updated: 2026-05-10.

## Purpose and non-claims

This SOP converts existing software controls into executable pharmacist operations for prescription intake, validation, regulated dispensing, exceptions, and emergency fallback. It is an operating doctrine only: it does **not** claim legal approval, statutory compliance certification, pharmacist signoff, or real-world coverage. Controlled launch still requires signed pharmacist-in-charge acknowledgement, legal/compliance review, named staff roster, and observed drills.

## Control separation

| Area | Software controls | Pharmacist responsibilities | Legal assumptions | Operational assumptions |
| --- | --- | --- | --- | --- |
| Prescription capture | Upload/intake records, PHI/PII redaction, audit logs, AI/OCR assistive extraction, pharmacist-gated review states. | Confirm patient/order match, legibility, medicine, strength, directions, duration, date, prescriber identity where required, and appropriateness for dispensing scope. | Jurisdiction-specific prescription validity and schedule rules must be reviewed outside this repo. | A licensed pharmacist is assigned and available before regulated release. |
| H/H1/X release | Hard gates, H1 register surfaces, no AI release authority, audit trail, dead-letter on prohibited automation. | Decide whether the medicine can be dispensed, complete statutory/manual records where required, reject or escalate uncertain cases. | The platform is not evidence of licence sufficiency or controlled-drug permission. | Store capability, licence details, and controlled-drug scope have been independently verified. |
| Stock discrepancy | stockInvariant, batch ledger, reconciliation truth, quarantine/adjustment audit. | Stop sale of affected batch until discrepancy is explained or quarantined; approve clinical release only when stock truth is trusted. | Disposal/return rules require local legal/compliance review. | Manager and pharmacist jointly review discrepancies before reopening sale. |
| Overrides | Manual override audit reason, approval fields, reconciliation review. | Refuse overrides that bypass prescription, H/H1/X, clinical judgement, or stock truth gates. | Override authority does not supersede law or pharmacist judgement. | Override reviewer is named, trained, and independent from the initiating actor where feasible. |

## Prescription intake SOP

1. Accept prescriptions only through approved app, WhatsApp/helpdesk, counter, or admin intake channels that preserve order linkage and audit metadata.
2. Verify the customer/order identity without exposing PHI/PII in public logs or non-staff channels.
3. Confirm the image/document is readable enough for pharmacist review; if not, mark rejected/needs-resubmission rather than inferring missing details.
4. AI/OCR output may pre-fill candidate data, but must be labelled assistive and cannot approve, reject, substitute, diagnose, recommend dosage, or release regulated medicine.
5. If the order contains any prescription-required, Schedule H, Schedule H1, Schedule X, controlled-drug, cold-chain, or high-risk item, hold packing and delivery until pharmacist verification is complete.

## Prescription validation SOP

The pharmacist must check, at minimum:

- Patient identity/order match and duplicate order risk.
- Medicine name, generic/brand ambiguity, strength, dosage form, quantity, duration, directions, and refills/repeats.
- Prescription date, prescriber details where required, and whether the prescription appears altered, expired, incomplete, or illegible.
- Contraindication/allergy warnings available in the system as advisory only; final judgement remains pharmacist-owned.
- Stock batch, expiry, FEFO pick, storage condition, and whether any stock discrepancy is open for the item or batch.

If any required element is uncertain, the pharmacist must select a non-release outcome: reject, hold for clarification, escalate to prescriber/customer, or emergency stop if suspicious/fraudulent/unsafe.

## Pharmacist verification SOP

| Outcome | Required action | Audit requirement |
| --- | --- | --- |
| Approve | Record pharmacist ID, timestamp, reviewed prescription/order, approved lines/quantities, and any notes. | Pharmacist approval event and order state transition. |
| Partial approve | Approve only lines supported by prescription and stock truth; reject/hold remaining lines. | Per-line approval/rejection reason. |
| Reject | Provide operational reason without exposing unnecessary PHI; communicate customer resubmission path. | Rejection reason, pharmacist ID, timestamp. |
| Hold/escalate | Assign owner, target response time, and next review time. | Escalation metadata and unresolved queue entry. |
| Emergency stop | Freeze order/batch/store capability as needed; notify incident commander and manager. | Stop-the-line event with reason and authority. |

## H/H1 handling SOP

- H/H1 medicines remain fail-closed until a pharmacist verifies prescription validity and store capability.
- H1 statutory record fields must be completed according to reviewed local requirements; missing statutory context blocks release.
- No staff member, AI/OCR output, rider, customer-support actor, or manager may bypass pharmacist verification.
- If prescription validity, identity, quantity, repeat legitimacy, or controlled-drug scope is uncertain, do not dispense; escalate under `PHARMACIST_ESCALATION_RULES.md`.
- Duplicate H1 release attempts must be reviewed as an incident until reconciliation proves a harmless duplicate event.

## Repeat prescription handling SOP

1. Treat every repeat/refill as a new release decision unless a legally reviewed repeat process exists and is attached as evidence.
2. Confirm previous fill date, remaining authorized quantity/refills, clinical appropriateness, and whether customer details changed.
3. Do not auto-release prescription-required items from reminder/adherence workflows.
4. Any early refill, dose change, unusual quantity, or customer request inconsistent with prescription must be pharmacist-escalated.

## Rejected prescription handling SOP

- Classify reasons using controlled categories: illegible, missing prescriber detail, expired/invalid, medicine mismatch, quantity mismatch, suspected alteration/fraud, customer mismatch, unsupported controlled-drug scope, legal/compliance review required, other pharmacist note.
- Communicate only the minimum necessary resubmission instruction.
- Do not preserve rejected images outside approved vault/retention policy.
- Rejected regulated orders remain blocked from packing, rider handoff, and delivery.

## Stock discrepancy handling SOP

1. On discrepancy, freeze affected batch/location from ordinary sale if stock truth cannot be proven.
2. Perform physical count by two staff where feasible; pharmacist must participate when regulated items are affected.
3. Compare purchase invoice, batch ledger, reservations, sales, returns, refunds, transfers, and dead-lettered jobs.
4. Use manual override only with reason, before/after values, approver, and reconciliation review reference.
5. Reopen stock only after reconciliation owner records explanation or quarantine/disposal/adjustment path.

## Controlled-drug escalation SOP

- Use `CONTROLLED_DRUG_HANDLING_SOP.md` for detailed controls.
- Controlled-drug uncertainty automatically escalates to pharmacist-in-charge and incident commander.
- If store licence/capability is not verified, keep order blocked and do not substitute with an unreviewed alternative.

## Emergency stop procedures

Emergency stop may be initiated by pharmacist, store manager, incident commander, or platform owner for patient-safety, regulated-medicine, stock-truth, PHI/PII/security, provider-failure, or reconciliation-risk reasons. Stop scope may be line, order, batch, store, provider, or full launch freeze. Record reason, scope, actor, timestamp, affected entities, customer communication owner, rollback owner, reconciliation owner, and reopen criteria.

## Degraded-mode operations

| Degradation | Allowed | Not allowed |
| --- | --- | --- |
| Payment provider down | Cash/manual hold process if approved by manager and reconciled daily. | Marking provider_unconfigured/demo/skipped as paid. |
| OCR down | Manual pharmacist/staff data entry from prescription. | AI or staff guessing unreadable prescription data. |
| WhatsApp/SMS down | Phone/counter communication logged manually. | Unlogged PHI/PII sharing or untracked release. |
| Queue/dead-letter backlog | Pause affected automation, manual review queue, incident escalation. | Ignoring dead letters during launch window. |
| Inventory uncertainty | Freeze affected batch, manual count, reconciliation review. | Selling through negative/untrusted stock. |
| App/admin outage | Use approved manual fallback packet and later backfill under audit. | Bulk un-audited dispensing or bypassing pharmacist gates. |

## Manual fallback procedures

Manual fallback is a temporary safety procedure, not an alternate production system. Each fallback entry must later be reconciled into the system with: actor, time, store, customer/order reference, prescription reference, items, batch/expiry, payment state, delivery state, pharmacist decision, reason for fallback, and reconciliation reviewer. Fallback cannot be used to bypass H/H1/X, AI, stockInvariant, PHI/PII, or reconciliation truth controls.
