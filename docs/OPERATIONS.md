# Operations Handbook

This handbook defines the operational procedures for 24/7 Pharmacy OS stores. It is executable doctrine: who does what, when, and what evidence they capture. It does not replace pharmacist judgement, legal review, or the signed staff roster required before controlled production.

See also: [COMPLIANCE.md](./COMPLIANCE.md), [RUNTIME.md](./RUNTIME.md), [AGENTS.MD](../AGENTS.MD).

---

## Daily operations

### Store opening

A store may not begin regulated dispensing for the shift until all opening checks are complete and a licensed pharmacist is confirmed.

**Who:** Store manager + pharmacist. **When:** Before the first regulated order is released.

| Area | Check | Fail-closed action |
|------|-------|--------------------|
| Staff access | Named staff logged in with role and store scope; no shared admin accounts. | Disable shift start for affected user; escalate to manager. |
| Pharmacist coverage | Pharmacist identity and registration details on file; shift time and escalation contact confirmed. | Block prescription/H/H1/X release until pharmacist is confirmed. |
| Queue review | Overnight prescriptions, rejected/held orders, repeat requests, failed deliveries, unresolved customer contacts. | Assign owner and review time before accepting new regulated release. |
| Dead letters | Provider/worker dead-letter counts, oldest age, failed webhooks, OCR/payment/notification failures. | Escalate if launch threshold exceeded; pause affected automation. |
| Inventory spot-check | H/H1/X, controlled-drug, high-value, cold-chain, quarantine, near-expiry, negative/near-zero stock. | Freeze affected batch; open discrepancy ticket. |
| Reconciliation carryover | Prior closing variance, refunds, cash/manual transactions, supplier invoice disputes, pending overrides. | Manager signoff required before ordinary operations resume. |
| Rider readiness | Named riders, delivery handoff method, POD device/process, COD exposure rules. | Do not dispatch without accountable rider handoff. |
| Emergency controls | Emergency stop contacts, incident commander, rollback/freeze procedure, manual fallback packet available. | Delay opening if no emergency owner is reachable. |

**Opening signoff fields (record and retain):** Store, date/time, opening manager, pharmacist, incident commander contact, unresolved blockers accepted/rejected, controlled-drug status (closed/open/frozen), first reconciliation checkpoint time.

---

### Shift handoff

Ensures each shift transfers clinical, stock, commercial, provider, and incident responsibility without relying on tribal knowledge.

**Required participants:**
- Outgoing pharmacist or pharmacist-in-charge when regulated queues exist.
- Incoming pharmacist before any H/H1/X or prescription-required release.
- Store manager or shift lead.
- Incident commander if any P0/P1 incident, emergency stop, launch freeze, provider outage, or unresolved reconciliation drift is open.

| Domain | Required review | Required evidence |
|--------|----------------|-------------------|
| Queue review | New prescription orders, held/rejected prescriptions, H/H1/X holds, pending repeat requests, unresolved customer contacts. | Queue snapshot timestamp, owner, next action. |
| Shift reconciliation | Sales, refunds, payments, cash/manual transactions, cancelled orders, partial approvals. | Shift reconciliation note and variance list. |
| Inventory spot-checks | High-value, H/H1/X, cold-chain, negative/near-zero, quarantined, discrepancy batches. | Count results, discrepancy IDs, frozen/reopened status. |
| Rider handoff | Orders packed, out-for-delivery, failed delivery, COD/cash exposure, POD gaps. | Delivery task list and rider acknowledgement. |
| Dead-letter review | Provider dead letters, worker dead letters, retry queues, unresolved webhooks. | Dead-letter count, oldest age, owner. |
| Overrides | Manual overrides since prior handoff, reasons, approvals, reconciliation linkage. | Override review log. |
| Refund review | Initiated/failed/successful refunds, reversal postings, customer communication. | Refund ledger/reconciliation status. |
| Incidents | Open incidents, emergency stops, degraded mode, rollback/freeze status. | Incident ID, commander, next checkpoint. |

**Stop-the-line triggers during handoff:** Stop regulated release until resolved if any of the following are unknown: incoming pharmacist identity, prescription queue owner, H/H1/X held order state, affected batch stock truth, dead-letter owner for provider release messages, cash/payment variance owner, or emergency stop reopen criteria.

**Signoff fields:** Outgoing and incoming shift owners record names/roles, store, time, open blockers, unresolved drift, explicit acceptance of pharmacist gates, controlled-drug capability status.

