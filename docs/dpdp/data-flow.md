# DPDP Data Flow Map (Scaffold)

## Status: SCAFFOLD — requires legal review before production reliance

This document is an engineering starting point for mapping personal data flows under the Digital Personal Data Protection Act, 2023 (India). It is **not** a compliance certification, a legal opinion, or a declaration that obligations are met. Every section marked **[LEGAL REVIEW REQUIRED]** must be reviewed and approved by qualified counsel before the system handles live customer data in a production context.

See also: [COMPLIANCE.md](../COMPLIANCE.md), [consent-matrix.md](./consent-matrix.md).

---

## Personal data categories

| Category | Examples | Storage location | Retention | Lawful basis | Notes |
|----------|----------|-----------------|-----------|--------------|-------|
| Identity | Name, date of birth, customer ID | `customers` table, `users` table | Account lifetime + statutory minimum | Consent (account creation) | **[LEGAL REVIEW REQUIRED]** Confirm minimum retention with counsel. |
| Contact | Mobile number, email, flat/building address | `customers`, `customer_addresses` tables | Account lifetime | Consent (account creation) | OTP and session use; redacted in logs per PHI/PII policy. |
| Prescription / health | Prescription images, extracted medicine lines, pharmacist review notes, H1 register records | `prescriptions` table, object storage (prescription vault) | Pharmacy recordkeeping obligation + H1 records 3 years per D&C Rules | Legitimate use (pharmacy service delivery); consent (prescription vault reuse) | **[LEGAL REVIEW REQUIRED]** Health data is sensitive; special-category handling applies. |
| Medication / treatment history | Filled order lines, refill plans, prescription history, adherence summaries | `order_lines`, `refill_plans`, derived analytics | Order lifetime + pharmacy retention | Consent (prescription vault storage) | **[LEGAL REVIEW REQUIRED]** Classify as health/sensitive personal data. |
| Payment | Razorpay order/payment IDs, webhook event metadata, refund records | `payments`, `refunds`, audit log | GST records 72 months; statutory minimum | Contractual necessity (order fulfilment) | Raw card/bank data is not stored — payment processor handles PCI scope. |
| Behavioural | App session activity, WhatsApp message metadata, order frequency, search terms | `wa_messages`, `audit_log`, analytics tables (if any) | Session + aggregated analytics retention **[LEGAL REVIEW REQUIRED]** | Consent (analytics opt-in) | Analytics consent must be separate from transactional consent. |
| Location | Delivery address, rider GPS breadcrumbs during active delivery | `rider_locations`, `customer_addresses` | Rider GPS: 180 days detailed per CERT-In/operational need; aggregated thereafter | Consent (per-session for delivery routing) | **[LEGAL REVIEW REQUIRED]** Define session-scope consent withdrawal mechanism. |
| Family / dependent profile | Dependent names, relationship, linked prescriptions | `family_profiles` (if implemented), `prescriptions` | Same as identity + prescription retention | Explicit opt-in (family profile creation) | Dependent data of minors requires additional safeguards. **[LEGAL REVIEW REQUIRED]** |

---

## Data flows

### Resident onboarding flow

1. Customer provides mobile number → OTP sent via SMS provider.
2. OTP verified → session created; customer record written to `customers` table.
3. Building/flat address captured → written to `customer_addresses`.
4. Consent notice displayed → consent records written to `user_consents` (see [consent-matrix.md](./consent-matrix.md)).
5. **Data fiduciary obligations triggered at this step.** Consent notice must include: purpose, data categories collected, retention period, withdrawal mechanism, and grievance officer contact. **[LEGAL REVIEW REQUIRED]**

**Audit events generated:** `customer.created`, `consent.granted` (per purpose), session creation.

**PHI/PII controls:** Mobile number redacted in application logs. No raw contact data in error traces.

---

### Prescription upload flow

1. Customer uploads prescription image/PDF via app or WhatsApp.
2. Prescription record created in `prescriptions` table; file stored in object storage (prescription vault).
3. OCR/AI extracts draft medicine lines (assistive-only — no AI approval authority).
4. Pharmacist reviews prescription in pharmacist UI; approves, rejects, or requests clarification.
5. Pharmacist decision recorded with pharmacist ID, timestamp, reviewed lines, and notes.
6. H/H1/X items: H1 statutory fields captured; records retained per D&C Rules (3 years minimum for H1).

