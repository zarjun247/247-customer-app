# Compliance Reference

This document is the legal-frame document for 24/7 Pharmacy OS. It covers the regulatory context, pharmacist-gated dispensing rules, audit requirements, AI governance, PHI/PII handling, and data retention. It is a technical reference — it does not constitute legal advice or regulatory approval.

**Counsel review required** before relying on this document for statutory compliance claims.

See also: [OPERATIONS.md](./OPERATIONS.md) §Pharmacist operations, [AGENTS.MD](../AGENTS.MD).

---

## Regulatory frame

### Pharmacy Act §42 (India)

Under section 42 of the Pharmacy Act, no person other than a registered pharmacist may compound, prepare, mix, or dispense medicines on prescription. The Pharmacy Practice Regulations reinforce that every registered pharmacist shall dispense only those medicines as prescribed by the registered medical practitioner and shall not substitute the prescription.

**System implication:** The platform must enforce pharmacist-only dispensing as a hard gate, not a soft preference. No AI, customer-support agent, rider, manager, or automated workflow may bypass this gate.

### Schedule H / H1 / X drugs

- **Schedule H:** Prescription-required. Not to be dispensed more than once unless the prescriber explicitly authorizes repeats.
- **Schedule H1:** Stricter controls. Supply must be recorded with prescriber name and address, patient name, drug name, and quantity. Records must be retained for **3 years minimum**. Labels carry "Not to be sold by retail without the prescription of a Registered Medical Practitioner."
- **Schedule X:** Controlled/narcotic/psychotropic substances. Additional state-level licensing requirements. Not to be dispensed without prescription; telemedicine guidance keeps Schedule X outside normal tele-prescribing flows.

### Telemedicine and digital prescriptions

The National Medical Commission 2023 regulations state that registered medical practitioners shall provide a clear photograph, scanned, or digital copy of a duly signed prescription to the patient via email or a messaging platform. This makes digital/WhatsApp prescription ingestion operationally valid, provided:
- The dispensing decision still rests with a pharmacist.
- Every prescription is treated as a regulated artifact requiring pharmacist review.
- Schedule-aware controls apply (H1/X are excluded from routine tele-prescribing flows).

### India Digital Personal Data Protection (DPDP) Act 2023

The DPDP Act requires: notice, purpose-bound and necessary processing, consent that is free/specific/informed/unambiguous, and the ability to withdraw consent with comparable ease. The 2025 rules are staged but now concrete enough that building ahead of the compliance floor is required. See [docs/dpdp/](./dpdp/) for the data flow scaffold and consent matrix.

### CERT-In directions

India's CERT-In cyber security directions require:
- Reportable cyber incidents to be reported within **6 hours**.
- ICT (system) logs retained for **180 days**, maintained within Indian jurisdiction.

---

## Pharmacist-gated dispensing (the non-negotiable)

This is the most critical technical constraint in the system. Every violation is a P0 stop-the-line.

**What requires a pharmacist gate before packing/delivery:**
- Any prescription-required medicine.
- Any Schedule H, H1, or X item.
- Any controlled drug.
- Any cold-chain medicine where storage integrity cannot be confirmed.
- Any product where the pharmacist sees a stock discrepancy, batch issue, or prescription concern.

**What can NEVER bypass the pharmacist gate:**
- AI/OCR output (assistive only — see §AI governance boundaries).
- Customer-support agents.
- Riders.
- Manager overrides (managers can override logistics, not pharmacist clinical decisions).
- SLA pressure or revenue pressure.
- Any automated workflow including refill reminders, worker jobs, or WhatsApp bot flows.

**System implementation:**
- Order state machine requires `AwaitingPharmacistReview → Approved/Rejected` transition before `AwaitingAllocation`.
- H/H1/X items have a hard gate in the order line validation — they cannot be allocated without a pharmacist approval record.
- `aiGovernance.ts` dead-letters any AI worker job that attempts regulated mutation.
- All pharmacist review events emit to the audit log with pharmacist ID, timestamp, and decision.

---

## Schedule H1 register requirements

