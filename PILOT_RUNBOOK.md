# Production Store Go-Live Runbook (Legacy filename retained as PILOT_RUNBOOK.md)

# PILOT RUNBOOK — Customer Continuity APIs

## Production stores
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

- Stock truth hardening now tracked in `STOCK_TRUTH_10_STATUS.md`; keep invariant-only mutation policy before production cutover.

- Commercial flow integration now tracked in COMMERCIAL_FLOW_TEST_STATUS.md; production readiness still requires end-to-end commercial truth closure.

- Regulated release status tracked in `REGULATED_RELEASE_STATUS.md`; prescription vault status tracked in `PRESCRIPTION_VAULT_STATUS.md`.

- Production runbook note: release requires verified payment signatures and reconciliation truth; see PAYMENT_GATEWAY_STATUS.md.

- Statutory invoice/GST billing status is tracked in `INVOICE_STATUTORY_STATUS.md`; production release requires unique invoice numbering and GST correctness.


- Accounting/Tally production status tracked in `ACCOUNTING_TALLY_PRODUCTION_STATUS.md`; production readiness requires supplier allocation and export truth.

- Product master normalization tracked in `PRODUCT_MASTER_NORMALIZATION_STATUS.md`.
- Salsette migration tracked in `REAL_STORE_DATA_MIGRATION_PLAN.md`.
