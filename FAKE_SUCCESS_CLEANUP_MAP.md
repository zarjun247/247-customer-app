# Fake-Success Cleanup Map

**Latest main SHA inspected:** `f7d049825eb17922e9fa0c47326620e26a396186`  
**Branch:** `chore/runtime-stub-placeholder-fake-success-audit`  
**Rule:** unconfigured/demo provider paths must never return or imply `sent`, `synced`, `verified`, `printed`, `paid`, `refunded`, or completed in production. Explicit fail-closed states are acceptable only when visible to operators and logged/audited where material.

## Provider fake-success

| Provider | Current behavior | Production-safe behavior required | Current classification | Required fix branch |
|---|---|---|---|---|
| SMS / MSG91 | Missing `SMS_PROVIDER_API_KEY` returns `provider_unconfigured`, `ok:false` in production; boolean wrapper returns true only when detailed status is `sent`. | Keep fail-closed; ensure callers surface failure instead of silently ignoring notification failure. | Acceptable fail-closed | None; optional visibility hardening |
| WhatsApp Cloud API | Missing phone number/token returns `provider_unconfigured`, `ok:false` in production; demo skips only outside production/demo mode. | Keep fail-closed; no `sent:true`/`status:sent` unless Cloud API accepts the request. | Acceptable fail-closed | None; optional visibility hardening |
| OTP | Provider contract requires production provider state; OTP test/demo paths are covered by guard tests. | No dev code or bypass OTP in production; operator-visible disabled/unconfigured state. | Acceptable fail-closed pending endpoint-level proof | `fix/otp-production-proof` if endpoint audit finds gaps |
| Razorpay payment order | Payment provider must be enabled and credentials must exist before order creation. | No local/demo order IDs in production. | Acceptable fail-closed | None |
| Razorpay payment verification | Missing secret returns `verified:false`, `provider_unconfigured`; demo/test returns `demo_skipped`, not verified. | Only HMAC-verified signatures may mark paid/captured. | Acceptable fail-closed | None |
| Razorpay webhook | Webhook disabled or secret missing in production rejects; signature mismatch rejects. | Persist only verified/idempotent events; replay must be safe. | Acceptable fail-closed | None |
| Razorpay refund | Missing Razorpay credentials creates a pending ledger row with provider state `provider_not_configured` and returns `ok:true`, `status:"pending"`. | Do not let `ok:true` be read as refund success; expose `providerSynced:false`/pending/manual action. | Production risk, not fake refunded | `fix/refund-provider-unconfigured-semantics` |
| Printer / label printing | Provider contracts distinguish `printed`, `preview_only`, `not_printed`, `provider_unconfigured`, `skipped_demo`. | No `printed` unless real printer proof exists; preview must remain preview. | Acceptable fail-closed by contract; caller proof still needed | `fix/printer-runtime-proof` if callers convert preview to printed |
| OCR | Admin OCR processing falls back to `mockOcrParse` and can complete a job with mock invoice data. | No mock parser in production. Unconfigured OCR must be fail-closed; CSV import must be explicit structured import, not OCR success. | P0 fake-success blocker | `fix/ocr-no-mock-production-fallback` |
| Tally / ERP export | Generates CSV locally but reports `provider_unconfigured_export_generated`, `imported:false`, `synced:false`; duplicate returns not synced. | Generated export is not provider sync; only confirmed Tally import/sync can mark synced/imported. | Acceptable fail-closed | None; add UI clarity if needed |
| Object storage / S3/Forge | Storage proxy fails closed when credentials missing; OCR UI has placeholder URL fallback if upload endpoint fails. | Runtime jobs must not persist placeholder storage URLs; storage proxy must keep denying unsafe keys. | P0 in OCR UI; proxy acceptable | `fix/ocr-storage-upload-required` |
| Maps/geocoding | Server proxy throws when Forge/Maps credentials are missing; client map uses hardcoded `DEMO_MAP_ID`. | No demo map ID in production; geocoding/distance must fail visibly when unconfigured. | P1 frontend config risk | `fix/maps-production-config` |