---

### Store closing

Closing is not complete until unresolved clinical, stock, commercial, provider, and delivery items are assigned to a named next owner.

**Who:** Store manager + pharmacist (for regulated items). **When:** End of each operating shift.

| Area | Required closeout | Escalate if |
|------|------------------|-------------|
| Prescription queue | No unowned H/H1/X/rejected/held/repeat orders; pending items assigned to next pharmacist. | Any regulated order lacks pharmacist owner. |
| Shift reconciliation | Sales, payment provider statuses, cash/manual transactions, refunds, cancellations, journal/reversal status. | Any variance lacks reason/owner. |
| Inventory | Spot-check regulated/high-value/cold-chain/quarantine/near-expiry batches; record discrepancies. | Negative stock, missing batch, unexplained movement, open controlled-drug discrepancy. |
| Rider/delivery | Returned medicines, failed delivery, COD, POD gaps, customer communication. | Rider handoff or cash exposure is unacknowledged. |
| Dead letters | Provider/worker dead letters, retry queue, oldest age, unresolved webhooks. | Dead-letter owner or next action missing. |
| Overrides | All shift overrides with reason, approver, before/after, reconciliation link. | Any override lacks reason or appears to bypass gates. |
| Supplier disputes | New invoice mismatch, duplicate suspicion, credit note/refund linkage. | Supplier/store/invoice-number duplicate or mismatch not assigned. |
| Incidents | Status, commander, freeze/rollback state, reopen criteria, next checkpoint. | P0/P1 incident lacks commander or log. |

**Closing signoff fields:** Store, date/time, closing manager, pharmacist, cash/payment variance, stock variance, dead-letter count/oldest age, override count, refund variance, open incidents, handoff owner, next review time.

---

### Daily runtime review

Run once per operating day. Do not include secrets, PHI, PII, patient identifiers, full phone numbers, prescriptions, or payment credentials in evidence notes.

**Required capture:**
- Date/time, environment, operator, artifact ID.
- Liveness, readiness, deployment summary, provider readiness, worker queue, dead-letter snapshots.
- Payment/refund exception count; unresolved provider event count.
- OCR exception queue count.
- WhatsApp/SMS delivery failure count.
- Stock anomaly count, negative stock count, regulated-release exception count.
- Backup job status and latest checksum location.
- Open incidents, owner, severity, next review time.

**Stop-the-line triggers:**
- Readiness fails for database, migrations, stock reservation sanity, or worker queue.
- Dead letters grow without assigned owner.
- Any stock-changing operation proceeds while DB readiness is unsafe.
- Payment success is marked without provider settlement evidence.
- H/H1/pharmacist gate is bypassed.
- PHI/PII appears in logs, dashboards, screenshots, or evidence attachments.

---

## Pharmacist operations

### Prescription intake SOP

1. Accept prescriptions only through approved app, WhatsApp/helpdesk, counter, or admin intake channels that preserve order linkage and audit metadata.
2. Verify customer/order identity without exposing PHI/PII in public logs or non-staff channels.
3. Confirm the image/document is readable enough for pharmacist review. If not, mark as rejected/needs-resubmission rather than inferring missing details.
4. AI/OCR output may pre-fill candidate data but must be labelled assistive and cannot approve, reject, substitute, diagnose, recommend dosage, or release regulated medicine.
5. If the order contains any prescription-required, Schedule H, Schedule H1, Schedule X, controlled-drug, cold-chain, or high-risk item, hold packing and delivery until pharmacist verification is complete.

---

### Prescription validation SOP

The pharmacist must check, at minimum:

- Patient identity/order match and duplicate order risk.
- Medicine name, generic/brand ambiguity, strength, dosage form, quantity, duration, directions, and refills/repeats.
- Prescription date, prescriber details where required, whether the prescription appears altered, expired, incomplete, or illegible.
- Contraindication/allergy warnings available in the system as advisory only; final judgement remains pharmacist-owned.
- Stock batch, expiry, FEFO pick, storage condition, any open stock discrepancy for the item or batch.

If any required element is uncertain, the pharmacist must select a non-release outcome: reject, hold for clarification, escalate to prescriber/customer, or emergency stop if suspicious/fraudulent/unsafe.

---

### Pharmacist verification outcomes

