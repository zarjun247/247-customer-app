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

## Barcode Scanner + Label Queue (Prompt 6)
- Scanner assumption: USB/Bluetooth keyboard-wedge input.
- SOP: purchase inwarding -> generate/queue label; POS scan -> add candidate line; stock audit scan and return scan resolve by barcode.
- Printer fallback: if PRINTER_HOST/PRINTER_PORT missing, keep label jobs queued/failed-with-retry without blocking inwarding.
- Env: PRINTER_HOST, PRINTER_PORT, PRINTER_NAME.


> Note: Production hardening control-plane and roadmap now tracked in `PRODUCTION_READINESS_STATUS.md`. Legacy pilot framing (including filename `PILOT_RUNBOOK.md`) must be reframed as Production Store Go-Live in a later PR.

- 2026-05-03: Red-alert security lockdown updates applied (env fail-hard, worker auth, storage proxy hardening, OTP hardening, security guard tests). Next: chore/github-ci-branch-protection.

- GitHub CI is now required before production merges.
- Local Codex validation is not sufficient as final merge authority.
- Production chain readiness requires green GitHub CI checks.

- Updated: idempotency/reservation truth tracking added; app/POS availability must use canonical availability formula.

- Stock truth hardening status moved to `STOCK_TRUTH_10_STATUS.md` (Prompt 6).

- Added commercial flow integration tracking doc: COMMERCIAL_FLOW_TEST_STATUS.md.

- Regulated release status tracked in `REGULATED_RELEASE_STATUS.md`; prescription vault status tracked in `PRESCRIPTION_VAULT_STATUS.md`.

- Payment gateway verification/reconciliation status tracked in PAYMENT_GATEWAY_STATUS.md.

- Statutory invoice/GST billing status is tracked in `INVOICE_STATUTORY_STATUS.md`; production release requires unique invoice numbering and GST correctness.


- Accounting/Tally production status tracked in `ACCOUNTING_TALLY_PRODUCTION_STATUS.md`; production readiness requires supplier allocation and export truth.


- Phase 11 product master normalization + Salsette migration planning: partial (tracked in PRODUCT_MASTER_NORMALIZATION_STATUS.md and REAL_STORE_DATA_MIGRATION_PLAN.md). Next: feat/barcode-production-ux.
