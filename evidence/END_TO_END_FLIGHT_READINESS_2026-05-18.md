# End-to-End Flight Readiness — 2026-05-18

**Branch:** `audit/e2e-flight-readiness-20260518`
**Session:** E2E product reality + live browser bug audit
**Engineer:** Claude Code (automated pass)

---

## Verdict: CONDITIONAL GO

The application boots, the login path is fully functional in dev, and product data is seeded. All CI gates pass. The blockers preventing an unconditional GO are documented below — they are all expected for a local dev environment without provider credentials, not code defects.

---

## Bug Fixes Applied This Session

### Bug B — Phone login returned HTML error (P0 — FIXED)

**Root cause:** `csrf-csrf` library reads `req.cookies['__Host-csrf']` at request time. `cookie-parser` (or any cookie-parsing middleware) was never registered in `applyHttpSecurity()`, leaving `req.cookies = undefined`. The library crashed with `TypeError: Cannot read properties of undefined (reading '__Host-csrf')`. Express converted the unhandled error into a `500 Internal Server Error` HTML response. The frontend tried to parse this as JSON → `Unexpected token '<'`.

**Fix:** Added an inline cookie-parsing middleware in `server/middleware/httpSecurity.ts` using the `cookie` package (already in dependencies) to populate `req.cookies` before the CSRF block runs. `cookie-parser` as a standalone Express middleware was not available in this environment.

**Evidence:**
```
# Before fix:
POST /api/trpc/auth.sendOtp → 500 HTML

# After fix:
POST /api/trpc/auth.sendOtp → {"result":{"data":{"json":{"success":true,"devCode":"583462"}}}}
POST /api/trpc/auth.verifyOtp → {"result":{"data":{"json":{"valid":true,"onboardingComplete":false,"assignedStoreId":null}}}}
```

**Files changed:** `server/middleware/httpSecurity.ts`

---

### Bug A — Logo image broken on splash/login screens (P1 — FIXED)

**Root cause:** `LOGO_URL = "/manus-storage/247-logo-transparent_ef3d59e3.png"` is a Forge CDN path. In local dev without the CDN mounted, the path 404s and the browser renders a broken image icon.

**Fix:**
1. Created `client/public/logo-placeholder.svg` — a minimal SVG with "24/7 PHARMACY" text, served as a local static asset at `/logo-placeholder.svg`.
2. Updated `client/src/const.ts`: `LOGO_URL` now prefers `VITE_LOGO_URL` env override, falls back to the CDN path; added `LOGO_FALLBACK_URL = "/logo-placeholder.svg"`.
3. Updated `client/src/pages/Login.tsx`: logo `<img>` uses `onError` to swap to `LOGO_FALLBACK_URL` on 404.

**In production:** CDN path loads correctly. `LOGO_FALLBACK_URL` is only triggered when the CDN image fails.

**Files changed:** `client/public/logo-placeholder.svg` (created), `client/src/const.ts`, `client/src/pages/Login.tsx`

---

### Bug C — Google/Apple OAuth buttons crashed on click (P1 — FIXED)

**Root cause:** `getManusSSOUrl()` called `new URL(undefined + '/app-auth')` when `VITE_OAUTH_PORTAL_URL` was not set, throwing a `TypeError`. This crashed the React event handler.

**Fix:**
1. `getManusSSOUrl()` now returns `null` when `VITE_OAUTH_PORTAL_URL` is not configured.
2. Added `isManusSSOConfigured()` helper.
3. Google button is now `disabled` when OAuth is not configured (`opacity-40`, `cursor-not-allowed` CSS) and shows an informational toast on click: "Google Sign-In is not configured in this environment."
4. Apple button already showed `toast.info("Apple Sign-In coming soon")` — no change needed.

**In production:** Set `VITE_OAUTH_PORTAL_URL` and `VITE_APP_ID` in the build environment. Both buttons become active.

**Files changed:** `client/src/const.ts`, `client/src/pages/Login.tsx`

---

## Seed Data — IMPLEMENTED

**Prior state:** `scripts/seed-realistic-data.mjs` only printed a plan. No DB inserts.

**Fix:** Implemented actual `mysql2/promise` inserts with `ON DUPLICATE KEY UPDATE` idempotency.