| Outcome | Required action | Audit requirement |
|---------|----------------|-------------------|
| Approve | Record pharmacist ID, timestamp, reviewed prescription/order, approved lines/quantities, and notes. | Pharmacist approval event and order state transition. |
| Partial approve | Approve only lines supported by prescription and stock truth; reject/hold remaining lines. | Per-line approval/rejection reason. |
| Reject | Provide operational reason without exposing unnecessary PHI; communicate resubmission path. | Rejection reason, pharmacist ID, timestamp. |
| Hold/escalate | Assign owner, target response time, next review time. | Escalation metadata and unresolved queue entry. |
| Emergency stop | Freeze order/batch/store capability as needed; notify incident commander and manager. | Stop-the-line event with reason and authority. |

---

### Schedule H/H1/X handling SOP

- H/H1/X medicines remain fail-closed until a pharmacist verifies prescription validity and store capability.
- H1 statutory record fields must be completed according to reviewed local requirements; missing statutory context blocks release.
- No staff member, AI/OCR output, rider, customer-support actor, or manager may bypass pharmacist verification.
- If prescription validity, identity, quantity, repeat legitimacy, or controlled-drug scope is uncertain, do not dispense; escalate immediately.
- Duplicate H1 release attempts must be reviewed as an incident until reconciliation proves a harmless duplicate event.
- H1 records must be retained for a minimum of three years (see [COMPLIANCE.md](./COMPLIANCE.md) §H1 record retention).

---

### Substitution governance

**Substitution is strictly prohibited.** Under the Pharmacy Act and Pharmacy Practice Regulations, registered pharmacists shall dispense only those medicines as prescribed and shall not substitute the prescription. This is non-negotiable. AI must never suggest, recommend, or enable substitution. Any request to substitute a prescribed medicine must be rejected and, if suspicious, escalated as a compliance incident.

---

### Controlled drug handling SOP

**Scope:** Every controlled-drug purchase, stock movement, sale, packing, rider handoff, delivery, return, disposal, or adjustment requires pharmacist-controlled review and audit evidence.

1. **Capability check:** Confirm store controlled-drug capability is approved in the evidence register. If not confirmed, keep capability frozen.
2. **Prescription verification:** Pharmacist validates prescription details and identity. Uncertain cases are rejected or escalated.
3. **Stock verification:** Pharmacist/manager jointly verify batch, expiry, quantity, storage, and ledger status before picking.
4. **Statutory record:** Complete required controlled-drug/H1 records according to reviewed local process; missing fields block release.
5. **Packing:** Segregate from ordinary orders; pharmacist or delegated trained staff records pack confirmation.
6. **Rider handoff:** Rider receives sealed package with non-PHI minimal label and delivery task. No substitution or partial delivery without pharmacist review.
7. **Failed delivery/return:** Return directly to store owner; reconcile package, batch, and register before restocking/quarantine.
8. **Discrepancy:** Emergency freeze affected item/batch/store capability and escalate to pharmacist-in-charge, store manager, and incident commander.

**Escalation triggers for controlled drugs:**
- Suspected forged/altered prescription.
- Early refill or unusual quantity.
- Missing/expired prescription details.
- Batch count mismatch or broken seal.
- Store capability/licence uncertainty.
- Duplicate H1/statutory record attempt.
- Rider loss, failed return, or POD/customer mismatch.

---

### Pharmacist escalation rules

**Non-negotiable:** The pharmacist may stop any prescription, H/H1/X, controlled-drug, substitution, stock-discrepancy, or patient-safety workflow. AI, customer-support, rider, manager, provider status, SLA pressure, or revenue pressure cannot override pharmacist judgement.

| Trigger | Pharmacist action | Escalate to | Release state |
|---------|------------------|-------------|---------------|
| Illegible/incomplete prescription | Reject or hold for resubmission/clarification. | Store manager if customer dispute; incident commander if repeated/fraud risk. | Blocked. |
| Suspected forged/altered prescription | Emergency hold and evidence preservation. | Pharmacist-in-charge, store manager, incident commander, legal/compliance owner. | Blocked/frozen. |
| H/H1/X uncertainty | Hold; complete statutory/context review. | Pharmacist-in-charge and legal/compliance owner if policy unclear. | Blocked. |
| Controlled-drug capability uncertainty | Freeze controlled-drug release. | Store manager, platform owner, incident commander. | Frozen. |
| Early repeat/unusual quantity | Hold and seek clarification. | Pharmacist-in-charge. | Blocked or partial only if justified. |
| Stock discrepancy for prescribed item | Freeze affected batch; request count/reconciliation. | Store manager and reconciliation owner. | Blocked for affected batch. |
| AI/OCR suggestion conflicts with prescription | Ignore AI output; manually verify. | Platform owner if systematic. | Pharmacist decision only. |
| Provider/payment state inconsistent | Do not release if payment/provider proof is required. | Provider owner and reconciliation owner. | Held/degraded. |
| Rider/customer identity mismatch | Hold delivery/return package. | Store manager and incident commander if regulated. | Not delivered. |

