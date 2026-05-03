# PILOT RUNBOOK — Customer Continuity APIs

## Pilot stores
- Salsette 27 (live)
- Signet/Lodha Park (fitout)
- Lodha NCP (LOI)

## Enablement checklist
1. Configure notification env keys from `config/secrets.json.example`.
2. Run install/check/test/build.
3. Verify customer routes:
   - `notifications.list`, `notifications.preferences`, `notifications.updatePreferences`
   - `refills.due`, `refills.snooze`, `refills.markRefilled`, `refills.createReorderPrompt`
   - `dosage.todayPlan`, `dosage.recordTaken`, `dosage.recordSkipped`, `dosage.adherence`, `dosage.remaining`
   - `ratings.create`, `ratings.update`, `ratings.get`
   - `orders.invoiceSummary`

## Safety checks
- Redaction default for sensitive push/SMS payloads.
- Reorder prompt returns draft only (`autoConfirmedSale=false`).
- Rating blocked unless order state is delivered/completed.
- Dosage APIs only track adherence (no advice text).

## Rollback
- Revert latest correction commit and redeploy.

## Known gaps
- Provider send adapters remain deferred; DB persistence is enabled for notification/dosage/rating records.

## Next prompt
Prompt 6 — Barcode Scanner + Label Printing + Scan-to-Truth Systemwide Hardening.