H1 register fields that must be completed for each H1 dispensing event:
- Prescriber name and address.
- Patient name.
- Drug name and quantity.
- Date of supply.
- Pharmacist identity (who dispensed).
- Order/prescription reference (system-generated).

**Missing or incomplete H1 statutory fields block release.** The system must not allow H1 items to leave a pharmacist-reviewed state without these fields populated.

**Code reference:** `server/services/aiGovernance.ts` — the `h1RegisterCorrectness` guard test enforces that H1 release events cannot succeed without statutory fields. Migration `drizzle/schema.ts` contains the `h1_sales_register` or equivalent table for persisting these records.

**Retention:** H1 records must be retained for a minimum of 3 years. Physical or digital records must not be deleted before this period expires, even if the customer account is deleted.

---

## Prescription vault consent

Prescription vault is distinct from one-time prescription upload:
- **One-time upload:** Customer uploads a prescription for a specific order. The image is stored for the duration of the order's legal/pharmacy retention period, then subject to the deletion policy.
- **Vault (on-file):** Customer explicitly consents to store the prescription for future refill use. This requires separate, granular consent (`prescription_vault` purpose).

**Consent rules:**
- Vault storage requires explicit opt-in (`prescription_vault` consent = true in `user_consents` table).
- Vault reuse for a new order requires: checking that vault consent is still active + that the prescription is not expired/invalid for the new order.
- Vault access events must be audited with: actor, purpose, channel, and timestamp.
- Revocation of vault consent must immediately prevent new vault reads for that customer's prescriptions.

**Implementation reference:** `user_consents` table (drizzle/schema.ts, migration `0034` area). See also [docs/dpdp/consent-matrix.md](./dpdp/consent-matrix.md) for the DPDP scaffold.

---

## AI governance boundaries

AI in this system is strictly assistive. This boundary is enforced both in doctrine and in code.

### What AI is permitted to do

| AI function | Status | Why |
|-------------|--------|-----|
| OCR of purchase invoices and prescriptions | Allowed | Data capture only; human review gates all output. |
| Product normalisation, synonym dedupe, manufacturer/pack matching | Allowed | Operational data quality, not clinical choice. |
| Batch-ageing score, FEFO recommendation, expiry-risk ranking | Allowed | Inventory governance. |
| Demand forecasting, reorder suggestions, stockout risk | Allowed | Supply planning. |
| Rider ETA prediction, route suggestion, non-movement alerts | Allowed | Logistics optimisation. |
| Dashboard summarisation, anomaly clustering, exception queues | Allowed | Ops analytics. |
| Draft same-molecule reference list for pharmacist research | Assist-only | Must not become substitution engine. |

### What AI is strictly prohibited from doing

| Prohibited AI action | Why |
|---------------------|-----|
| Automatic substitution of prescribed medicines | PCI/Pharmacy Practice Regulations: pharmacist shall not substitute the prescription. |
| Prescription approval or rejection by AI alone | Dispensing decision must stay with pharmacist. |
| Choosing medicines, dose, regimen, or treatment advice | Clinical decision-making — strictly prohibited. |
| Autonomous H/H1/X release or refill continuation | Regulated drug controls require human gate. |
| Customer-facing "AI recommendation" of prescription medicines | High compliance risk. |
| Marking payment as successful without provider proof | Commercial truth integrity. |

### Code implementation

- `server/services/aiGovernance.ts` is the central AI task classifier and decision audit builder.
- Worker AI/OCR jobs declare `governanceBoundary: "assistive_only_no_regulated_mutation"`, `mutatesExternalState: false`, `regulatedExecutionAllowed: false`.
- AI audit records store redacted hashes and metadata — not PHI payloads or raw prescription images.
- Guard test: `server/ai-governance-seal.guard.test.ts` proves prohibited AI tasks fail closed and cannot finalize regulated fulfillment.

### AI suggestion audit trail

