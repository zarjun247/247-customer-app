# RELEASE CHECKPOINT — Customer/Mobile Continuity (Mega Prompt 5 Correction)

## Scope
- Added customer/mobile API wiring for notifications, dosage, ratings, refill due/snooze/refilled/reorder-prompt, and invoice summary.
- Persistence verified per module (see CUSTOMER_MOBILE_RELEASE_STATUS.md).

## Required ENV keys
- NOTIFICATION_PUSH_PROVIDER_KEY
- NOTIFICATION_EMAIL_PROVIDER_KEY
- NOTIFICATION_SMS_PROVIDER_KEY
- NOTIFICATION_WHATSAPP_PROVIDER_KEY
- WHATSAPP_WEBHOOK_VERIFY_TOKEN
- WHATSAPP_ACCESS_TOKEN

## Migration steps
- No new migration in this correction pass.
- Existing DB schema reused for orders/refills/customer medicine records.
- Notifications/dosage/ratings now persisted in DB tables via migration 0024.

## Seed status
- Existing seed pipeline present (`scripts/seed.mjs`); enrichment for new durable tables can be added incrementally.
- Seed expansion for those modules deferred until persistence tables are finalized.

## Rollback
- Revert commit `fix(customer): wire continuity APIs and complete release docs`.
- No destructive DB migration rollback needed.

## Known limitations
- Provider adapter delivery remains deferred; persistence is durable even when provider env is missing.
- Reorder prompt endpoint is draft-prompt only and does not auto-create order.

## Validation
- pnpm install
- pnpm run check
- pnpm test -- --runInBand
- pnpm run build

## Next prompt
Prompt 6 — Barcode Scanner + Label Printing + Scan-to-Truth Systemwide Hardening.

## Barcode Scanner + Label Queue (Prompt 6)
- Scanner assumption: USB/Bluetooth keyboard-wedge input.
- SOP: purchase inwarding -> generate/queue label; POS scan -> add candidate line; stock audit scan and return scan resolve by barcode.
- Printer fallback: if PRINTER_HOST/PRINTER_PORT missing, keep label jobs queued/failed-with-retry without blocking inwarding.
- Env: PRINTER_HOST, PRINTER_PORT, PRINTER_NAME.

