# Production Operations SOP: Controlled Multi-Pharmacy Rollout

## Purpose

This document defines operator standard operating procedures (SOPs) for a controlled production rollout across multiple pharmacies. It is intended for store operators, pharmacists, pharmacy managers, support engineers, and incident commanders responsible for safe pharmacy opening, daily operations, prescription handling, controlled H1 handling, exception management, queue recovery, degraded operations, provider outages, backup/restore escalation, and incident escalation.

## Scope

These SOPs apply to every pharmacy participating in the controlled rollout, including pilot stores, newly onboarded stores, and stores operating under degraded or exception conditions.

## Operating Principles

- Patient safety, regulatory compliance, and auditability take priority over throughput.
- Never bypass pharmacist verification, controlled-drug controls, or documented exception approval.
- If system state is unclear, stop the affected workflow and escalate before continuing.
- Use read-only investigation first; make corrective production changes only through approved escalation paths.
- Record every operational exception with timestamp, store, user, patient or prescription reference where permitted, impact, owner, action taken, and final disposition.
- Do not share patient health information outside approved secure channels.

## Roles

| Role | Primary Responsibilities |
| --- | --- |
| Store Operator | Opening checks, customer coordination, stock movement support, refund intake, local issue reporting. |
| Pharmacist | Prescription validation, clinical checks, H1 handling, dispensing approval, shift sign-off. |
| Pharmacy Manager | Store readiness, staffing confirmation, exception approval, audit follow-up, escalation ownership. |
| Operations Lead | Rollout coordination, store go/no-go decisions, cross-store reporting, incident coordination. |
| Support Engineer | Technical triage, queue inspection, provider connectivity checks, degraded-mode support. |
| Incident Commander | Major incident coordination, severity assignment, communications cadence, resolution approval. |
| Compliance Lead | Regulatory guidance, controlled-drug exception review, audit evidence review. |

## Rollout Control Gates

Before any pharmacy is added to production rollout:

1. Confirm store profile, license details, pharmacist roster, operating hours, provider configuration, payment configuration, printer configuration, and inventory baseline.
2. Confirm staff completed operational training for all SOPs in this document.
3. Confirm at least one pharmacist and one store operator are available during the first production shift.
4. Confirm support coverage and escalation contacts are active for the store's first three operating days.
5. Confirm rollback or pause criteria are understood by the pharmacy manager and operations lead.
6. Record rollout approval, approver, date, store identifier, and any restrictions.

## Store Opening Checklist

Complete before accepting prescriptions, orders, or customer payments for the day.

### Pre-Opening Verification

- Confirm store opening owner, pharmacist on duty, and second operator where required.
- Confirm premises, dispensary, storage areas, refrigerators, restricted cabinets, and handover logs are physically secure.
- Confirm system login works for each required role using named accounts only.
- Confirm store status is set to open only after all checklist items are complete.
- Confirm store operating hours, holiday overrides, and delivery or pickup availability are correct.
- Confirm printers, scanners, label printers, barcode readers, payment devices, network connectivity, and backup connectivity are operational.
- Confirm prescription intake channels are available or explicitly marked unavailable.
- Confirm latest operational notices, provider advisories, incident notices, and rollout instructions were reviewed.

### Inventory and Environment Checks

- Confirm opening stock counts for high-value, refrigerated, H1, and fast-moving medicines match expected opening records.
- Confirm temperature logs are within acceptable range for refrigerators and controlled storage.
- Quarantine any item with temperature excursion, damaged packaging, missing batch details, suspected tampering, or expired status.
- Confirm no quarantined stock is available for dispensing.
- Confirm expiry-sensitive items are prioritized according to FEFO (first-expiry, first-out).

### Go/No-Go Decision

- Open the store only when pharmacist, stock, system, provider, payment, and device checks pass.
- If a critical check fails, keep the store in not-ready status, notify the pharmacy manager and operations lead, and record the blocker.
- If a non-critical check fails, document the limitation, assign an owner, and receive pharmacy manager approval before opening with restrictions.