**Required escalation metadata:** Severity, store, order/prescription reference, product/batch if relevant, actor, pharmacist, reason category, free-text note, current release state, next owner, target response time, reopen criteria.

---

### Repeat prescription handling SOP

1. Treat every repeat/refill as a new release decision unless a legally reviewed repeat process exists and is attached as evidence.
2. Confirm previous fill date, remaining authorized quantity/refills, clinical appropriateness, and whether customer details changed.
3. Do not auto-release prescription-required items from reminder/adherence workflows.
4. Any early refill, dose change, unusual quantity, or customer request inconsistent with the prescription must be pharmacist-escalated.

---

### Degraded-mode operations

| Degradation | Allowed | Not allowed |
|------------|---------|-------------|
| Payment provider down | Cash/manual hold process if approved by manager and reconciled daily. | Marking provider_unconfigured/demo/skipped as paid. |
| OCR down | Manual pharmacist/staff data entry from prescription. | AI or staff guessing unreadable prescription data. |
| WhatsApp/SMS down | Phone/counter communication logged manually. | Unlogged PHI/PII sharing or untracked release. |
| Queue/dead-letter backlog | Pause affected automation; manual review queue; incident escalation. | Ignoring dead letters during launch window. |
| Inventory uncertainty | Freeze affected batch; manual count; reconciliation review. | Selling through negative/untrusted stock. |
| App/admin outage | Use approved manual fallback packet; later backfill under audit. | Bulk un-audited dispensing or bypassing pharmacist gates. |

**Manual fallback rule:** Every fallback entry must later be reconciled into the system with: actor, time, store, customer/order reference, prescription reference, items, batch/expiry, payment state, delivery state, pharmacist decision, reason for fallback, and reconciliation reviewer. Fallback cannot bypass H/H1/X, AI, stockInvariant, PHI/PII, or reconciliation truth controls.

---

## Incident response

### Incident commander runbook

**First 15 minutes:**

1. Record reporter, time, severity, affected store/order/batch/provider/system, and immediate safety risk.
2. Freeze the narrowest safe scope; broaden immediately if patient safety, PHI/PII, H/H1/X, controlled-drug, stock truth, or payment truth may be affected.
3. Assign incident commander if not already assigned.
4. Notify pharmacist-in-charge for clinical/regulated/stock discrepancy risks.
5. Notify store manager for local operations, delivery, payment/cash, staffing, and customer communications.
6. Notify platform/provider owner for runtime, queue, provider, security, rollback, or data risk.
7. Preserve evidence with minimum PHI/PII exposure.

**Decision tree:**

| Question | If yes | If no |
|----------|--------|--------|
| Patient safety or regulated release risk? | Stop affected dispensing immediately; pharmacist owns release decision. | Continue triage. |
| PHI/PII/security exposure? | Freeze affected access/channel, preserve logs, escalate legal/compliance. | Continue triage. |
| Stock or reconciliation truth uncertain? | Freeze affected batch/order/workflow until reconstruction. | Continue triage. |
| Provider state unreliable? | Degrade/disable affected provider workflow; no fake success. | Continue triage. |
| Deployment caused incident? | Prepare rollback with platform owner; verify data/reconciliation after rollback. | Continue operational mitigation. |

**Closure checklist:**
- Safety risk contained and release state correct.
- Pharmacist/manager/provider/platform owners have closed domain actions.
- Stock/commercial/reconciliation/dead-letter impacts reviewed.
- Customer communications complete where needed.
- Evidence stored without unnecessary PHI/PII.
- Root cause, prevention, training/doc updates, reopen criteria recorded.

---

### Escalation matrix

**Severity definitions:**

