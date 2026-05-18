# Provider Degradation Matrix — 2026-05-18

**Branch:** `audit/e2e-flight-readiness-20260518`
**Method:** Static code audit + live environment verification (local dev, all providers disabled)

This document answers: "What happens to each user flow when a provider is unavailable or disabled?"

---

## Summary

| Provider | Enabled locally | Degradation mode | Data loss risk | Fail-closed? |
|----------|----------------|-----------------|----------------|-------------|
| Payment (Razorpay) | ❌ No | PRECONDITION_FAILED 412 | None | ✅ Yes |
| WhatsApp (Meta) | ❌ No | Silent skip / disabled | None | ✅ Yes |
| OCR (prescription) | ❌ No | Dry-run / blocked in prod | None | ✅ Yes |
| Storage (S3/Forge) | ❌ No | Upload rejected | None | ✅ Yes |
| OTP SMS provider | ❌ No (dev mode) | devCode returned in response | None | ✅ Yes (prod blocked) |
| Email (SMTP/SES) | ❌ No | Breach notify queued, no send | None | ⚠ Partial |
| PagerDuty on-call | ❌ No | Fire-and-forget (no retry) | None | ⚠ Partial |

---

## 1. Payment Provider (Razorpay)

**Env:** `PAYMENT_PROVIDER_ENABLED=false`

**What breaks:**
- Creating a payment order → `PRECONDITION_FAILED 412: "Payment provider disabled"`
- Verifying a webhook → short-circuits at provider-enabled check

**What works:**
- Order creation (pre-payment) → fully functional
- Order status queries → functional
- Order history → functional
- COD orders (if implemented) → not gated by Razorpay

**Code path:** `server/services/paymentGateway.ts:65` — `isProviderEnabled("PAYMENT_PROVIDER_ENABLED", false)` fails closed with `TRPCError`.

**Dead-letter behavior:** Failed provider calls attempt dead-letter registration. With provider disabled, the call never reaches the dead-letter path — it rejects at the guard.

**User experience:** "Payment provider disabled" error. Cart checkout blocked. Order creation before payment step works.

**Production fix:** Set `PAYMENT_PROVIDER_ENABLED=true` + `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`.

---

## 2. WhatsApp Provider (Meta Business API)

**Env:** `WHATSAPP_PROVIDER_ENABLED=false`, `WHATSAPP_API_TOKEN=` (empty)

**What breaks:**
- Order confirmation notifications
- OTP delivery via WhatsApp
- Prescription status notifications
- Delivery tracking updates

**What works:**
- All order/prescription operations on the server side — WhatsApp is fire-and-forget notification only
- Admin `/admin/whatsapp` surface — UI likely shows disabled state

**Code path:** `server/routers/whatsappHelpers.ts:202` — `isTruthyEnv(process.env.WHATSAPP_PROVIDER_ENABLED)` gate. Messages silently skipped when false.

**Retry/dead-letter:** WhatsApp notification failures are not included in the outbox dead-letter queue (that is for transactional domain events). Silent skip is intentional for notifications.

**User experience:** No WhatsApp messages received. App functions normally. No error surfaces to the user.

**Production fix:** Set `WHATSAPP_PROVIDER_ENABLED=true` + `WHATSAPP_API_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_WEBHOOK_SECRET`.

---

## 3. OCR Provider (Prescription Ingestion)

**Env:** `OCR_PROVIDER_ENABLED=false`, `OCR_PROVIDER_API_KEY=` (empty)

**What breaks:**
- Automated prescription OCR processing → blocked
- Admin `/admin/ocr` intake surface → provider-gated

**What works:**
- Manual prescription upload (image stored, pending pharmacist review)
- Pharmacist manual review and approval
- All downstream dispensing once approved

**Code path:** `server/services/ocrProductionSafety.ts:24` — `OCR_PROVIDER_ENABLED_VALUES` check. In production with `OCR_PROVIDER_ENABLED=false`, the `assertOcrAllowed()` call throws a TRPCError. In dev with it false, same behavior.

**Governance:** OCR results are assistive-only — `assertAITaskAllowed()` blocks OCR from directly authorizing dispensing. Even when OCR is enabled, a pharmacist must confirm.

**User experience:** Prescription uploads go to manual review queue. Slightly slower approval path. No data loss.

