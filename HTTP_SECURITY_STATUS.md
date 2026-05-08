# HTTP Security Status

Branch: `security/http-middleware-hardening`

## Middleware inspected

- Express server entrypoint: `server/_core/index.ts`.
- Current global body parser posture before this PR: broad `express.json({ limit: "50mb" })` and `express.urlencoded({ limit: "50mb" })` at server boot.
- Upload-relevant boundaries inspected through storage/prescription references and existing upload guards.
- Webhook-relevant boundaries inspected for Razorpay payment and WhatsApp provider posture; this PR does not implement payment lifecycle webhook handling.
- Auth/session/cookie posture inspected through session cookie helpers and tRPC context authentication.
- Existing guard tests inspected: security env, OTP hardening, payment gateway posture, WhatsApp procedure guard, and redaction-related tests.

## Helmet behavior

Implemented in `server/middleware/httpSecurity.ts` through Helmet and wired by `applyHttpSecurity(app)` in the Express entrypoint.

Disabled Helmet sub-settings:

- `contentSecurityPolicy: false` — deferred because the current app serves Vite/dev assets and runtime-generated media/storage URLs. Enforcing a strict CSP without a complete asset-origin inventory could break development/runtime behavior.
- `crossOriginEmbedderPolicy: false` — deferred because COEP can break Vite HMR and cross-origin embedded assets. This should be revisited with an explicit static/media isolation plan.

Remaining action: add a production CSP once all asset, API, storage, and frame/connect origins are enumerated.

## CORS behavior

Implemented as an explicit allowlist middleware.

Configuration sources:

- `CORS_ALLOWED_ORIGINS` — comma-separated origins.
- `APP_ORIGIN` — customer app origin.
- `ADMIN_ORIGIN` — admin app origin.

Production behavior:

- Wildcard origin (`*`) is ignored.
- Unknown origins do not receive `Access-Control-Allow-Origin`.
- Preflight requests from unknown origins receive `403`.

Development behavior:

- Explicit local origins are allowed for Vite and local server ports.
- Local origins are not automatically added in production.

## Request ID behavior

Implemented as request boundary middleware.

- Accepts inbound `x-request-id` only if it is a safe ASCII token with no CR/LF injection risk.
- Generates a UUID when missing or unsafe.
- Attaches the ID to `req.requestId`, `res.locals.requestId`, structured logs, and the `x-request-id` response header.
- Does not derive IDs from user data, cookies, tokens, OTPs, or payment material.

## Logging and redaction behavior

Structured access logging records:

- method
- path
- status
- duration
- requestId
- userId if safely attached to the request
- storeId if safely attached to the request
- IP
- user-agent
- short redacted error summary

It must not log request bodies. Sensitive summaries are passed through the existing redactor before being emitted.

Do not log:

- OTP codes
- payment signatures/secrets
- auth cookies/tokens
- raw prescription images
- full medical payloads

## Body parser limits

Implemented parser posture:

- Normal JSON API: `1mb`.
- Normal URL-encoded API: `256kb`.
- Webhook raw body compatibility routes: `2mb`.
- Explicit upload JSON parser scaffold for `/api/storage` and `/api/uploads`: `12mb`.

The previous broad global `50mb` JSON/urlencoded parsers were removed from the server entrypoint.

Remaining action: move every future upload route to explicit multipart/object-storage flows with route-specific limits and malware/content-type validation. This PR does not change storage or prescription business logic.

## Webhook raw-body behavior

This PR does not implement or rewrite Razorpay/WhatsApp webhook lifecycle logic.

Compatibility posture added:

- `/api/webhooks/razorpay` gets `express.raw({ type: "application/json", limit: "2mb" })` before the normal JSON parser.
- `/api/webhooks/whatsapp` gets `express.raw({ type: "application/json", limit: "2mb" })` before the normal JSON parser.

This preserves a server structure where provider signature verification can consume exact raw bytes before JSON parsing. Payment and WhatsApp lifecycle behavior remains unchanged.

## Rate-limit behavior

Route-level rate-limit scaffolding is documented/exported for:

- OTP send/verify.
- Login/auth.
- Prescription upload.
- Checkout/cart mutation.
- Public product search.
- Provider webhooks.

Current status: scaffold/guard posture only. Existing OTP production env guard already requires `OTP_RATE_LIMIT_BACKEND` when the OTP provider is enabled. A shared production-grade backend should be wired before multi-instance production throttling is claimed.

Provider webhooks should rely first on signature verification and careful retry semantics; blunt IP-only blocking can incorrectly block legitimate provider retries.

## CSRF strategy

Cookie/session auth is used for app sessions.

| Area | Status | Notes |
| --- | --- | --- |
| Session cookie | Implemented | Existing cookie helper sets `httpOnly` and secure based on HTTPS/forwarded proto. Current `sameSite` is `none`, so cross-site cookie sending is possible when secure. |
| CORS allowlist | Implemented in this PR | Reduces browser cross-origin exposure but is not a CSRF token substitute. |
| CSRF tokens/double-submit | Deferred | Not added in this PR to avoid breaking API clients and tRPC flows without a full client update. |
| Production requirement | Required before production if cookie-authenticated state mutations are exposed cross-site | Add origin/referer validation and/or double-submit CSRF token for cookie-authenticated mutation routes. |

## Remaining risks

### P0

- None introduced by this PR.

### P1

- CSRF token/origin enforcement is still deferred for cookie-authenticated mutation routes.
- Production-grade distributed rate limiting is not implemented for all high-risk routes; only scaffold/guard posture exists.
- CSP remains deferred pending asset-origin inventory.

### P2

- Upload hardening still needs dedicated content-type scanning, malware scanning, and object-store metadata validation.
- Webhook endpoint lifecycle implementation remains separate from raw-body compatibility.
- Access logs currently include path but not normalized route names for all tRPC procedure calls.

## Validation results

Commands required for this branch:

- `pnpm install`
- `pnpm run check`
- `pnpm test -- --runInBand`
- `pnpm run build`
- `git diff --check`

Final command results are reported in the PR/final response.

## Files changed

- `server/_core/index.ts` — wires the HTTP security middleware into the Express server boundary and removes the broad global `50mb` parsers.
- `server/middleware/httpSecurity.ts` — adds Helmet, CORS allowlist, request IDs, structured access logs, scoped body parser limits, webhook raw parser compatibility, and rate-limit scaffolding.
- `server/http-security.guard.test.ts` — adds static/unit guards for middleware wiring and posture.
- `HTTP_SECURITY_STATUS.md` — documents the implementation, deferred items, risks, and validation plan.
- `package.json` / `pnpm-lock.yaml` — add Helmet dependency.

## Migrations

None.