| Severity | Examples | Required response |
|----------|----------|-------------------|
| P0 stop-the-line | Patient-safety risk, H/H1/X gate bypass, PHI/PII exposure, uncontrolled stock mutation, payment marked paid without provider proof, production data loss, unauthorized access, controlled-drug discrepancy. | Immediate freeze/stop; incident commander assigned; pharmacist/manager notified; evidence preservation; hourly checkpoints until contained. |
| P1 launch blocker | Provider outage affecting release, dead-letter backlog beyond threshold, unresolved reconciliation drift, failed rollback/restore rehearsal, staff access scope error, supplier duplicate dispute blocking purchasing. | Same-day owner; affected workflow paused or degraded; daily checkpoint until closed. |
| P2 scale blocker | Missing SLA rollup, recurring provider latency, UX/operator friction, incomplete command-center metric. | Planned remediation owner and target date. |
| P3 improvement | Non-critical polish or training reinforcement. | Backlog and training update. |

**Roles and authority:**

| Role | Primary responsibility | Authority |
|------|----------------------|-----------|
| Incident commander | Own incident timeline, decisions, communications, evidence, checkpoint cadence, closure review. | Can freeze launch scope, coordinate rollback, require emergency stop, assign owners. |
| Pharmacist-in-charge | Own clinical/regulated release decisions and H/H1/X/controlled-drug safety. | Stop-the-line authority for any dispensing or prescription concern; cannot be overruled by software/AI/manager convenience. |
| Store manager | Own staffing, cash/payment reconciliation, rider handoff, local inventory discipline, customer operational communication. | Stop ordinary store operations for stock/payment/staffing risk; request provider/rollback escalation. |
| Platform owner | Own release artifact, runtime, feature flags/freeze, rollback execution, data preservation. | Emergency freeze and rollback authority with incident commander approval. |
| Provider owner | Own payment/OCR/WhatsApp/SMS/maps/storage/accounting provider incident tracking. | Disable or degrade provider-dependent workflows; cannot mark fake success. |

**Escalation chain:**
1. Detect and record incident with severity, scope, entities, reporter, and immediate safety action.
2. Assign incident commander for P0/P1.
3. Notify pharmacist-in-charge for prescription, H/H1/X, controlled-drug, stock discrepancy, or patient-safety risk.
4. Notify store manager for staffing, delivery, payment, cash, inventory, customer-facing, or rider risks.
5. Notify provider owner for provider/webhook/dead-letter failures.
6. Notify platform owner for deploy, rollback, database, queue, security, or access risks.
7. Preserve logs/evidence with PHI/PII minimization.
8. Close only after reconciliation, customer/provider/staff follow-up, and post-incident review.

---

### Stop-the-line procedure

Emergency stop may be initiated by pharmacist, store manager, incident commander, or platform owner for patient-safety, regulated-medicine, stock-truth, PHI/PII/security, provider-failure, or reconciliation-risk reasons.

**Stop scope options:** line, order, batch, store, provider, or full launch freeze.

**Required record fields:** reason, scope, actor, timestamp, affected entities, customer communication owner, rollback owner, reconciliation owner, reopen criteria.

**Emergency stop procedure (step by step):**
1. Stop affected channels and notify launch staff immediately.
2. Disable affected provider sends/workers if they could amplify the incident.
3. Preserve logs, audit records, provider callbacks, and database snapshots according to policy.
4. Move all affected orders/prescriptions/refunds to manual review.
5. Assign incident commander, pharmacy lead, engineering lead, compliance lead, and communications owner.
6. Resume only after written go decision and reconciliation signoff.

**Authority:**
- Rollback: incident commander plus platform owner; pharmacist-in-charge may demand rollback/freeze if software behavior threatens regulated release safety.
- Stop-the-line: pharmacist-in-charge, store manager, incident commander, platform owner for their domains.
- Emergency freeze: any trained staff may initiate for suspected patient-safety, PHI/PII, controlled-drug, or stock-truth breach; incident commander confirms scope afterward.

---

## Backup and recovery

### Backup procedure

**Frequency:**

| Backup type | Target cadence |
|-------------|---------------|
| Production full DB backup | At least daily. |
| Production incremental/PITR backup | Every 15 minutes or continuous PITR where supported. |
| Pre-deployment backup | Mandatory immediately before production migrations or high-risk data changes. |
| Staging backup | Daily or before migration rehearsal. |

**Retention:**