**Production fix:** Set `OCR_PROVIDER_ENABLED=true` + `OCR_PROVIDER_API_KEY` + `OCR_PROVIDER_NAME`.

---

## 4. Storage Provider (S3 / Forge Object Storage)

**Env:** `STORAGE_PROVIDER_ENABLED=false`

**What breaks:**
- Prescription image upload → rejected
- Product image upload → rejected
- Any file upload flows

**What works:**
- All non-upload operations
- `GET /readyz` correctly reports `"storage": "disabled"` — not a failure, just disabled

**Code path:** `server/_core/env.ts:39` — `isProviderEnabled("STORAGE_PROVIDER_ENABLED", true)` in production mode. The healthcheck explicitly labels storage as "disabled" rather than "unhealthy" when the env var is false.

**User experience:** Prescription upload form will fail with provider error. All other screens unaffected.

**Production fix:** Set `STORAGE_PROVIDER_ENABLED=true` + `S3_BUCKET` + `AWS_REGION` + `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (or Forge credentials).

---

## 5. OTP / SMS Provider

**Env:** No SMS provider configured. `NODE_ENV=development`.

**Behavior in dev:**
- `sendOtp` returns `{"devCode": "XXXXXX"}` in the response body
- The OTP code is usable for immediate verification
- No actual SMS is sent

**Behavior in production (no provider):**
- `sendOtp` should either: (a) fail with provider error, or (b) store OTP in DB and return `{"success":true}` with no devCode (OTP never delivered)
- **Risk:** If no SMS provider is configured in production, users cannot receive OTP codes. They are locked out.
- `devCode` is suppressed in production (not returned in response) — confirmed correct gating via dev-mode check.

**Production fix:** Configure an SMS/OTP provider (Twilio, MSG91, Exotel, etc.) before going live.

---

## 6. Email / SMTP (Breach Notifications)

**Env:** `BREACH_NOTIFY_RECIPIENT_EMAIL` not set. No SMTP/SES configured.

**What breaks:**
- Breach notification emails not sent when `breachNotificationDispatcher.ts` is triggered
- `ONCALL_ALERT_EMAIL` captured but not wired to SMTP fallback

**What works:**
- Breach event is detected and payload generated correctly
- Breach record written to DB (evidence preserved)
- The missing piece is the outbound transport

**Code path:** `server/services/breachNotificationDispatcher.ts` — generates correct payload, no transport configured per OPEN_BLOCKERS.md.

**Risk:** In production, a data breach might not trigger email notification even if detected. The event IS recorded in the database. Human monitoring of breach_events table or a PagerDuty integration would catch it, but automated email notification is missing.

**Production fix:** Set `BREACH_NOTIFY_RECIPIENT_EMAIL` + configure SMTP/SES transport. See FUTURE_FEATURES.md.

---

## 7. PagerDuty On-Call Integration

**Env:** Not configured.

**Behavior:**
- On-call alert dispatch is fire-and-forget
- No retry on failure
- No dead-letter for failed PagerDuty calls
- Rota stored in `server/data/oncall-rota.json` (not DB)

**Risk:** Alert delivery failures are silent. Must migrate to DB-backed rota before multi-node deployment (noted in OPEN_BLOCKERS.md).

**Production fix:** Configure PagerDuty API key + migrate rota to DB table before multi-node.

---

## Overall Degradation Posture

**All transaction-critical providers (payment, OCR, storage) fail closed** — they throw `TRPCError` rather than silently succeeding. No fake payment success states exist (confirmed: `notImplementedLifecycleResult` removed in SM-E). No OCR auto-approves without pharmacist sign-off.

**Notification providers (WhatsApp, Email, PagerDuty) are fire-and-forget** — their failure does not block the primary transaction. This is an acceptable trade-off for availability but means operators need to actively monitor delivery failures.

**The app is fully usable locally without any provider credentials** for: login, onboarding, browsing catalog (post-onboarding), order placement (pre-payment), pharmacist review, staff operations, admin dashboards. Only the final payment step, file uploads, and notifications require provider credentials.

---

*Matrix produced: 2026-05-18*
*Auditor: Claude Code automated pass*
*Method: Static code audit + live env verification (/readyz, env var inspection)*
