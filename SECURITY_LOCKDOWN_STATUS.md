# SECURITY_LOCKDOWN_STATUS

## Changes made
- Added production env fail-hard validation for required secrets and provider flags.
- Locked `/api/worker/run` using `x-cron-secret` or bearer admin token in production.
- Hardened storage proxy key validation and sensitive-prefix access policy.
- Hardened OTP flow with production-safe logging, devCode restriction, and request throttling.
- Added redaction helper and used it in security-sensitive logs.
- Added static/runnable security guard tests for env, worker, storage, OTP, procedure exposure.

## Webhook posture
- Payment verify remains HMAC validated in `paymentRouter.verifyPayment`.
- WhatsApp router has signature utility; production should enable `WHATSAPP_PROVIDER_ENABLED` with secret.

## Remaining gaps
- Full DB/Redis OTP brute-force limiter pending.
- Per-record ownership mapping for all storage keys still partial; default is fail-closed for sensitive prefixes unless staff/owner pattern.
- WhatsApp webhook runtime signature enforcement in public procedures should be tightened in follow-up if new provider wiring is added.

## Validation
- See command outputs in PR checks section.

## Next PR
- `chore/github-ci-branch-protection`

## Correction update (OTP + webhook fail-closed)
- Production OTP now requires explicit `OTP_RATE_LIMIT_BACKEND` mode (`database` or `memory_allowed_for_single_instance`); otherwise OTP endpoints fail closed.
- Added OTP verification-failure throttling and explicit production precondition guard.
- WhatsApp webhook public inbound handlers (`logRaw`, `message`) now enforce production verification guard and reject when provider is enabled but verification is missing.
- No payment webhook route found; payment verify callback remains HMAC-validated in payment router.