| Backup type | Minimum retention |
|-------------|------------------|
| PITR/incremental logs | 7–14 days (must cover detection window for data corruption). |
| Daily full backups | 30 days. |
| Weekly full backups | 12 weeks. |
| Monthly archive | 12 months or statutory requirement, whichever is longer. |
| Pre-deployment snapshots | At least until the deployment is accepted and the next stable backup is verified. |

**Object storage coverage:** Prescriptions (versioned, encrypted, daily inventory, cross-region replication where available), invoices (versioning enabled, statutory retention), reports (daily backup or documented regeneration policy), barcode labels (back up if retained and not reproducible).

**Dry-run commands available:**
```bash
node scripts/backup-db.mjs --dry-run --metadata
node scripts/restore-db-drill.mjs --dry-run --backup-file <non-production-backup.sql>
```
These are documentation/drill planning tools only. Destructive restore execution must use approved DB provider tooling against a named non-production/staging target.

---

### Restore drill procedure

> Do not test restore for the first time during a crisis. Restore must be rehearsed on staging with named owners, measured timings, and verification evidence before production go-live.

**Recommended RPO/RTO targets:**

| Environment | RPO target | RTO target |
|-------------|------------|------------|
| Staging | 24 hours or better for rehearsal data. | 4 hours or better. |
| Production | 15 minutes or better for DB; formally approve larger if accepted. | 1 hour for app/DB service restoration. |

**Restore drill steps:**
1. Declare drill scope (restore point, DB backup ID, storage snapshot ID, target staging environment).
2. Freeze target staging environment — disable workers/cron and inbound webhooks.
3. Restore database — restore full backup and apply incremental/PITR logs to selected timestamp. Record start time, end time, tooling, backup IDs, and errors.
4. Restore storage — prescriptions, invoices, reports, label artifacts or validate regeneration policy.
5. Reconfigure staging secrets — replace production providers with staging/sandbox credentials.
6. Run migrations if rehearsing post-restore upgrade.
7. Run verification checklist (see below).
8. Measure RPO/RTO — compare achieved restore point and elapsed recovery time against approved targets.
9. Document findings — blockers, missing data, permission issues, slow steps, remediation owner/date.
10. Clean up drill environment.

**Restore verification checklist:**
- [ ] Users: staff/customer/admin users, roles, login/session behavior, locked/disabled users.
- [ ] Products: master records, duplicate review state, barcodes, GST/HSN/schedule metadata.
- [ ] Stock ledger: movement history, batch quantities, on-hand/reserved/quarantine values, no negative invariant violations.
- [ ] Reservations: active/reserved/expired states and expiry job behavior.
- [ ] Sales/orders: order headers, line items, statuses, delivery associations, customer links.
- [ ] Prescriptions: file availability, Rx review state, regulated release links, access audit continuity.
- [ ] Invoices: invoice artifacts, invoice numbering continuity, checksum where available.
- [ ] Payments/refunds: captured payments, webhook events, refund state, reconciliation reports.
- [ ] Audit logs: security, stock, prescription, payment/refund, invoice, delivery, and provider failure logs.

**Safety requirements:**
- Never run restore drills against production or production-looking database URLs.
- Never print database passwords, provider secrets, API tokens, PHI, or PII in drill logs.
- Disable staging workers/webhooks before a restore drill.
- Replace production provider credentials with staging/sandbox credentials after restore.
- Record backup ID, restore point, start/end time, verification commands, and owner signoff.

---

### Rollback checklist

**Pre-deployment rollback readiness:**
1. Record current artifact ID, target artifact ID, commit SHA, operator, and environment.
2. Confirm `node scripts/validate-deployment-env.mjs --env staging` (or production equivalent) passes.
3. Confirm migration verification is green and no destructive rollback assumption exists.
4. Confirm rollback target artifact is deployable without database reset or destructive restore.
5. Freeze non-critical changes during deployment window.

**Rollback execution evidence (must record):**
- Rollback command or platform action ID.
- Start/end timestamps and operator.
- Pre/post liveness and readiness output.
- Worker queue/dead-letter counts before and after rollback.
- Provider webhook/retry side-effect review.
- Stock/commercial smoke result.

**Abort criteria:** Abort and escalate if rollback would require dropping tables, truncating data, restoring over a live DB, bypassing regulated gates, or hiding provider/payment uncertainty.

