# Data Privacy Compliance Pack

> Counsel review required. This pack is an implementation checklist and operating baseline, not a final legal opinion or a claim of completed compliance.

## Privacy policy implementation checklist

- Maintain purpose-specific consent records for prescription storage, reminders, WhatsApp/SMS marketing, family profile access, and invoice claim bundles.
- Preserve consent grant/revoke audit trails with actor, source, timestamp, and redacted subject identifiers.
- Keep transactional notifications operationally distinct from marketing/reminder notifications.
- Never log raw prescription images, diagnosis notes, H1 register payloads, OTPs, tokens, payment signatures, cookies, or full customer contact data.
- Provide customer-facing copy explaining what data is collected, why, retention periods, withdrawal process, and lawful exceptions.

## Prescription retention policy

- Store prescription images and derived metadata only for operational/pharmacy/legal retention purposes.
- Prescription vault reuse requires explicit storage/on-file consent and existing vault usability checks.
- Access to prescription images should be audited with actor, purpose, channel, and timestamp.
- Retention/deletion must account for pharmacy recordkeeping obligations before permanent deletion.

## Invoice retention policy

- Invoice records may need statutory/tax retention.
- Invoice access audits should capture actor, invoice ID, purpose, and decision without raw address/phone payloads.
- Customer download/export should mask or minimize data where full detail is not required.

## H1 data handling policy

- Treat H1 register data as sensitive regulated pharmacy data.
- Limit access to pharmacist/admin roles with explicit purpose.
- Audit H1 view/export/denied-access events.
- Do not include raw H1 register contents in application logs or notification payloads.

## Data export process

- Verify requester identity before export.
- Export only data legally allowed and operationally safe to provide.
- Redact secrets/provider tokens/internal audit-only fields.
- Record export audit metadata including requester, approver if any, scope, timestamp, and delivery channel.

## Deletion/anonymization policy where legally allowed

- Confirm whether pharmacy, tax, safety, or fraud-prevention retention obligations apply.
- Revoke future-use consents immediately when requested.
- Delete or anonymize non-retained profile/contact data where legally allowed.
- Keep minimal redacted audit evidence of deletion/anonymization actions.

## Breach response checklist

- Triage affected systems, data categories, customers, and staff accounts.
- Preserve evidence and audit logs.
- Revoke suspicious staff/device sessions and rotate affected secrets.
- Notify internal leadership and counsel.
- Determine customer/regulator notification duties with counsel.
- Document remediation and post-incident controls.

## Staff confidentiality checklist

- Require acknowledgement of patient data confidentiality.
- Require acknowledgement of prescription and H1 handling obligations.
- Require acknowledgement that shared accounts are prohibited.
- Train staff not to copy prescription/customer data to personal devices or messaging channels.
- Review active sessions and revoke lost/stale terminals.

## Counsel-review note

- Product, engineering, and operations should treat this as a technical foundation.
- Final privacy notices, consent wording, retention periods, breach notification thresholds, and jurisdiction-specific obligations require qualified counsel approval.
