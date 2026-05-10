# DAILY_RUNTIME_REVIEW

Updated: 2026-05-10.

Use this checklist once per operating day. Do not paste secrets, PHI, PII, patient identifiers, full phone numbers, prescriptions, or payment credentials into evidence notes.

## Required capture

- Date/time, environment, operator, and artifact ID.
- Liveness, readiness, deployment summary, provider readiness, worker queue, and dead-letter snapshots.
- Payment/refund exception count and unresolved provider event count.
- OCR exception queue count.
- WhatsApp/SMS delivery failure count.
- Stock anomaly count, negative stock count, and regulated-release exception count.
- Backup job status and latest checksum location.
- Open incidents, owner, severity, and next review time.

## Stop-the-line triggers

- Readiness fails for database, migrations, stock reservation sanity, or worker queue.
- Dead letters grow without assigned owner.
- Any stock-changing operation can proceed while DB readiness is unsafe.
- Payment success is marked without provider settlement evidence.
- H/H1/pharmacist gate is bypassed.
- PHI/PII appears in logs, dashboards, screenshots, or evidence attachments.