**App rollback sequence:**
1. Roll back to the prior known-good application artifact/commit.
2. Keep worker/cron disabled during rollback unless rollback owner confirms idempotent retry safety.
3. Prefer forward-fix migrations for already-applied production schema changes. Do not run destructive down migrations in production unless explicitly rehearsed, backed up, and approved.
4. After rollback: confirm app availability, DB connectivity, worker state, pending queue state, payment reconciliation, stock invariants, and audit log continuity.

---

## Reconciliation

### Reconciliation override governance

**Override review process:**
1. Override request must state: entity, previous value, proposed value, reason category, business reason, actor, approver, affected store, and affected order/batch/payment/refund/provider reference.
2. Overrides cannot: approve prescriptions, release H/H1/X/controlled-drug items, fabricate provider success, bypass stockInvariant, erase audit logs, or downgrade reconciliation truth.
3. High-risk overrides require same-day independent review by store manager/reconciliation owner; regulated overrides require pharmacist review.
4. Launch-period overrides are reviewed daily; post-launch cadence may move to weekly only after incident-free evidence.

**Required override reason categories:** inventory count correction, quarantine/disposal, supplier invoice correction, refund/payment correction, customer/order correction, delivery/POD correction, provider retry/dead-letter remediation, rollback/backfill correction, legal/compliance instruction, pharmacist correction, other (with mandatory note).

**Unresolved drift handling:**
- Classify drift as stock, payment, refund, supplier, provider, delivery, prescription, access/security, or rollback/backfill.
- Assign owner, severity, customer impact, financial exposure, regulated impact, and next checkpoint.
- Freeze affected workflow when drift can affect patient safety, H/H1/X release, stock truth, payment truth, or PHI/PII.
- Do not close drift as "accepted" without written accountable approval and mitigation.

---

### Daily reconciliation procedure

**Reconciliation cadence:**

| Cadence | Review scope | Owner |
|---------|-------------|-------|
| Opening | Prior close variances, dead letters, held orders, refunds, stock discrepancy carryover. | Store manager + pharmacist where regulated. |
| Shift handoff | Sales/refunds/cash, stock spot-checks, overrides, rider handoffs, dead letters. | Outgoing/incoming shift owners. |
| Closing | Full daily sales/payment/refund/stock/provider/dead-letter variance list. | Store manager + reconciliation owner. |
| Weekly | Trend review, supplier disputes, duplicate invoice risk, rollback/backfill records. | Reconciliation owner + platform/purchase owner. |
| Incident | Affected entity reconstruction before reopen. | Incident commander. |

**Supplier invoice dispute handling:** Track supplier, store, invoice number, date, amount, product/batch lines, duplicate suspicion, credit note/refund linkage, purchase owner, reconciliation owner, and final resolution. Hard uniqueness on supplier + store + invoice number still requires business-reviewed backfill before a destructive migration (see OPEN_BLOCKERS.md).

**Dead-letter review cadence:** Reviewed at store opening, shift handoff, store closing, and immediately when thresholds are breached. Each unresolved dead letter requires: owner, retry/resolve decision, customer/financial/clinical impact classification, and no fake success state.

---

## Multi-store

### Multi-store operator drill

**Drill rules:**
- Use staging or a controlled non-production dataset.
- Do not expose PHI, PII, secrets, raw provider payloads, prescription images, or customer addresses in evidence packets.
- Do not bypass H/H1/pharmacist gates, AI governance, stockInvariant, reconciliation truth, or commercial truth.
- If a store-scope check is missing or ambiguous, freeze the affected store path and escalate.

| Exercise | Trigger | Expected fail-closed behavior | Evidence to capture |
|----------|---------|-------------------------------|---------------------|
| Store outage | Store A unavailable or frozen. | Store A stock-changing operations pause; Store B does not inherit Store A orders unless an audited transfer/fallback decision exists. | Freeze note, affected store ID, operator, timestamp, recovery check. |
| Provider outage (one store) | Store A payment/notification/provider failures increase. | Store A provider actions move to retry/dead-letter review; paid/settled state is not invented; Store B continues with its own provider checks healthy. | Provider event IDs redacted, order/payment store correlation, retry/dead-letter counts. |
| Reconciliation drift | Store A stock audit variance appears. | Store A reconciliation requires manager/pharmacist review; Store B audit remains separate. | Audit ID, variance count, correction movements, approval note. |
| Queue backlog at one node | Store A worker backlog grows. | Non-critical Store A jobs pause or retry; Store B queue processing is not manually replayed from Store A payloads. | Queue name/payload store correlation, backlog age, replay decisions. |
| Dead-letter growth isolation | Store A provider dead letters grow. | Store A dead letters require audited review; Store B staff cannot replay Store A events. | Join-backed order/payment correlation (limitation: first-class storeId not yet on provider_dead_letters). |
| Rollback affecting one store | Release rollback needed for Store A-specific failure. | Freeze affected stock/commercial mutations; unfreeze only after reconciliation and runtime checks pass. | Rollback SHA/artifact, freeze window, health/readiness, stock anomaly counts. |
| Emergency freeze | Negative stock, cross-store leak, provider replay, or regulated gate concern. | Stop affected operation immediately; keep pharmacist/H/H1 gates closed; require incident commander approval to resume. | Incident note, impacted store(s), before/after counts, owner signoff. |

