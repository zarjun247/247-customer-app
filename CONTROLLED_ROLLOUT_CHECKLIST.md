# CONTROLLED_ROLLOUT_CHECKLIST

Updated: 2026-05-10.

## Rollout stance

Controlled rollout is allowed only after the P0 gate in `LAUNCH_GO_NO_GO_MATRIX.md` is green. Until then, the system may be used for demos, staging rehearsals, and staff training only.

## First deployment limits

- **Maximum stores:** 1 live store for the first 7 operating days.
- **Expansion to 2 stores:** allowed only after 7 consecutive days with no P0 incident, no unreconciled provider settlement variance, no unreviewed stock exception older than 24 hours, and no open H/H1/pharmacist gate breach.
- **Expansion beyond 2 stores:** requires a new scale-readiness review, provider stability evidence, restore drill recency check, monitoring coverage review, and supplier invoice duplicate backfill decision.
- **Daily transaction cap:** set by launch leadership based on staffing; do not exceed staff capacity for same-day reconciliation and manual fallback.

## Required pre-launch checklist

| Item | Required evidence | Owner |
| --- | --- | --- |
| Release validation | `pnpm run check`, `pnpm test`, `pnpm run build`, migration verification, governance guards, and `git diff --check` pass on release commit. | Engineering lead |
| Hosted CI | Archived target-branch workflow results; DB concurrency workflow observed if available. | Engineering lead |
| Staging deploy | Artifact ID, URL, health/readiness output, smoke test, and rollback proof. | Release owner |
| Provider verification | Sandbox/staging matrix for payment, WhatsApp/SMS, maps, OCR, printer, storage, and Tally/export. | Integration owner |
| Backup/restore | Measured staging restore drill report with timings, backup ID, verification commands, and signoff. | Restore owner |
| Staff access | Named users, roles, store assignments, MFA/session policy where available, and removal path. | Operations lead |
| Pharmacist SOP | Signed SOP for regulated medicines, prescription review, H/H1/X release, substitutions, exceptions, and fallback. | Pharmacist-in-charge |
| Legal/compliance | Written review or written launch exception from accountable leadership. | Compliance owner |
| Monitoring rota | Primary/secondary owners for metrics, dead letters, refunds, reconciliation, stock, security, and incidents. | Incident commander |
| Manual fallback | Printed/digital fallback procedure tested by launch staff. | Store manager |
| Emergency stop | Kill-switch/degraded-mode/rollback procedure rehearsed and documented. | Incident commander |

## Required staff training

Every launch user must complete role-specific training before receiving live access:

- Store scope and no shared admin account rule.
- Prescription and H/H1/X gate behavior.
- Stock exception capture, quarantine, FEFO deviation, and manual reason policy.
- Payment/refund provider status interpretation and reconciliation workflow.
- Dead-letter, failed notification, failed OCR, and provider retry review process.
- Manual fallback for sales, dispensing, delivery, refund, and reconciliation interruption.
- PHI/PII handling, screenshot/export restrictions, and breach escalation.
- Emergency stop, rollback, degraded-mode, and incident reporting flow.

## Daily launch controls

For every day during the first 14 live operating days:

1. **Daily reconciliation review**
   - Compare orders, provider events, refunds, journal/reversal entries, cash/manual settlements, and delivery completion.
   - Escalate any unreconciled payment/refund variance before the next operating day.
2. **Daily stock exception review**
   - Review negative stock rows, quarantined/blocked/expired batches, FEFO deviations, cancelled reservations, reservation expiries, and manual stock adjustments.
   - No exception may remain unowned for more than 24 hours.
3. **Refund/dead-letter review**
   - Review provider dead letters, worker dead letters, retry schedules, failed refund webhooks, and duplicate settlement attempts.
   - Do not manually settle accounting unless the provider evidence and reversal path are documented.
4. **Prescription/H/H1 review**
   - Pharmacist reviews all regulated gate exceptions and verifies H1/statutory records.
5. **Security/access review**
   - Check failed login patterns, suspicious access, staff role changes, and store assignment drift.
6. **Launch notes**
   - Record daily outcome, incidents, unresolved items, and expansion decision.

## Manual fallback procedure

Use manual fallback when payment provider, internet, printer, OCR, messaging, map/delivery, database, or application availability blocks safe operation.

1. Stop new affected workflow intake if stock/payment/prescription truth cannot be preserved.
2. Record manual order/prescription/refund/stock movement using the approved fallback template.
3. Mark whether stock is physically held, dispensed, returned, quarantined, or unresolved.
4. Keep provider reference numbers, pharmacist approval, staff actor, timestamp, and customer acknowledgement.
5. Re-enter into the system only once service is restored and reconciliation owner approves.
6. Audit every re-entry with reason `manual_fallback_recovery` or equivalent.
7. Escalate any mismatch to incident command before continuing expansion.

## Rollback procedure

1. Incident commander declares rollback scope: application release, provider integration, worker queue, store rollout, or full traffic stop.
2. Freeze new regulated and payment-affecting operations if rollback could duplicate, lose, or misstate commercial/stock truth.
3. Use the last approved deployment artifact and documented rollback command from the release record.
4. Verify health/readiness, migration compatibility, provider webhook handling, queues, and staff login.
5. Run reconciliation checks for all orders/refunds/provider events during the rollback window.
6. Record timeline, owner, evidence, and follow-up blockers.

## Emergency stop procedure

Emergency stop must be used for suspected stock corruption, provider double settlement, PHI/PII exposure, H/H1 gate breach, unauthorized access, failed restore, irreversible migration risk, or patient-safety concern.

1. Stop affected channels and notify launch staff immediately.
2. Disable affected provider sends/workers if they could amplify the incident.
3. Preserve logs, audit records, provider callbacks, and database snapshots according to policy.
4. Move all affected orders/prescriptions/refunds to manual review.
5. Assign incident commander, pharmacy lead, engineering lead, compliance lead, and communications owner.
6. Resume only after written go decision and reconciliation signoff.