## Pharmacist Shift Checklist

Complete at the start, during, and end of every pharmacist shift.

### Start of Shift

- Sign in using the pharmacist's named account; do not share credentials.
- Confirm license, registration, and role assignment are valid for the store and shift.
- Review handover notes, pending clinical clarifications, held prescriptions, H1 records, incidents, quarantined stock, and provider advisories.
- Confirm no unresolved high-severity incident blocks dispensing.
- Confirm verification queue priority: urgent clinical items, held orders, customer-waiting prescriptions, then standard queue.
- Confirm access to reference materials, prescriber contact procedures, and escalation channels.

### During Shift

- Perform clinical and legal checks before dispensing approval.
- Validate patient, prescriber, medicine, dose, route, frequency, quantity, duration, interactions, contraindications, allergies, substitutions, refills, and regulatory requirements.
- Document interventions, prescriber clarifications, substitutions, rejections, and patient counseling requirements.
- Monitor pending queues and ensure no item remains unreviewed beyond local service thresholds.
- Escalate suspicious, incomplete, altered, duplicated, or unsafe prescriptions immediately.
- Maintain H1 and controlled-drug records in real time.

### End of Shift

- Complete final review of pending, held, rejected, and dispensed items.
- Handover all unresolved clinical issues with clear owner, next action, and deadline.
- Reconcile H1 records, quarantined stock, refrigerator logs, and critical stock exceptions.
- Confirm any incident, near miss, or operational exception has been documented.
- Sign out from all systems and physically secure pharmacist-only materials.

## Stock Audit Checklist

Perform at scheduled intervals, during store opening where required, and immediately after stock-impacting incidents.

### Audit Preparation

- Assign an audit owner and independent verifier when required.
- Freeze non-urgent stock movement for the audited category where operationally feasible.
- Export or record expected stock by SKU, batch, expiry, location, and controlled status.
- Include quarantined, returned, damaged, expired, refrigerated, high-value, and H1 stock.

### Physical Count

- Count by medicine, strength, dosage form, batch, expiry date, and storage location.
- Verify FEFO placement and remove expired or near-expiry items according to policy.
- Confirm refrigerated stock has valid temperature history.
- Confirm quarantined stock is physically separated and system-blocked.
- For H1 stock, complete count with pharmacist participation and dual sign-off where required.

### Reconciliation

- Compare physical count to system count.
- Categorize variance as dispensing, receiving, transfer, return, damage, expiry, quarantine, data-entry, suspected loss, or unknown.
- Do not adjust stock without documented reason and required approval.
- Escalate any H1 variance, suspected theft, unexplained repeated variance, or patient-impacting shortage immediately.
- Record final count, variance, approver, corrective action, and audit closure time.

## Prescription Handling Checklist

Use for every prescription received through electronic, paper, phone, partner, or transfer channels.

### Intake

- Confirm prescription source, timestamp, store, patient, prescriber, and channel.
- Confirm patient identity using approved identifiers before disclosure or fulfillment.
- Check prescription completeness, legibility, authenticity, date validity, signature or digital authorization, and jurisdiction rules.
- Identify H1, controlled, high-risk, cold-chain, high-cost, pediatric, geriatric, pregnancy, allergy-sensitive, or interaction-sensitive prescriptions.
- Reject or hold prescriptions that are incomplete, suspicious, expired, duplicated, altered, outside jurisdiction, or clinically unsafe pending clarification.

### Pharmacist Review

- Complete legal, clinical, safety, stock, substitution, and counseling checks.
- Contact prescriber or patient when clarification is required.
- Document all interventions and clarification outcomes.
- Do not dispense until the pharmacist has approved the prescription.

### Fulfillment

- Pick stock by exact medicine, strength, dosage form, batch, expiry, and storage condition.
- Label according to prescription and local requirements.
- Perform independent check for medicine, quantity, patient, label, and counseling notes.
- Confirm payment, entitlement, refund, or exception status before release when applicable.
- Release only to the verified patient or authorized representative.

