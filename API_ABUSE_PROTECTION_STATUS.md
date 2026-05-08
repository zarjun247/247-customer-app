# API Abuse Protection Status

## Scope and inspection summary

This PR is additive and limited to abuse/rate-limit/replay guardrail boundaries. It does **not** change pharmacy order, stock reservation, prescription approval, or payment lifecycle business logic.

Inspected routes/helpers:

- Auth/OTP: `server/routers.ts` `authRouter.sendOtp`, `authRouter.verifyOtp`.
- Cart/checkout: `server/routers.ts` `cartRouter.upsert`, `orderRouter.checkout`.
- Upload/prescription: `server/routers.ts` `prescriptionRouter.upload`.
- Provider webhooks: `server/routers/whatsappRouter.ts` webhook guard/message/logRaw paths and `server/routers/paymentRouter.ts` Razorpay signature/idempotency usage.
- Existing rate-limit/env fail-hard: inline OTP `OTP_RATE_LIMIT_BACKEND` production gate and `_core/env.ts` production env checks.
- Audit/security logging: `server/services/audit.ts`, `server/_core/redact.ts`, WhatsApp webhook log table usage.

## Files changed

- `server/services/rateLimitService.ts` — bounded deterministic rate-limit store, actor-key builder, and production backend posture helper.
- `server/services/abuseProtection.ts` — central abuse decision service, route/action helper policies, webhook replay helper, and suspicious activity redaction/logging helper.
- `server/middleware/rateLimit.ts` — compatible Express/tRPC-adjacent abuse rate-limit hooks for future route wiring.
- `server/api-abuse-protection.test.ts` — behavioral tests for OTP, upload, cart, checkout, admin, webhook, redaction, and production posture.
- `server/api-abuse-route-inspection.test.ts` — route inspection tests proving the high-risk route surfaces were reviewed and current provider signature/idempotency gates remain present.
- `API_ABUSE_PROTECTION_STATUS.md` — this status document.
- `BOT_PROTECTION_STATUS.md` — bot threat model and remaining risk document.

## OTP/auth protection

Current runtime route posture:

- OTP send already has an inline 15-minute phone counter and production `OTP_RATE_LIMIT_BACKEND` gate.
- OTP verify already throttles repeated failed verification attempts and does not log OTP codes.
- OTP dev code is only returned outside production.

Added central service posture:

- `checkOtpSend` uses actor dimensions phone + IP + route/action with reason `otp_spam`.
- `checkOtpVerifyFailure` uses phone + IP + route/action with reason `login_bruteforce`.
- Suspicious logging redacts `otp`, `code`, token, cookie, and signature fields.

Production limitation:

- Durable OTP/API counters are not introduced in this PR. `getProductionRateLimitPosture` explicitly reports production memory-only protection as **not horizontally durable** unless a durable backend is configured or single-instance memory is explicitly accepted.

## Upload protection

Current runtime route posture:

- Upload accepts one prescription payload per call.
- MIME type allow-list is limited to JPEG, PNG, and PDF.
- Maximum decoded file size is 8 MiB.
- Magic bytes are checked before storage.
- The existing route does not log raw base64 image payloads.

Added central service posture:

- `checkUploadAttempt` applies conservative hourly upload attempt throttling by user/IP/route/action with reason `upload_abuse`.
- `sanitizeAbuseDetails` redacts raw image/base64/prescription payload details before suspicious activity logging.

## Cart/checkout protection

Current runtime route posture:

- Cart upsert remains protected/authenticated.
- Checkout remains protected/authenticated and keeps existing prescription gate, soft lock, stock reservation, and order creation behavior unchanged.

Added central service posture:

- `checkCartUpsert` provides a conservative high ceiling for excessive cart mutation velocity (`cart_spam`).
- `checkCheckoutAttempt` provides a conservative checkout velocity guard (`checkout_spam`).
- No stock reservation logic, cart mutation logic, or order state transitions were modified.

## Admin/staff protection

Current runtime route posture:

- Staff/admin access continues to use existing RBAC procedure factories.
- No RBAC redesign is included.

Added central service posture:

- `checkAdminBruteforce` covers admin login/unauthorized admin-route attempts with reason `admin_bruteforce`.
- Suspicious activity events include route/action, actor id when available, hashed IP, masked/hashed phone, severity, and timestamp.

## Webhook replay behavior

Current runtime route posture:

- WhatsApp webhook helpers validate configured token/signature in production.
- Razorpay client-side verification uses HMAC verification and idempotency for payment verification.
- Provider webhooks are not protected by naive IP-only throttling.

Added central service posture:

- `checkWebhookSignatureFailure` counts malformed provider signature attempts as `provider_signature_failure` and returns suspicious decisions when exceeded.
- `checkWebhookReplay` provides a static in-memory replay detector keyed by provider + event ID for tests and low-risk future hook wiring.

P1 limitation:

- No durable provider event-id table was added in this PR. Durable webhook replay/idempotency storage remains P1 before claiming complete multi-instance replay protection for provider webhooks.

## Suspicious logging behavior

`createSuspiciousActivityEvent` includes:

- request id when supplied;
- actor id when supplied;
- hashed IP;
- hashed and masked phone;
- route/action;
- reason;
- severity;
- ISO timestamp;
- sanitized details.

It must not include OTP codes, passwords, session/auth tokens, cookies, payment signatures, raw prescription images/base64, or full medical details. Tests verify redaction of these fields.

## Production behavior matrix

| Environment | Behavior |
| --- | --- |
| Local/dev | Bounded in-memory counters are allowed for development and manual verification. Logs are redacted. |
| Test | Deterministic in-memory stores can be instantiated per test. |
| Production | `getProductionRateLimitPosture` does not mark memory-only protection as horizontally durable. Durable Redis/database backend or explicit single-instance acceptance is required before production-ready claims. |

## Validation results

Validation commands requested for this PR:

- `pnpm install`
- `pnpm run check`
- `pnpm test -- --runInBand`
- `pnpm run build`
- `git diff --check`

Final command outcomes are reported in the PR/final response.

## Remaining risks

- P0: None introduced by this additive PR.
- P1: Wire central abuse checks into high-risk tRPC/HTTP routes in a follow-up once route-file modification is allowed; add durable Redis/database backend and durable provider webhook event-id storage.
- P2: Add CAPTCHA/device fingerprint step-up for public OTP/auth after product/legal review; add dashboards/alerts for suspicious activity event volumes.