**Multi-store exit criteria:**
- No unresolved negative stock rows.
- No orphan orders without store ID.
- No active transfer reservation without matching in-transit/received transfer explanation.
- No unreviewed dead-letter growth for launch-critical providers.
- Store staff cross-store access attempts fail with `FORBIDDEN`.
- Admin break-glass access is reviewed and justified.

**Known isolation gaps (as of 2026-05-11):**
- Provider dead-letter tables do not yet carry a first-class `storeId` — correlation is via order/payment join.
- Worker job rows do not yet carry a first-class `storeId` — correlation is via queue naming/payload.
- Second-store live beta is NO-GO until first-class store scope is added or join-backed proof is attached.

---

### Store onboarding checklist

This checklist must be completed for every pharmacy store before it is allowed into controlled production.

**Store profile (fill in before onboarding):**
- Store legal name / operating name / system store ID
- Address, service area, operating hours
- Licence/registration references
- Pharmacist-in-charge
- Store manager
- Launch date, launch approval owner

**Required setup:**

| Area | Checklist |
|------|-----------|
| Store configuration | Store record exists; address/contact details verified; tax/statutory identifiers recorded; delivery/service area configured. |
| Staff access | Named users only; no shared admin; role assigned; store scope assigned; removal/escalation path documented. |
| Pharmacist controls | Pharmacist account active; H/H1/X review path understood; SOP signed; H1/statutory record process confirmed. |
| Stock baseline | Opening stock counted; expired/quarantined/recalled/damaged stock separated; batch/expiry data loaded; FEFO process understood; stock exception owner assigned. |
| Commercial baseline | Payment modes configured; refund path tested in staging; cash/manual process documented; daily reconciliation owner assigned. |
| Provider setup | Store-specific payment, notification, map/delivery, OCR, printer, storage, and accounting/export configuration verified or explicitly disabled. |
| Accounting/compliance | Invoice numbering/tax settings reviewed; supplier invoice duplicate policy communicated; statutory export owner assigned. |
| Hardware | Printer/scanner/barcode/payment devices tested in staging or manual fallback documented. |
| Training | Staff complete role training; pharmacist completes regulated gate training; manager completes incident/manual fallback training. |
| Backup/fallback | Store knows outage process, manual sale/dispensing/refund logs, data re-entry approval, and emergency stop trigger. |
| Monitoring | Store launch channel created; primary/secondary support contacts assigned; daily review schedule accepted. |

**Pre-live dry run:** Run a full staging rehearsal including: staff login + store scope check, non-regulated order flow, prescription-required order flow with pharmacist review, H/H1/X blocked/review path, payment provider sandbox success/failure/refund, stock reservation/cancellation/expiry, dead-letter/retry review, invoice/accounting export review, manual fallback and re-entry simulation, emergency stop notification drill.

**Live day-0 checklist:**
- Launch owner present.
- Pharmacist-in-charge present or on formally approved duty coverage.
- Incident commander reachable.
- Provider dashboard access available.
- Monitoring dashboards accessible to authorized staff.
- Manual fallback template available.
- Daily reconciliation meeting scheduled.
- Stock exception review meeting scheduled.
- Emergency stop and rollback procedure visible to launch team.

**Signoff table (all required before live enablement):**

| Role | Name | Date | Signature/approval reference |
|------|------|------|------------------------------|
| Store manager | | | |
| Pharmacist-in-charge | | | |
| Operations lead | | | |
| Engineering/release owner | | | |
| Compliance/legal owner | | | |
| Incident commander | | | |