### Closure

- Mark prescription status accurately: dispensed, partially dispensed, held, rejected, transferred, cancelled, or pending clarification.
- Preserve required records, audit trail, labels, communications, and exception notes.
- Escalate near misses, errors, suspected fraud, adverse events, and privacy incidents.

## H1 Handling Checklist

H1 medicines require strict pharmacist oversight, documentation, and variance escalation.

### Access and Storage

- Store H1 medicines only in approved restricted storage.
- Limit access to authorized personnel and named pharmacist oversight.
- Keep H1 stock segregated from general stock where required.
- Confirm storage conditions and physical security at opening, shift handover, and closing.

### Prescription Validation

- Confirm prescription validity, prescriber authorization, patient identity, indication where required, quantity limits, refill restrictions, and jurisdiction-specific documentation.
- Check duplicate therapy, early refill attempts, suspicious patterns, forged or altered documents, and unusual quantities.
- Hold and escalate any suspicious or incomplete H1 prescription before dispensing.

### Dispensing and Recordkeeping

- Dispense H1 only after pharmacist approval.
- Record medicine, strength, quantity, batch, expiry, patient reference, prescriber reference, dispensing pharmacist, date, and transaction reference.
- Require second check or dual sign-off where local policy requires it.
- Update H1 register immediately after dispensing, receiving, transfer, return, destruction, or adjustment.

### Variance and Exception Handling

- Treat any unexplained H1 stock variance as high severity.
- Stop H1 dispensing for the affected item until reconciliation or manager-approved continuation.
- Notify the pharmacy manager, compliance lead, and operations lead.
- Preserve evidence, access logs, transaction logs, CCTV references where applicable, and physical stock.
- Complete variance report and regulatory notification if required.

## Refund Exception Checklist

Use when a refund is outside standard automated policy, has clinical implications, involves partial fulfillment, or may affect stock and audit records.

### Eligibility Review

- Confirm original order, prescription status, payment status, fulfillment status, patient identity, and refund reason.
- Confirm whether the medicine was dispensed, handed over, delivered, returned, damaged, spoiled, recalled, unavailable, or cancelled.
- Confirm whether the item can legally and safely return to saleable stock; default to non-saleable unless policy explicitly permits otherwise.
- Confirm whether any insurer, benefit provider, coupon, wallet, or split payment is involved.

### Approval

- Require pharmacy manager approval for non-standard refunds.
- Require pharmacist approval when the refund relates to dispensed medication, substitution, adverse event, clinical error, or prescription cancellation.
- Require compliance or operations lead approval for H1, suspected fraud, high-value refund, repeated customer exception, or audit-sensitive case.

### Processing

- Record refund reason, approver, amount, payment rail, stock disposition, prescription status, and customer communication.
- Do not issue cash or off-system refund unless approved by finance and operations leadership.
- Quarantine returned medication unless explicitly approved for resale under policy.
- Confirm refund completion, failed refund retry status, or manual finance follow-up.

## Dead-Letter Queue Handling

Use when asynchronous jobs, provider callbacks, prescription events, payment events, notification events, inventory events, or integration messages fail repeatedly and enter a dead-letter queue (DLQ).

### Triage

- Identify queue name, message type, store, affected entity, first failure time, last failure time, retry count, error class, and customer or patient impact.
- Determine whether the message is safe to replay, requires data correction, is obsolete, is duplicated, or must be discarded with approval.
- Check for active incidents, provider outages, schema mismatches, deployment changes, credential failures, and rate limits.
- Prioritize messages that block patient safety, dispensing, payment capture, refund completion, stock integrity, or H1 records.

### Handling