## Payment fake-success

### Verification

- **Current:** `verifyGatewayPaymentSignature` returns `verified:false` with `provider_unconfigured` when `RAZORPAY_KEY_SECRET` is missing; demo/test mode returns `demo_skipped`, not verified.
- **Required:** only cryptographic success may produce `verified:true`.
- **Classification:** acceptable fail-closed.

### Webhook

- **Current:** `verifyGatewayWebhookSignature` requires `PAYMENT_WEBHOOK_ENABLED`; missing production webhook secret throws; malformed signature length returns false; route returns rejection on lifecycle errors.
- **Required:** duplicate webhook handling remains idempotent and does not reapply side effects.
- **Classification:** acceptable fail-closed.

### Refund

- **Current:** provider-unconfigured refund initiation records pending provider state and returns `ok:true`, `status:"pending"`.
- **Required:** response shape must make provider non-execution impossible to misread as refunded or provider-synced.
- **Classification:** production risk, not fake success because `status` is pending and `providerState` is not configured.

### Settlement

- **Current:** settlement/report helpers return DB-derived rows/counts; no provider settlement success proof was found in runtime audit.
- **Required:** no settlement may be marked reconciled/settled without provider or bank proof.
- **Classification:** production risk / proof gap.

## Operational fake-success

| Operation | Current behavior | Production-safe behavior required | Current classification | Required fix branch |
|---|---|---|---|---|
| Print | Contract supports `preview_only`/`not_printed`; scanner guards preview marked printed. | No printed state without device acceptance/spool proof. | Acceptable fail-closed by contract | `fix/printer-runtime-proof` if needed |
| Tally export | CSV generation returns not synced/imported. | Generated file must not equal synced/imported. | Acceptable fail-closed | None |
| WhatsApp send | Missing config returns not sent; Cloud API error returns failed. | Template/API accepted result only can mark sent. | Acceptable fail-closed | None |
| SMS send | Missing config returns not sent; MSG91 error returns failed. | Provider accepted result only can mark sent. | Acceptable fail-closed | None |
| OCR parse | Mock fallback returns invoice lines and processJob returns success. | No mock data in production; unconfigured OCR returns fail-closed/manual-required. | P0 fake-success blocker | `fix/ocr-no-mock-production-fallback` |
| Backup/restore | Scripts/runbooks are present; this audit did not find fake restore success in runtime. | Restore drills must report actual DB verification. | Proof gap / P2 | `proof/backup-restore-live-drill` |
| Healthcheck | Vite dev health returns `{ success:true }`; production health docs warn about placeholders. | Healthcheck success must not imply provider/payment/stock readiness unless those checks run. | False positive + docs risk | `fix/healthcheck-readiness-scope` if production health overclaims |
| Worker job completion | New worker runtime completes only after handler returns and dead-letters missing handlers/unavailable statuses; guard misses success-like booleans with absent status. Legacy worker has TODO alerting/attempt concerns. | Provider unavailable/demo/unconfigured result must dead-letter; no omitted-status fake success. | P1 production risk | `fix/worker-fake-success-guard` |
| Storage upload | Storage proxy fail-closed, but OCR admin UI supplies placeholder URL fallback. | No placeholder URL may create a production job. | P0 blocker | `fix/ocr-storage-upload-required` |

## Branch queue

1. `fix/ocr-no-mock-production-fallback`
2. `fix/ocr-storage-upload-required`
3. `fix/worker-fake-success-guard`
4. `fix/refund-provider-unconfigured-semantics`
5. `fix/admin-placeholder-production-gates`
6. `fix/maps-production-config`
7. `fix/reservation-audit-entity-ref`
8. `fix/quick-verify-regulated-rx-gates`
9. `fix/governance-scanner-false-positive-classification`
