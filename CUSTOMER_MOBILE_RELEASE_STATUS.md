# CUSTOMER MOBILE RELEASE STATUS

## Persistence status
- notificationService: DB-backed via `notification_events` + `notification_preferences` tables.
- refillReminderService: core refill due/snooze/dismiss uses existing DB-backed `refill_reminders` flow via existing db.ts helpers; `createReorderPrompt` endpoint remains draft-only and does not auto-confirm sale.
- dosageTracking: DB-backed via `dosage_schedules` + `dose_logs` tables.
- orderRating: DB-backed via `order_ratings` table with strict delivered/completed gating before create.

## Routes added/updated
- `notifications.list`
- `notifications.preferences`
- `notifications.updatePreferences`
- `notifications.createTest`
- `refills.due`
- `refills.markRefilled`
- `refills.createReorderPrompt`
- `dosage.createSchedule`
- `dosage.todayPlan`
- `dosage.recordTaken`
- `dosage.recordSkipped`
- `dosage.adherence`
- `dosage.remaining`
- `ratings.create`
- `ratings.update`
- `ratings.get`
- `orders.invoiceSummary`

## Safety behavior
- Notification payload redaction default remains enabled for sensitive SMS/push.
- Reorder prompts remain draft-only (`autoConfirmedSale=false`) and include compliance requirement flags for regulated products.
- Dosage APIs are adherence-tracking only and do not generate medical advice.
- Rating APIs do not mutate order/compliance state and reject non-delivered/non-completed orders.

## Frontend wiring
- No broad UI changes in this correction pass.
- Deferred UI wiring explicitly: ratings UI trigger post-delivery, notification preferences settings page wiring, dosage tracker UI card wiring.

## Release docs updated
- RELEASE_CHECKPOINT.md
- PILOT_RUNBOOK.md
- FINAL_EXPORT_MANIFEST.md
- config/secrets.json.example

## Seed status
- Seed system exists; follow-up seed enrichment can now target durable tables.

## Validation results
- pnpm install
- pnpm run check
- pnpm test -- --runInBand
- pnpm run build

## Next recommended prompt
Prompt 6 — Barcode Scanner + Label Printing + Scan-to-Truth Systemwide Hardening

> Note: Production hardening control-plane and roadmap now tracked in `PRODUCTION_READINESS_STATUS.md`. Legacy pilot framing (including filename `PILOT_RUNBOOK.md`) must be reframed as Production Store Go-Live in a later PR.
