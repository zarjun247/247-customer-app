# FINAL EXPORT MANIFEST

## Customer/mobile continuity modules
- server/services/notificationService.ts (DB-backed)
- server/services/refillReminderService.ts (foundation helper + route prompt contract)
- server/services/dosageTracking.ts (DB-backed)
- server/services/orderRating.ts (DB-backed)
- server/routers.ts (notifications/dosage/ratings/refills/invoiceSummary route wiring)
- server/customer-mobile.guard.test.ts
- CUSTOMER_MOBILE_RELEASE_STATUS.md
- RELEASE_CHECKPOINT.md
- PILOT_RUNBOOK.md
- config/secrets.json.example

## Validation manifest
- install/check/test/build executed on branch.

## Deferred items
- Provider adapters for external push/email/sms/whatsapp delivery.
- Insurance submission API.

## Next prompt
Prompt 6 — Barcode Scanner + Label Printing + Scan-to-Truth Systemwide Hardening.
