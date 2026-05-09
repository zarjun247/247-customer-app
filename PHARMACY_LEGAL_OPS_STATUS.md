# Pharmacy Legal Operations Status — PR 0051-equivalent branch

## Inspection baseline

- Latest available main-equivalent SHA inspected in this container: `200fafcc20451cc43e8d6272588ec7e26e12d9c8`.
- GitHub remote status: this checkout had no `origin`, so `git fetch origin main` could not run; work started from the provided main-equivalent local HEAD.
- Prior PR #94 inspected: no. GitHub API returned `404 Not Found` unauthenticated for `zarjun247/247-customer-app` PR #94, and `gh` was unavailable. PR #94 was not merged or copied.

## Migration

- Migration added: yes.
- Migration number used: `0049` (`drizzle/0049_pharmacy_legal_ops.sql`).
- Reason `0051` was not used: `MIGRATION_AUDIT_STATUS.md` and the local `drizzle/*.sql` tail show latest numbered migration `0048`; provider `0049` and reservation `0050` were not present in this checkout. Per migration rules, the next available number was `0049`.
- Next migration number after this PR: `0050` unless another branch lands first.

## Schema summary

The migration and `drizzle/schema.ts` add legal operations tables for:

- Store drug licenses and expiry/status tracking.
- Pharmacist registrations and pharmacist duty sessions.
- Regulated release evidence for sale/order references.
- SOP acknowledgements.
- Inspection export manifests.
- Manual temperature logs and cold-chain breaches.
- Batch recalls and recall customer impacts.
- Expired medicine disposal register.

## Runtime behavior

### Store license behavior

Regulated release now has an active store-license assertion. Missing, expired, or suspended licenses block regulated release and create audit actions; public summaries omit document storage keys.

### Pharmacist duty behavior

A regulated release requires an active pharmacist duty session at the store and an active pharmacist registration for the approving user. Generic admin identity is not converted into pharmacist authority.

### Regulated release evidence behavior

H/H1/X/Rx release requires active license, pharmacist-on-duty proof, registered pharmacist proof, patient reference, prescription reference, doctor evidence for H1/X/Rx, positive quantity, and batch safety checks where batch evidence exists. Sale confirmation now checks the regulated evidence pack after existing Rx/H1 compliance checks.

### Cold-chain foundation

Manual temperature logs are explicitly marked `manual`. Open/quarantined cold-chain breaches block affected batch release; no code claims IoT success.

### Batch recall foundation

Batch recalls can be created, affected customers are derived from regulated release evidence, recalled batches can be quarantined, notification tasks remain `pending` unless a provider later confirms delivery, and closure requires pharmacist registration.

### Expiry disposal foundation

Expired medicine disposal records are auditable. Disposal stock movement is routed through the stock invariant `disposeBatch` gateway, not direct stock updates.

### SOP acknowledgement

Required SOP codes are defined for cashier sale, regulated release, purchase inwarding, stock audit, delivery handover, refund/return, offline fallback, cold-chain, recall, and expiry disposal.

### Inspection export behavior

Inspection export manifests include regulated release, H1 reference, license/duty, and recall/disposal sections. Exports redact/minimize PHI and secrets and explicitly do not claim regulator acceptance.

## Tests added

- `server/pharmacy-legal-ops.test.ts`
- `server/pharmacy-legal-release-gates.test.ts`
- `server/pharmacy-inspection-export.test.ts`

## DB proof status

DB-backed proof is not claimed in this container unless `TEST_DATABASE_URL` is supplied. Static migration verification is run with `node scripts/verify-migrations.mjs`.

## Remaining risks

| Severity | Risk | Follow-up |
| --- | --- | --- |
| P0 | Fresh and existing DB replay must be run against a real MySQL test database before production release. | Run DB smoke with `TEST_DATABASE_URL` and migration replay. |
| P1 | Provider `0049` and reservation `0050` were not present in this checkout; this PR uses `0049`. | Merge captain must renumber/rebase if those migrations land first. |
| P1 | Export generation produces manifests/data, not regulator-approved filings. | Counsel and pharmacist-in-charge review required before submission. |
| P2 | Customer recall notification delivery is task-only until provider delivery confirmation is wired. | Integrate notification provider event confirmations in a later PR. |