**Data minimisation note:** Only the fields required for pharmacist review and pharmacy recordkeeping should be retained. Raw images should not be stored beyond purpose and retention limits without explicit consent. **[LEGAL REVIEW REQUIRED]**

**Audit events generated:** `prescription.uploaded`, `prescription.ocr_draft_created`, `prescription.pharmacist_reviewed`, `prescription.approved/rejected`.

---

### Order fulfillment flow

1. Order created (`orders` table) linking customer, address, node, and prescription if required.
2. Stock reserved; batch allocated per FEFO policy.
3. Payment captured via Razorpay; payment record written.
4. Order packed and assigned to rider; delivery task created.
5. Rider location tracked during active delivery; GPS breadcrumbs written to `rider_locations`.
6. Delivery confirmed; proof-of-delivery reference stored; order closed.
7. Invoice generated and accessible to customer.

**Personal data accessed at each stage:** Customer name and address (for delivery label and proof of delivery); order contents (for packing and pharmacist verification); payment metadata (for reconciliation). No raw prescription image is sent to the rider — only the order packet ID and delivery address.

**Audit events generated:** `order.created`, `stock.reserved`, `payment.captured`, `delivery.assigned`, `delivery.completed`, `invoice.generated`.

---

### WhatsApp interaction flow

1. Customer sends message to WhatsApp business number.
2. Webhook received; message stored in `wa_messages` table (wamid, direction, template, payload hash, customer ID, order ID).
3. Bot interprets message; drafts order or status response.
4. If prescription required, order enters `AwaitingPrescription` state; pharmacist gate enforced before any regulated release.
5. Human handoff routes transcript to staff console where needed.

**Consent note:** WhatsApp messaging consent is separate from transactional notification consent. Customers must have opted in to the WhatsApp channel. Reply STOP mechanism must be implemented. **[LEGAL REVIEW REQUIRED]**

**PHI/PII controls:** Raw prescription content must not appear in WhatsApp message payloads. PHI is not logged in wa_messages payload_json beyond operational necessity.

---

### Refill reminder flow

1. `refill_plans` table tracks customer product, cadence, last fill date, and next due date.
2. Worker job fires reminder at configured cadence; notification sent via SMS or WhatsApp template.
3. Customer action creates a draft order; pharmacist gate enforced for prescription items.
4. Reminder cadence is opt-in; customer can unsubscribe per consent matrix.

**Consent note:** Refill reminders require separate opt-in consent from transactional notifications. **[LEGAL REVIEW REQUIRED]**

---

### Pharmacist review flow

1. Pharmacist logs in with named credentials (role: pharmacist, store-scoped).
2. Prescription review UI presents prescription image alongside AI/OCR draft.
3. Pharmacist makes decision; decision recorded with full audit fields.
4. H1 register populated for H1 drugs with statutory fields.
5. All pharmacist actions are audit-logged with actor ID, timestamp, action, and entity reference.

**Access control:** Only `pharmacist` and `admin` roles may view prescription images. Access is audited per PHI/PII policy.

---

### Audit and compliance flow

1. Every regulated action writes to `audit_log`: actorType, actorId, action, entityType, entityId, beforeJson, afterJson, reason, ipAddress, sourceChannel, createdAt.
2. H1 sales records retained separately for 3 years.
3. GST invoice records retained for 72 months.
4. Security/system logs retained for 180 days (CERT-In minimum).
5. Audit logs are tamper-evident; access is restricted to admin/compliance roles.
6. Incident records written by incident commander per operations handbook.

---

## Cross-border transfers

**Current status:** No cross-border personal data transfers are intentionally designed. All data is intended to be hosted in India-based infrastructure.

**[LEGAL REVIEW REQUIRED]** Before deploying any third-party service (analytics, CDN, AI/OCR API, monitoring, object storage) that routes data outside India, confirm whether this constitutes a cross-border transfer under the DPDP Act and what consent/notice obligations apply. Document each service and the data categories it may access.

| Service category | Current posture | Action required |
|-----------------|-----------------|-----------------|
| Database (MySQL) | India-hosted | Confirm deployment target with infrastructure owner. |
| Object storage (S3-compatible) | India region required | Confirm bucket region before go-live. **[LEGAL REVIEW REQUIRED]** |
| Payment (Razorpay) | India-based processor | Confirm Razorpay data residency for payment metadata. |
| SMS/WhatsApp | Meta / telecom providers | **[LEGAL REVIEW REQUIRED]** Assess cross-border routing of contact data. |
| OCR/AI (if external API) | Not yet configured | **[LEGAL REVIEW REQUIRED]** Any external AI API that receives prescription content triggers cross-border and health data obligations. |
| Monitoring / APM (OTel export) | Optional; controlled by `OTEL_EXPORTER_OTLP_ENDPOINT` | **[LEGAL REVIEW REQUIRED]** If endpoint routes to non-India infra, assess data categories exported. |

