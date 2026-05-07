# WhatsApp Notification Safety Status

## WhatsApp webhook verification behavior
- Production WhatsApp webhook procedures now fail closed unless either `WHATSAPP_WEBHOOK_VERIFY_TOKEN` or `WHATSAPP_WEBHOOK_SECRET` is configured and the inbound request supplies a matching token or valid HMAC-SHA256 signature.
- Accepted token headers are `x-webhook-token`, `x-whatsapp-webhook-token`, and `x-hub-verify-token`.
- Accepted signature headers are `x-hub-signature-256`, `x-whatsapp-signature`, and `x-signature`; the signature is checked against the raw payload passed to the guard.
- Non-production local/demo behavior is explicit: webhook procedures are open outside production, so local bot testing does not require provider credentials.

## Regulated-intent escalation behavior
- WhatsApp inbound text that appears to involve Rx medicines, Schedule H/H1/X, dosage/dose changes, substitutions, emergency/side effects, prescription interpretation, or refill requests is intercepted before the normal bot menu/state machine.
- The bot response avoids medical advice and says it cannot confirm regulated refills/orders on WhatsApp.
- Regulated intents create a staff/pharmacist handoff where the current handoff table supports it and write an audit action (`whatsapp.regulated_intent.escalated`).
- Regulated cart confirmation remains blocked from autonomous order creation and creates a pharmacist handoff instead of releasing a sale/order.

## Identity/session binding behavior
- WhatsApp phone numbers are normalized before full webhook session lookup/binding.
- Identity resolution checks verified WhatsApp links, then existing sessions, then an existing customer phone record; it does not create a new customer account from an inbound WhatsApp message alone.
- Unidentified phones are placed in `pending_link`/unlinked session state for staff linkage.
- Unlinked sessions cannot retrieve private order details by guessed order ID, and linked sessions must match the order owner before status details are returned.
- Unlinked prescription uploads are preserved as pending linkage state and are not inserted against a synthetic customer.

## Notification status behavior
- Notification events now distinguish `pending`, `sent`, `failed`, `provider_unconfigured`, `retry_scheduled`, `dead_letter`, and `skipped_demo`.
- Provider failures and unavailable/unconfigured providers do not mark notifications as `sent`.
- Retry scheduling records `retry_scheduled`; preference-disabled notifications are recorded as `dead_letter` rather than silently sent.

## Preference update behavior
- Default notification preference creation now uses duplicate-key-safe upserts for all default channels.
- `updateNotificationPreferences` updates `allowSensitiveInUnsafeChannels` for unsafe channels even when no channel enablement map is supplied.
- Sensitive notification payloads are redacted for unsafe channels unless the customer preference explicitly allows sensitive content there.

## Provider unavailable behavior
- Boolean-only provider results are interpreted safely: `true` becomes `sent`, `false` becomes `failed`, and missing/null provider results become `provider_unconfigured`.
- Structured provider results may report `failed`, `provider_unconfigured`, `retry_scheduled`, `dead_letter`, or `skipped_demo` without claiming delivery success.

## Migration/backfill notes
- Added `drizzle/0042_whatsapp_notification_safety.sql`.
- The migration first expands the existing notification status enum to include both legacy `unconfigured` and new states, backfills `unconfigured` rows to `provider_unconfigured`, then removes the legacy enum value.
- No WhatsApp provider connector implementation was changed.

## Validation results
- `pnpm run check` passed during development.
- `pnpm test -- whatsapp-notification-safety.guard.test.ts --runInBand` passed and, because of the current Vitest argument behavior, ran the full suite: 55 files / 215 tests passed.
- `pnpm install` passed; pnpm reported ignored build scripts for `@tailwindcss/oxide` and `esbuild`, with the lockfile already up to date.
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed: 55 files / 215 tests.
- `pnpm run build` passed; Vite emitted pre-existing-style warnings about missing analytics env placeholders and large chunks.

## Files changed
- `drizzle/schema.ts`
- `drizzle/0042_whatsapp_notification_safety.sql`
- `server/db.ts`
- `server/routers.ts`
- `server/routers/whatsappRouter.ts`
- `server/services/notificationService.ts`
- `server/whatsapp-notification-safety.guard.test.ts`
- `WHATSAPP_NOTIFICATION_SAFETY_STATUS.md`

## Remaining risks
- **P0:** None known after validation.
- **P1:** Signature verification depends on the upstream HTTP/TRPC adapter passing a reliable raw payload string into the guard or `x-raw-body` header for provider-native webhooks.
- **P2:** Regulated-intent detection is conservative keyword/regex logic and may still require later tuning with pharmacist-reviewed false-positive/false-negative samples.