- Do not bulk replay messages until root cause is understood.
- Replay a small controlled sample after confirming idempotency and downstream readiness.
- For non-idempotent messages, use a documented repair plan and approval from support engineering and operations lead.
- For patient-impacting messages, coordinate with pharmacist or store operator before changing operational status.
- Preserve original payload, error, replay attempt, operator, timestamp, and outcome.

### Closure

- Confirm downstream state is correct after replay, repair, or discard.
- Confirm no duplicate prescription, duplicate payment, duplicate refund, or incorrect stock movement occurred.
- Document root cause, affected records, remediation, residual risk, and prevention follow-up.
- Escalate recurring DLQ patterns to incident management.

## Degraded Mode Handling

Degraded mode is used when one or more non-negotiable production capabilities are impaired but safe restricted operation remains possible.

### Entry Criteria

Enter degraded mode only with pharmacy manager and operations lead approval when any of the following occurs:

- Intermittent provider connectivity affects prescription, payment, inventory, notification, or identity workflows.
- Local device failure affects printing, scanning, payment, or labeling, but safe manual workaround exists.
- Queue delays affect order progression but can be monitored and reconciled.
- Reporting or analytics are delayed while transactional workflows remain safe.
- Support engineering confirms the system can safely operate with defined restrictions.

### Operating Restrictions

- Publish clear store restrictions to staff and affected customers where appropriate.
- Reduce order intake if pharmacist review, stock accuracy, or payment confirmation is delayed.
- Do not use degraded mode to bypass pharmacist approval, H1 records, patient identity checks, or payment controls.
- Maintain manual logs for any workflow that cannot be recorded immediately in system.
- Reconcile manual logs into system as soon as service is restored.

### Exit Criteria

- Confirm affected services are stable for the agreed observation window.
- Confirm backlog, manual logs, DLQ items, payment exceptions, prescription holds, and stock movements are reconciled.
- Obtain operations lead approval to return to normal mode.
- Document start time, end time, restrictions, affected stores, impact, and reconciliation results.

## Provider Outage Handling

Use when an external provider is unavailable, degraded, returning errors, or producing inconsistent responses.

### Detection

- Confirm provider name, service area, affected stores, symptoms, start time, error rates, and provider status communication.
- Determine whether the outage affects prescriptions, identity, payments, refunds, notifications, delivery, inventory, insurance, or clinical data.
- Check whether failures are total, partial, intermittent, region-specific, credential-related, rate-limit-related, or data-specific.

### Response

- Notify operations lead, support engineering, and impacted pharmacy managers.
- Pause workflows that cannot safely proceed without the provider.
- Use approved fallback workflows only if patient safety, compliance, payment integrity, and auditability are maintained.
- Capture failed requests, correlation identifiers, timestamps, and provider responses.
- Avoid repeated manual retries that could create duplicate payments, prescriptions, notifications, or stock movements.

### Recovery

- Confirm provider recovery through health checks, successful test transactions, and provider communication where available.
- Drain backlog in controlled batches and monitor error rate, duplicates, and downstream state.
- Reconcile pending prescriptions, payments, refunds, notifications, stock updates, and DLQ items.
- Communicate recovery status, remaining backlog, and customer impact to pharmacy managers.
- Record outage timeline, impact, workaround, recovery actions, and follow-up owner.

## Backup/Restore Escalation

Backup and restore actions can affect patient records, prescription state, payment state, stock records, audit trails, and legal compliance. They must be escalated before execution.

### Backup Verification

- Confirm backups are completing according to production schedule.
- Confirm backup scope includes required transactional data, configuration, audit logs, and operational records.
- Confirm restore tests are performed according to the approved cadence.
- Escalate missed, failed, incomplete, corrupt, or delayed backups immediately.

### Restore Escalation Criteria

Escalate before any restore when:

- Production data loss, corruption, incorrect migration, accidental deletion, or ransomware is suspected.
- Prescription, H1, stock, payment, refund, audit, or patient records may be affected.
- Point-in-time recovery could overwrite valid transactions.
- A partial restore or manual data reconstruction is being considered.

