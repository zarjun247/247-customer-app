# Bot Protection Status

## Threat model

Primary bot/abuse risks for public and high-risk routes:

- OTP spam against a phone number or an IP range.
- OTP verification brute force and repeated failed login/session creation attempts.
- Prescription upload abuse via oversized, malformed, or repeated file payloads.
- Cart mutation spam and checkout velocity spikes intended to hold stock or stress order paths.
- Admin/staff brute-force or repeated unauthorized admin API attempts.
- Provider webhook abuse through malformed signatures, replayed event IDs, or payload floods.
- Sensitive-data leakage from security logs during abuse investigations.

## Public route protections

Current route posture remains unchanged for business logic:

- Auth/OTP has inline throttling and a production limiter-backend posture gate.
- Prescription upload has MIME allow-list, size limit, and magic-byte validation.
- Cart and checkout are authenticated and retain existing business-rule gates.
- WhatsApp production webhook guard uses token/signature posture, not IP-only limits.
- Razorpay verification uses signature verification and idempotency for payment verification.

Added boundary layer:

- Central actor-key model: IP, user id, phone hash, device/session id, route, and action.
- Central decisions: `allow`, `throttle`, `block`, `suspicious`, and documented `captcha_required` future step-up.
- Central reasons: `otp_spam`, `login_bruteforce`, `upload_abuse`, `cart_spam`, `checkout_spam`, `webhook_replay`, `admin_bruteforce`, `suspicious_velocity`, and `provider_signature_failure`.
- Safe suspicious activity logging that avoids raw OTPs, passwords, tokens, cookies, signatures, and prescription payloads.

## Provider webhook exception strategy

Provider webhooks must not be blocked by naive IP-only throttling because legitimate retries can come from provider infrastructure and may be bursty. The intended strategy is:

1. Verify provider signature/token first.
2. Count malformed signature failures as suspicious.
3. Use provider event IDs/idempotency keys for replay detection.
4. Allow valid provider retries to remain idempotent.
5. Add durable event-id storage before claiming complete replay protection across instances.

## Rate-limit backend status

- Development/test: bounded in-memory counters are available and deterministic.
- Production: memory-only counters are explicitly not marked horizontally durable by the posture helper.
- Durable backend: P1 follow-up should connect Redis or database-backed counters and durable provider event-id storage.

## Future CAPTCHA/device-fingerprint recommendations

- Add CAPTCHA or proof-of-work step-up only after repeated OTP send/verify throttles, not on the first normal user attempt.
- Add stable device/session fingerprints as optional actor-key dimensions while avoiding invasive tracking and respecting consent/privacy requirements.
- Add customer support override/audit workflow for legitimate users caught by throttling.
- Add monitoring dashboards for reason/severity volumes and per-route anomaly spikes.

## Remaining risks

- P0: None from this PR; no core pharmacy, stock, prescription approval, or payment lifecycle mutation logic was changed.
- P1: Central service must be wired into route handlers/middleware in a follow-up allowed to touch those files; durable Redis/database counters and durable webhook replay event storage are required for multi-instance production completeness.
- P2: CAPTCHA/device fingerprint, alert routing, and analyst dashboards are recommended but not included here.
