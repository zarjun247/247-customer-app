# DPDP Consent Matrix (Scaffold)

## Status: SCAFFOLD — requires legal review before production reliance

This document is an engineering scaffold for consent management under the Digital Personal Data Protection Act, 2023 (India). It is **not** a compliance certification, a legal opinion, or a declaration that consent flows are finalised. Every item marked **[LEGAL REVIEW REQUIRED]** must be reviewed by qualified counsel before the system processes live customer data.

See also: [data-flow.md](./data-flow.md), [COMPLIANCE.md](../COMPLIANCE.md).

---

## Consent purposes

| Purpose key | Required for | Granular consent? | Default state | Withdrawal mechanism | Notes |
|-------------|-------------|-------------------|---------------|----------------------|-------|
| `account_creation` | Login, customer profile, order placement | No — foundational | Required (no account without it) | Account deletion | **[LEGAL REVIEW REQUIRED]** Confirm whether "account creation" constitutes consent or a separate contractual/legitimate-use basis under DPDP. |
| `prescription_vault` | Storing prescription images for future refills; on-file reuse | Yes | Opt-in at prescription upload | Revoke in Settings → Privacy → Prescription Vault | Without this consent, uploaded prescriptions may only be retained for the single order's fulfilment and pharmacy recordkeeping — not reused for future orders. **[LEGAL REVIEW REQUIRED]** |
| `whatsapp_messaging` | Order status updates, OTP, prescription intake, helpdesk via WhatsApp | Yes | Opt-in (customer initiates WhatsApp contact or explicitly enables in app) | Reply STOP to WhatsApp number; or Settings → Notifications → WhatsApp | Transactional WhatsApp (OTP, order status) may have a different legal basis than marketing. **[LEGAL REVIEW REQUIRED]** |
| `refill_reminders` | Proactive refill reminder messages (SMS or WhatsApp) | Yes | Opt-in at refill plan creation | Settings → Notifications → Refill Reminders → Unsubscribe | Each reminder channel (SMS, WhatsApp, push) should be separately controllable. **[LEGAL REVIEW REQUIRED]** |
| `analytics` | Product improvement, usage analytics, aggregate reporting | Yes | Opt-out (default on for registered users) | Settings → Privacy → Analytics → Disable | Analytics should not include health/prescription content. **[LEGAL REVIEW REQUIRED]** Confirm opt-out default is permissible under DPDP or if opt-in is required. |
| `marketing_offers` | Promotional content, discount notifications, new product announcements | Yes | Opt-in | Settings → Notifications → Marketing → Unsubscribe; or unsubscribe link in message | Must be clearly separated from transactional notifications. TRAI DND/TCCCPR rules may impose additional requirements. **[LEGAL REVIEW REQUIRED]** |
| `location_delivery` | Using current or saved location for delivery routing; per-session location access | Yes | Opt-in per session (OS-level permission) | Revoke location permission in device OS settings; or per-order location consent | Per-session scope: consent for one delivery does not persist to the next by default. **[LEGAL REVIEW REQUIRED]** |
| `family_profile` | Creating and managing dependent profiles; ordering on behalf of family members | Yes — explicit | Explicit opt-in at family profile creation | Settings → Family → Remove Dependent | Dependent data for minors requires guardian consent. **[LEGAL REVIEW REQUIRED]** Define guardian identity verification and consent mechanism. |

---

## Implementation status

The `user_consents` table (defined in drizzle schema, migration 0034 onward) is the intended backing store for consent records. **Do not modify the schema from this document** — schema changes require a separate migration and review.

Each consent record should store, at minimum:

| Field | Description |
|-------|-------------|
| `customer_id` | The data principal |
| `purpose_key` | One of the purpose keys in the table above |
| `granted` | Boolean: whether consent is currently active |
| `granted_at` | Timestamp of most recent grant |
| `revoked_at` | Timestamp of most recent revocation (null if not revoked) |
| `grant_source` | Channel/flow where consent was given (e.g., `app_onboarding`, `whatsapp_optin`, `settings`) |
| `revoke_source` | Channel/flow where consent was revoked (e.g., `settings_toggle`, `whatsapp_stop`, `account_deletion`) |
| `notice_version` | Version identifier of the consent notice shown at time of grant **[LEGAL REVIEW REQUIRED]** |
| `created_at` | Record creation timestamp |
| `updated_at` | Record last-updated timestamp |

---

## Consent record requirements under DPDP § 6

Per DPDP Act 2023 Section 6, consent must be:

- **Free** — not coerced or bundled with conditions for a service that does not require that data.
- **Specific** — tied to a defined purpose, not a blanket authorisation.
- **Informed** — accompanied by a notice that explains purpose, data categories, retention, withdrawal, and grievance mechanism.
- **Unconditional** — not contingent on acceptance of unrelated processing.
- **Unambiguous** — expressed through a clear affirmative action (not pre-ticked boxes or inaction).

The consent notice must be in English or any language listed in the Eighth Schedule of the Constitution, as requested by the data principal. **[LEGAL REVIEW REQUIRED]** Assess language requirements for Marathi, Hindi, and other languages relevant to the Mumbai-first rollout.

Each withdrawal must be as easy as each grant. **[LEGAL REVIEW REQUIRED]** Audit the withdrawal paths in the table above against this standard before launch.

---

## Consent withdrawal propagation checklist

When a customer withdraws consent for any purpose, the system must:

- [ ] Update `user_consents` record (set `granted = false`, `revoked_at`, `revoke_source`).
- [ ] Write audit event: `consent.revoked` with actor, purpose, channel, timestamp.
- [ ] For `refill_reminders`: cancel pending reminder jobs in the worker queue.
- [ ] For `whatsapp_messaging`: mark customer as opted-out in the WhatsApp interaction layer.
- [ ] For `analytics`: exclude customer from future analytics collection.
- [ ] For `marketing_offers`: unsubscribe from all marketing notification lists.
- [ ] For `prescription_vault`: stop reusing stored prescription for future orders (existing pharmacy-recordkeeping retention continues per legal obligation).
- [ ] For `family_profile`: confirm data handling of dependent records on primary account deletion or consent withdrawal.

**[LEGAL REVIEW REQUIRED]** Confirm that each withdrawal propagation step is legally sufficient and that downstream processing stops within a reasonable time.

---

## TODOs for legal review

1. **[TODO — Legal]** Confirm which purposes can rely on legitimate use (contractual necessity, statutory obligation) vs. which require explicit consent under DPDP. The purpose basis must not be mischaracterised as consent where a different basis applies.

2. **[TODO — Legal]** Review the opt-out default for `analytics`. DPDP may require opt-in for all personal data processing purposes. Confirm before launch.

3. **[TODO — Legal + Engineering]** Draft the consent notice (§ 5) for each purpose key in this table. The notice must be machine-readable (to enable versioning and audit) and human-readable (for display to the customer).

4. **[TODO — Legal]** Define the retention period for withdrawn consent records. The record of the withdrawal event itself may need to be retained for compliance evidence.

5. **[TODO — Legal]** Review `marketing_offers` consent flow for TRAI DND/TCCCPR compliance in addition to DPDP — promotional SMS/WhatsApp is regulated by TRAI scrubbing rules.

6. **[TODO — Legal]** Define the guardian consent and identity verification process for `family_profile` dependent data for minors.

7. **[TODO — Engineering]** Implement consent version tracking (`notice_version` field): when the privacy notice is updated, flag customers who need to re-consent if material changes affect their active consents.

8. **[TODO — Legal]** Assess whether any consent purpose requires a Consent Manager intermediary under the DPDP rules (rules on Consent Managers to be notified separately).