### Restore Approval Path

1. Support engineer confirms technical scope, suspected root cause, affected systems, and recovery options.
2. Operations lead confirms business impact, affected stores, operational restrictions, and communication needs.
3. Compliance lead confirms patient record, H1, audit, and regulatory implications.
4. Engineering lead confirms restore plan, validation plan, rollback plan, and expected recovery point/time.
5. Incident commander authorizes execution for major incidents.

### Post-Restore Validation

- Validate prescriptions, H1 register, stock counts, payment/refund state, user access, audit logs, provider sync, and DLQ state.
- Reconcile transactions created between recovery point and restoration time.
- Keep affected stores in restricted operation until reconciliation is complete.
- Document recovery point, recovery time, data gaps, corrective actions, approvals, and customer impact.

## Incident Escalation Matrix

| Severity | Definition | Examples | Initial Response Time | Required Escalation | Communications Cadence |
| --- | --- | --- | --- | --- | --- |
| SEV-1 Critical | Active or likely patient safety, legal, privacy, payment integrity, or multi-store dispensing impact. | Wrong medicine dispensed at scale, H1 unexplained variance, production data loss, widespread prescription outage, confirmed privacy breach. | Immediate, target 15 minutes. | Incident commander, operations lead, engineering lead, compliance lead, pharmacy managers for affected stores, executive sponsor. | Every 30 minutes until stabilized, then hourly until resolved. |
| SEV-2 High | Significant single-store or limited multi-store impact with workaround or contained risk. | Provider outage blocks one region, DLQ blocks dispensing queue, payment capture uncertainty, stock variance with patient impact. | Target 30 minutes. | Operations lead, support engineering, pharmacy manager, compliance lead if regulated data or H1 involved. | Hourly until stabilized, then at agreed milestones. |
| SEV-3 Medium | Operational degradation without immediate patient safety impact. | Printer failure with approved workaround, delayed notifications, non-critical reporting outage, limited refund processing delay. | Target 4 business hours. | Pharmacy manager, support engineering, operations lead if rollout risk exists. | Daily or per shift until resolved. |
| SEV-4 Low | Minor issue, inquiry, or cosmetic defect with no operational restriction. | Typo in non-critical template, minor dashboard display issue, informational request. | Target 2 business days. | Owning support queue or product operations. | On status change or closure. |

### Universal Escalation Triggers

Escalate immediately, regardless of current severity, when any of the following occurs:

- Patient harm, suspected patient harm, or credible risk of patient harm.
- H1 variance, suspected diversion, forged prescription, or regulatory reporting concern.
- Unauthorized access, privacy breach, or suspected data exposure.
- Duplicate or missing payment/refund at scale.
- Data loss, corruption, restore consideration, or audit trail gap.
- Multiple stores affected during controlled rollout.
- A workaround requires manual handling of prescription, payment, H1, or stock records.

## Required Incident Record Fields

Every incident or operational exception must include:

- Incident identifier and severity.
- Store or stores affected.
- Start time, detection time, escalation time, mitigation time, and closure time.
- Reporter, owner, incident commander where assigned, and approvers.
- Impact summary, affected workflows, affected records, and customer or patient impact.
- Immediate containment actions.
- Root cause or current hypothesis.
- Corrective actions, preventive actions, and follow-up owners.
- Evidence links, logs, screenshots, provider references, and audit notes where permitted.

## Controlled Rollout Pause Criteria

Pause onboarding of additional pharmacies when:

- Any SEV-1 is open.
- Any unresolved SEV-2 affects prescription handling, H1 handling, payment integrity, stock integrity, or provider stability.
- Repeated DLQ, provider, refund, or stock reconciliation issues occur across more than one store.
- Training gaps, staffing gaps, or checklist non-compliance are identified.
- Compliance lead, operations lead, or incident commander determines rollout risk is unacceptable.

Resume rollout only after closure or documented mitigation, stakeholder approval, and review of lessons learned.
