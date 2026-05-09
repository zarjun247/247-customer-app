# OBSERVABILITY_IMPLEMENTATION_STATUS

## Audit metadata

| Item | Value |
| --- | --- |
| Branch | `feat/production-observability-healthchecks-redaction` |
| Latest main SHA inspected | `200fafcc20451cc43e8d6272588ec7e26e12d9c8` |
| GitHub main refresh | Attempted `git fetch origin main`; container could not authenticate to private GitHub remote, so this branch was rebuilt from the provided main-equivalent checkout at the SHA above. |
| Migrations added | No |
| Schema changed | No |
| Runtime business logic changed | No stock, reservation, payment, H1/Rx release, or provider mutation behavior changed. |

## Implemented

- Added `server/services/observability.ts` with request ID validation/generation, safe structured log serialization, recursive metadata redaction, string redaction, and safe error serialization.
- Added `server/middleware/requestLogger.ts` and wired it through the existing HTTP security middleware so requests receive `x-request-id` and access logs contain method, path, status, duration, request ID, and safe actor/store context only.
- Added `server/services/healthcheck.ts` with read-only liveness/readiness/detailed health helpers.
- Added `server/routers/healthRouter.ts` and wired health routes into `server/_core/index.ts`.
- Replaced the previous broad `/api/health` implementation that returned a simple `dbConnected` boolean with protected detailed health and separate public liveness/readiness endpoints.

## Health endpoints

| Endpoint | Public/protected | Behavior |
| --- | --- | --- |
| `GET /healthz` | Public | Minimal liveness only: `status` and `timestamp`. |
| `GET /api/healthz` | Public | Same minimal liveness for API-prefix load balancers. |
| `GET /readyz` | Public | Secret-free readiness summary containing only database and migration status values. Returns non-2xx when critical DB/migration readiness fails. |
| `GET /api/readyz` | Public | Same readiness shape for API-prefix load balancers. |
| `GET /api/health` | Staff/admin protected | Detailed component health. In production, unauthenticated/unauthorized access fails closed with 404. |
| `GET /api/admin/health` | Staff/admin protected | Same detailed component health for admin path conventions. In production, unauthenticated/unauthorized access fails closed with 404. |

## Redaction behavior

Redaction omits or replaces:

- Authorization headers and bearer tokens.
- Cookies and session/JWT tokens.
- OTP/code fields.
- Passwords, API keys, client secrets, private keys, provider tokens, and generic secrets.
- Razorpay/payment signatures and secrets.
- WhatsApp tokens/secrets.
- AWS access keys/secrets.
- `DATABASE_URL`/DB URL-like strings.
- Prescription image/base64/blob/buffer/raw upload payloads.
- Medical notes, diagnosis-like fields, phone, email, address, and other PHI/customer-contact fields where they appear in metadata.

Request logging never serializes full request bodies and does not log raw prescription, webhook, payment, OTP, cookie, token, or uploaded-file payloads.

## Healthcheck component coverage

- **App/process:** uptime, environment, package version, optional build SHA when provided by environment.
- **Database:** read-only `select 1`, latency, and safe unhealthy result on failure. No DB URL is exposed.
- **Migrations:** read-only filesystem scan of `drizzle/` for duplicate four-digit SQL prefixes and latest known prefix.
- **Providers:** Razorpay/payment, WhatsApp, SMS, OTP, OCR, printer, storage/S3, Tally/ERP export, and maps/geocoding report `disabled`, `not_configured`, or `configured`; configured is intentionally not reported as healthy.
- **Worker queue:** read-only queue stats via existing queue stats helper; counts only, no job payloads and no processing/retry.
- **Stock/reservation sanity:** read-only counts for negative stock and expired active reservations when DB is safely queryable; otherwise `unknown`.

## Still not implemented / not claimed

- External monitoring dashboards, uptime probes, Sentry/PagerDuty/Opsgenie alerts, and escalation policies are not implemented in this PR.
- Provider live health is not proven because healthchecks intentionally do not make paid/mutating external calls.
- DB migration application proof is not claimed unless `TEST_DATABASE_URL` smoke tests are run in the target environment.

## Tests added

- `server/observability.test.ts`
- `server/healthcheck.test.ts`
- `server/health-router.test.ts`

## Validation results

Validation was run from this branch. Full-suite validation status is recorded in the final PR body and final handoff response. DB smoke proof is recorded separately because it depends on `TEST_DATABASE_URL`.

### Validation evidence from this branch

- `pnpm install` passed; pnpm reported ignored dependency build scripts for `@tailwindcss/oxide` and `esbuild`.
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed: 87 test files passed, 2 skipped; 508 tests passed, 12 skipped. MySQL integration tests were skipped because `TEST_DATABASE_URL` is not set.
- `pnpm run build` passed with existing Vite warnings for undefined analytics placeholders and large chunks.
- `node scripts/verify-migrations.mjs` passed: 49 files, 46 numbered migrations, latest `0048`, 0 blocking issues, 0 warnings.
- `node scripts/ci-governance-guards.mjs all` passed with no blocked patterns.
- `git diff --check` passed.
- `pnpm run test:db:smoke` skipped the MySQL lifecycle test because `TEST_DATABASE_URL` is not set; DB-backed proof is not claimed.