**Evidence (local dev DB after seed):**
```
stores: 5
suppliers: 10
users: 123 (50 customers + 20 staff + 53 pre-existing from testing)
products: 200
store_skus: 200 (one SKU per product per store)
batches: 200 (one batch per product, 2-year expiry, realistic qty)
```

**Usage:**
```bash
pnpm run seed:realistic       # requires DATABASE_URL
pnpm run seed:realistic --dry-run  # prints plan only
```

**Safety:** Refuses on `NODE_ENV=production` or `DATABASE_URL` containing "prod". Idempotent via `ON DUPLICATE KEY UPDATE`.

---

## Login Flow — End-to-End Verified

| Step | Endpoint | Result |
|------|----------|--------|
| 1. Request OTP | `POST /api/trpc/auth.sendOtp {"phone":"+91 9000000001"}` | `{"success":true,"devCode":"XXXXXX"}` |
| 2. Verify OTP | `POST /api/trpc/auth.verifyOtp {"phone":"...", "code":"XXXXXX"}` | `{"valid":true,"onboardingComplete":false}` |
| 3. Get profile | `GET /api/trpc/user.profile` (authenticated) | `{"id":..., "phone":"+91 9000000001", ...}` |
| 4. Get me | `GET /api/trpc/auth.me` (authenticated) | Same user object |
| 5. Catalog (pre-onboarding) | `GET /api/trpc/catalog.list` | `PRECONDITION_FAILED: ONBOARDING_REQUIRED` ← correct gate |

**Note:** `devCode` is returned in the response only when `NODE_ENV=development` (local dev). In production, OTP is dispatched via SMS/WhatsApp and is not returned in the response body.

---

## CI Gates — All Passing

| Gate | Command | Result |
|------|---------|--------|
| TypeScript | `pnpm run check` | ✅ 0 errors |
| Tests | `pnpm test` | ✅ 1020 passed, 14 skipped |
| Lint | `pnpm run lint:ci` | ✅ 0 errors, 0 warnings |
| Migrations | `pnpm run migrations:verify` | ✅ 0 issues |
| Docs structure | `node scripts/verify-docs-structure.mjs` | ✅ Pass |
| Governance guards | `node scripts/ci-governance-guards.mjs all` | ✅ No blocked patterns |
| Release gate | `node scripts/release-gate.mjs --mode test` | ✅ 0 blocking failures |
| Health (live) | `GET /healthz` | ✅ `{"status":"ok"}` |
| Readiness (live) | `GET /readyz` | ✅ All checks healthy/disabled-expected |

---

## Readyz Detail (live, 2026-05-18)

```json
{
  "status": "ready",
  "checks": {
    "database": "healthy",
    "migrations": "healthy",
    "storage": "disabled",
    "workers": "healthy",
    "emergency_stop": "healthy"
  },
  "workers": {
    "outboxDispatcher": true,
    "reservationExpiryWorker": true,
    "retentionWorker": false,
    "dsrSlaMonitor": false,
    "stockLockCleanup": true
  },
  "emergency_stop": { "active": false, "reason": null }
}
```

`retentionWorker: false` and `dsrSlaMonitor: false` are expected (`RETENTION_WORKER_ENABLED=false`, `DSR_SLA_MONITOR_ENABLED=false` in local `.env`).

---

## Known Gaps (Not Bugs — Environment Limitations)

| Item | Reason | Production fix |
|------|--------|----------------|
| Google/Apple login disabled | `VITE_OAUTH_PORTAL_URL` not set | Set OAuth env vars in build |
| Catalog requires onboarding | Expected — new user must complete onboarding first | UI guides user through onboarding |
| Payment flow unavailable | `PAYMENT_PROVIDER_ENABLED=false` | Set Razorpay credentials + enable |
| WhatsApp notifications off | `WHATSAPP_PROVIDER_ENABLED=false` | Set Meta/WhatsApp credentials + enable |
| OCR intake disabled | `OCR_PROVIDER_ENABLED=false` | Set OCR API key + enable |
| Storage upload disabled | `STORAGE_PROVIDER_ENABLED=false` | Set S3/storage credentials + enable |
| OTP via console (not SMS) | Dev-mode only — `devCode` in response | OTP provider sends SMS in production |

---

*Audit performed: 2026-05-18*
*Auditor: Claude Code automated pass*
*Branch: audit/e2e-flight-readiness-20260518*