Every AI suggestion emitted by any service must produce an audit record containing (at minimum):
- `model_name` (what model/version produced this output).
- `task_type` (ocr_invoice, product_match, anomaly, summary, etc.).
- `input_hash` (SHA-256 of normalized input — never the raw input).
- `output_json` (the suggestion output).
- `confidence` (if the model reports it).
- `human_accepted_by` / `human_accepted_at` (if a human acted on the suggestion).

---

## Audit log requirements

Every regulated action must generate an audit log entry. The minimum fields are:

| Field | Description |
|-------|-------------|
| `actorType` | Staff, customer, system, pharmacist, admin. |
| `actorId` | The authenticated user or service identity. |
| `action` | The specific action (e.g., `prescription.reviewed`, `stock.adjusted`, `order.pharmacistApproved`). |
| `entityType` | The type of entity affected (order, batch, prescription, payment, etc.). |
| `entityId` | The ID of the affected entity. |
| `beforeJson` | State before the action (redacted for PHI/PII where not needed for audit). |
| `afterJson` | State after the action. |
| `reason` | The declared reason for the action (mandatory for overrides). |
| `ipAddress` | If available from the request context. |
| `session` / `device` | If available. |
| `sourceChannel` | app / whatsapp / admin / system / counter. |
| `createdAt` | Timestamp of the event. |

### Events that always require audit logs

- Prescription ingestion (any channel).
- Pharmacist review (approve/reject/hold/escalate/emergency-stop).
- Any H/H1/X dispensing decision.
- Any stock movement or adjustment (`stock_movements` table).
- Inventory batch quarantine, disposal, or transfer.
- Manual override (any entity type).
- Payment capture, refund initiation, refund settlement.
- AI suggestion emitted (see §AI governance).
- Provider dead-letter created or replayed.
- Node override or routing change.
- Rider pickup, delivery, failed delivery, proof-of-delivery.
- Any RBAC role change or store scope change.
- Any admin break-glass access.
- Security events (failed login patterns, suspicious access).

### Audit log integrity

Audit logs must be tamper-evident. No audit log row may be deleted. Corrections are additive (a correction event references the original event). Audit log access is staff/admin gated; raw audit data is not exposed in customer-facing endpoints.

CERT-In requires logs to be retained for 180 days hot. For pharmacy-regulated events, H1 records require 3 years.

---

## PHI/PII handling

PHI (Protected Health Information) in this system includes: prescription images, diagnosis notes, medicine names on H1 registers, dosage/clinical notes, patient–medicine linkages. PII includes: customer phone numbers, names, addresses, flat/building details.

### Redaction rules (enforced in code)

- Raw prescription images are never logged, never included in notification payloads, and never sent to non-staff channels.
- Patient identifiers are never included in pino log messages.
- H1 register data is never included in application logs or notification payloads.
- Payment signatures, JWT tokens, API keys, OTPs are never logged.
- The `redactString()` utility in `server/_core/observability.ts` must be used when any user-identifying value approaches a log call.

### Access controls

- Prescription images: accessible only to pharmacist and admin roles via the vault proxy endpoint. Access is audited.
- H1 register data: accessible only to pharmacist/admin roles with explicit purpose.
- Customer PII in bulk: accessible only to admin/ops roles; every bulk access is audit-logged.
- PHI must not be copied to personal devices, personal messaging channels, or unaudited external services.

### Breach response

1. Triage affected systems, data categories, customers, and staff accounts.
2. Preserve evidence and audit logs.
3. Revoke suspicious staff/device sessions and rotate affected secrets.
4. Notify internal leadership and counsel immediately.
5. With counsel: determine customer and regulator notification obligations.
6. File CERT-In incident report within 6 hours if the breach constitutes a reportable cyber incident.
7. Document remediation and post-incident controls.

### PHI/PII encryption

PHI/PII field-level encryption at rest is planned for a future MP (MP7). Until MP7 is merged and validated, PHI protection relies on DB-level encryption at rest, storage-level encryption (S3 SSE), and access controls. `PII_ENCRYPTION_MASTER_KEY` is MP7's responsibility only — no other MP adds it.

---

## RBAC and store isolation

### Role hierarchy