---

## Data Principal rights implementation

Under DPDP Act 2023, data principals (customers) have the following rights. Implementation status is noted; all statuses require legal review before launch.

### Right to access

**What it means:** Customer can request information about personal data processed and the purposes.

**Current implementation status:** Not implemented as a self-service feature. Manual process via grievance officer. **[LEGAL REVIEW REQUIRED + IMPLEMENTATION TODO]**

---

### Right to correction

**What it means:** Customer can request correction of inaccurate or incomplete personal data.

**Current implementation status:** Profile update (`PATCH /me`) allows correction of name and address. Prescription data correction requires pharmacist/admin review given regulatory record requirements. **[LEGAL REVIEW REQUIRED]** Define process for correction requests for data that cannot be self-served.

---

### Right to erasure

**What it means:** Customer can request erasure of personal data where no lawful retention basis exists.

**Current implementation status:** Not implemented as a self-service feature. Account deletion triggers consent revocation but full erasure pipeline is not implemented. **[LEGAL REVIEW REQUIRED + IMPLEMENTATION TODO]** Erasure must account for: pharmacy retention obligations (H1 records 3 years, GST records 72 months), audit log retention (CERT-In 180 days), and fraud/dispute retention.

---

### Right to grievance redressal

**What it means:** Customer can raise grievances about data processing; must be addressed within prescribed period.

**Current implementation status:** No self-service grievance form. Grievance officer contact must be published in privacy notice. **[LEGAL REVIEW REQUIRED + IMPLEMENTATION TODO]** Assign a named grievance officer before go-live.

---

### Right of consent withdrawal

**What it means:** Customer can withdraw consent for any purpose with same ease as granting.

**Current implementation status:** Consent revocation API exists (`PATCH /me/consents`). WhatsApp STOP mechanism is documented but not tested end-to-end. **[LEGAL REVIEW REQUIRED]** Verify that consent withdrawal propagates correctly to all downstream processing (reminders, analytics, marketing).

---

## Open work

The following items require resolution before this scaffold can be treated as production-ready. All require legal review.

1. **[TODO — Legal]** Confirm lawful basis for each data category in the personal data table above. Consent may not be the only basis; legitimate use (pharmacy service delivery, statutory compliance) may apply to some categories. Counsel must approve the basis mapping.

2. **[TODO — Legal]** Draft the consent notice (DPDP § 5) for account creation, prescription storage, and each optional consent purpose. Notice must name the data fiduciary, enumerate purposes, describe data categories, state retention periods, and explain withdrawal.

3. **[TODO — Engineering + Legal]** Implement data access request self-service flow (Right to access).

4. **[TODO — Engineering + Legal]** Implement full erasure pipeline with pharmacy/statutory retention carve-outs (Right to erasure).

5. **[TODO — Legal]** Appoint a named grievance officer and publish grievance redressal mechanism in privacy notice.

6. **[TODO — Legal]** Assess all third-party integrations for cross-border transfer obligations before production go-live.

7. **[TODO — Legal]** Assess whether health/prescription data qualifies as "sensitive personal data" under DPDP rules and confirm any additional obligations (e.g., explicit consent, consent manager requirements under future rules).

8. **[TODO — Legal]** Confirm CERT-In incident reporting obligations: 6-hour window for reportable incidents; ICT log retention for 180 days in Indian jurisdiction. Map to incident commander runbook.

9. **[TODO — Engineering]** Implement inactivity notice and account deletion workflow per DPDP consent purpose expiry.

10. **[TODO — Legal + Engineering]** Review dependent/family data for minor-specific protections and guardian consent requirements under DPDP rules.

11. **[TODO — Legal]** Confirm whether the system qualifies as a "Significant Data Fiduciary" (SDF) under the DPDP rules (to be notified by the Government) — this would impose additional obligations including a Data Protection Officer, Data Protection Impact Assessment, and periodic audits.

12. **[TODO — Legal]** Review WhatsApp/SMS consent flows for TRAI and DPDP alignment — commercial messages have separate TRAI regulatory requirements in addition to DPDP consent.