| Role | Access scope |
|------|-------------|
| `super_admin` | All stores, all data, all admin operations. |
| `admin` | All stores, all data, admin operations (same as super_admin in most surfaces). |
| `ops_admin` | Operational admin — all stores but limited to ops surfaces. |
| `pharmacist` | Own store. Prescription review, H/H1/X dispensing, clinical override authority. |
| `store_manager` | Own store. All store operations except pharmacist clinical decisions. |
| `staff` / `cashier` | Own store. POS, basic order management, no prescription release. |
| `customer` | Own profile, own orders, own prescriptions only. |

### Store isolation guarantees (implemented)

1. Stock batches, SKUs, reservations, stock movements, stock audits, quarantine, expiry actions, purchases, orders, and sales include store identifiers.
2. Per-store runtime detail requires the caller to be assigned to that store (unless admin/ops/super-admin).
3. Non-admin staff can initiate outbound transfer only from their own store; receive inbound transfer only into their own store.
4. Transfer receive runs as an atomic DB transaction: source debit, destination batch creation, transfer-reservation consumption, movement writing, and transfer state update.
5. Stock audit lists default to the caller's store for non-admin users.
6. Attempted cross-store access by store staff returns `FORBIDDEN`.

### Store isolation limitations (as of 2026-05-11)

- Provider dead-letter tables do not yet carry a first-class `storeId` — correlation is via order/payment join.
- Worker job rows do not yet carry a first-class `storeId` — correlation is via queue naming/payload.
- Admin/ops/super-admin cross-store visibility is intentional privileged access; must be controlled by SOP, device/session governance, and audit review.

### No shared admin accounts

Each operator must have a named account with the minimum required role and store scope. Shared admin accounts are strictly prohibited. Offboarding procedure (account deactivation, session revocation) must be documented and tested before live launch.

---

## H1 record retention

H1 sale records must be retained for a minimum of 3 years from date of supply. This is a statutory requirement under India's drug rules for Schedule H1 controlled substances.

**Retention scope:** The H1 register row, the associated prescription reference, the pharmacist decision record, and the stock movement record must all be preserved for 3 years.

**Deletion policy:** Even if a customer requests account deletion, H1 records associated with that customer's orders must not be deleted before the 3-year minimum retention period expires. The customer's personal data may be separated from the H1 record (anonymized linkage), but the H1 statutory data itself must persist.

---

## GST/Tally compliance

### Invoice numbering

GST-compliant invoices require:
- Unique sequential invoice numbers per store (no gaps, no duplicates).
- GST rate and HSN code per line item.
- Supplier GSTIN on purchase invoices.
- Store GSTIN on customer sale invoices.

### Retention

GST records, tax invoices, purchase bills, and books of account must be retained for **72 months** (6 years) from the end of the relevant financial year. This applies to both purchase and sales invoices.

### Tally/accounting export

- Export jobs must be idempotent: re-running an export for the same period must not duplicate accounting entries.
- The duplicate export guard (implemented in accounting services) must be in place before any production export run.
- Export failures are P1 operational issues — they do not block sales, but they must be resolved before the accounting period closes.
- The supplier invoice duplicate constraint (supplier + store + invoice number uniqueness) must be reviewed and backfill-approved before adding a destructive database uniqueness migration. See OPEN_BLOCKERS.md.

### Statutory and compliance dashboard

The compliance ops board (`docs/dashboards/compliance-ops-board.md`) and reconciliation ops board track: H1 review completion rate, override count, unaudited actions, invoice export status, and label/scan compliance.

---

## Dependency and supply chain security

Before launch, the following must be confirmed:
- `pnpm audit` shows no critical/high runtime vulnerabilities, or each open finding has a documented owner decision.
- `pnpm-lock.yaml` is committed and its diff is reviewed for unexpected new packages on every dependency change.
- No dependency upgrade is bundled into a feature PR unless explicitly approved.
- Major upgrades for React, Vite, TypeScript, Drizzle, Razorpay, AWS SDK, Express, auth/session libraries require dedicated PRs with rollback plans.

See [RELEASE.md](./RELEASE.md) §Production dependency policy for the full policy.
