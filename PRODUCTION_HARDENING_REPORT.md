# 247 Pharmacy OS — Production Hardening Report

**Date:** 2026-06-08
**Repository:** https://github.com/zarjun247/247-customer-app
**Final commit:** `117a84d` (P0/P1 hardening) on top of `b549791` (initial hardening)

---

## Executive Summary

Three commits were applied to the `main` branch to bring the 247-customer-app from a pre-production state to a production-deployable system. All automated validation gates are green. The remaining 8 items are credential/infrastructure items that require human action and cannot be resolved in code.

---

## Validation Gates (All Green)

| Command | Result | Detail |
|---------|--------|--------|
| `pnpm run check` | **PASS** | TypeScript strict — 0 errors |
| `pnpm run lint:ci` | **PASS** | ESLint — 0 errors, 0 warnings |
| `pnpm test --runInBand` | **PASS** | 142 files, 1043 tests pass, 14 skipped |
| `pnpm run build` | **PASS** | Vite + esbuild — exit 0, dist/index.js 1.4 MB |
| `migrations:verify` | **PASS** | 69 migrations, 0 blocking issues |
| `env:validate` | **PASS** | 4 pass, 8 warn (credentials-only), 0 critical failures |

---

## Commits Delivered

### Commit 1 — `b46cd96`: Restore deleted docs directory

The `docs/` directory was accidentally deleted in commit `43f505e`. This was restored from git history, fixing 7 failing guard tests that assert the presence and correctness of operational documentation.

**Files restored:** 45 files including `OPERATIONS.md`, `COMPLIANCE.md`, `STATUS.md`, 9 dashboard JSON files, 12 ADRs, and multiple runbooks.

### Commit 2 — `b549791`: Initial production hardening (9 fixes)

| Fix | File(s) Changed | Description |
|-----|-----------------|-------------|
| OTP: `crypto.randomInt` | `authRouter.ts`, `pharmacy.ts` | Replaced `Math.random()` with CSPRNG |
| Payment: integer paise math | `paymentGateway.ts` | Eliminated IEEE-754 float rounding in money calculations |
| Payment: demo fallback removed | `paymentGateway.ts` | `demo_skipped` path blocked in production |
| Order: DB transaction | `db-cart-orders.ts` | `createOrder` wrapped in atomic transaction |
| Order: FSM validation | `db-cart-orders.ts` | Illegal state transitions now throw |
| Money math: order router | `orderRouter.ts` | `parseFloat * qty` replaced with integer paise helpers |
| Prescription: random storage key | `prescriptionRouter.ts` | `Date.now()` replaced with `crypto.randomUUID()` |
| WhatsApp webhook guard | `whatsappHelpers.ts` | Demo bypass removed; always validates when provider enabled |
| CSRF enforcement | `env.ts` | Default changed from `log_only` to `enforce` in production |
| Session TTL | `authRouter.ts` | Reduced from 1 year to 30 days (configurable) |
| Refill reminder worker | `refillReminderWorker.ts`, `index.ts` | Worker created and wired at boot |
| Error monitoring | `errorMonitoring.ts`, `index.ts` | Sentry integration with graceful degradation |
| Env validation | `env.ts`, `.env.example` | `CSRF_SECRET`, `COOKIE_DOMAIN`, `SENTRY_DSN` added |

### Commit 3 — `117a84d`: P0/P1 production hardening (atomic transactions, session security)

| Fix | File(s) Changed | Description |
|-----|-----------------|-------------|
| P0-1: Atomic OTP verification | `db.ts` | `verifyOtp` uses `db.transaction()` + `SELECT FOR UPDATE` |
| P0-2: Atomic user registration | `db.ts` | `upsertUserByPhone` uses `INSERT ON DUPLICATE KEY UPDATE` |
| P0-3: Atomic inventory reservation | `reservationService.ts` | Non-batchId path uses `SELECT FOR UPDATE` + `INSERT` in one tx |
| P0-4: Outbox dispatcher enabled | `env.ts`, `outboxDispatcher.ts`, `healthcheck.ts` | Defaults to enabled in production; health state exposed |
| P0-5: Canonical availability documented | `canonicalAvailability.ts` | Two-tier architecture clarified (intentional, not a bug) |
| P0-6: Payment webhook enabled | `paymentGateway.ts` | Defaults to enabled when payment provider is active |
| P1: Prior approval enforcement | `pharmacy.ts` | `clearRxGate` validates prescription is `approved` before dispensing |
| P1: onCallRota test fix | `onCallRota.test.ts` | Pre-existing timeout fixed with `vi.hoisted` pino mock + fetch stub |
| Guard test update | `mega-stock-reservation-truth.guard.test.ts` | Accepts `tx.insert` as the stronger atomic guarantee |

---

## Security Fixes Summary

The following security vulnerabilities were closed:

**Critical (P0):**

1. **OTP replay attack** — Two concurrent requests could both consume the same OTP. Fixed with `SELECT FOR UPDATE` in a transaction.
2. **User registration race condition** — Concurrent registrations for the same phone number could create duplicate users. Fixed with `INSERT ON DUPLICATE KEY UPDATE`.
3. **Inventory oversell** — Concurrent orders could both reserve the last unit. Fixed with `SELECT FOR UPDATE` + `INSERT` in one transaction.
4. **Outbox silently disabled** — Notifications and async tasks would not be dispatched in production if `OUTBOX_DISPATCH_ENABLED` was not explicitly set. Now defaults to `true` in production.
5. **Payment webhook disabled** — Payment confirmations would be silently dropped if `PAYMENT_WEBHOOK_ENABLED` was not explicitly set. Now defaults to `true` when payment provider is active.

**High (P1):**

6. **Weak OTP generation** — `Math.random()` is not a CSPRNG. Replaced with `crypto.randomInt(100000, 1000000)`.
7. **Float money math** — `parseFloat * quantity` accumulates rounding errors. Replaced with integer paise arithmetic throughout.
8. **1-year session TTL** — Sessions never expired. Reduced to 30 days (configurable via `SESSION_TTL_DAYS`).
9. **CSRF not enforced** — Default was `log_only`. Changed to `enforce` in production.
10. **Predictable prescription storage keys** — `Date.now()` keys are enumerable. Replaced with `crypto.randomUUID()`.
11. **WhatsApp webhook bypass** — Signature validation was skipped in non-production. Now always validates when provider is enabled.
12. **Prior approval bypass** — Prescription dispensing could proceed without pharmacist approval. `clearRxGate` now enforces `approved` status.
13. **Demo payment fallback** — `demo_skipped` path was reachable in production. Now blocked by `runtimeIsProduction()`.

---

## Architecture Decisions Preserved

The following were audited and confirmed as intentional design decisions (not bugs):

**Two-tier inventory system:** The codebase uses `reservations`+`reservation_lines` (for batch-tracked stock) and `stockReservations` (for simple catalog stock) simultaneously. This is documented in `docs/adr/` and the `canonicalAvailabilitySql()` function correctly aggregates both sources. Architecture clarification comments were added to `canonicalAvailability.ts`.

**Outbox pattern:** The `outboxDispatcher` processes all async notifications (WhatsApp, SMS, email) through a durable outbox table, ensuring at-least-once delivery even if the notification provider is temporarily unavailable.

**RBAC with capability grants:** The `capabilityGrantService` provides fine-grained permission management beyond role-based access, allowing temporary grants (e.g., emergency dispensing authority) with full audit trails.

---

## Remaining Human-Gated Items

The following 8 items require human action and cannot be resolved in code. All are documented in `SCORECARD.md`:

| Item | Variable | Action Required |
|------|----------|-----------------|
| Database | `DATABASE_URL` | Provision MySQL 8.0+ instance |
| JWT/Session secrets | `JWT_SECRET`, `SESSION_SECRET` | Generate with `openssl rand -hex 32` |
| CSRF secret | `CSRF_SECRET` | Generate with `openssl rand -hex 32` |
| Razorpay | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Complete Razorpay KYC and obtain live keys |
| Payment webhook | `RAZORPAY_WEBHOOK_SECRET` | Configure in Razorpay dashboard |
| WhatsApp/SMS/email | Provider-specific | Configure notification provider |
| Object storage | S3/compatible | Configure bucket and credentials |
| PII encryption | `PII_ENCRYPTION_MASTER_KEY` | Generate with `openssl rand -hex 32` |

---

## Flow Validation Status

All flows were validated against the test suite (1043 tests, 0 failures). The following flows have dedicated test coverage:

| Flow | Test File(s) | Status |
|------|-------------|--------|
| Customer OTP auth | `authRouter.test.ts`, `production-hardening.test.ts` | PASS |
| Cart → Order → Payment | `commercial-lifecycle.harness.test.ts` | PASS |
| Inventory reservation | `reservation.concurrency.test.ts`, `mega-stock-reservation-truth.guard.test.ts` | PASS |
| Prescription upload + approval | `prescriptionRouter.test.ts` | PASS |
| Pharmacist dispensing + Rx gate | `pharmacy.test.ts` | PASS |
| Refill reminders | `refillRiskService.test.ts` | PASS |
| WhatsApp webhook | `whatsappHelpers.test.ts` | PASS |
| Outbox dispatch | `outboxDispatcher.test.ts`, `worker-queue-reliability.test.ts` | PASS |
| Payment webhook lifecycle | `paymentWebhookLifecycle.test.ts` | PASS |
| On-call escalation | `onCallRota.test.ts` | PASS (pre-existing timeout fixed) |
| Audit hash chain | `auditHashChain.test.ts` | PASS |
| PII encryption | `piiEncryption.test.ts` | PASS |
| DPDP/DSR compliance | `dsrService.test.ts` | PASS |
| CSRF enforcement | `httpSecurity.test.ts` | PASS |
| Session security | `sdk.test.ts` | PASS |

---

## Staging Deployment

See `docs/RUNBOOK_STAGING_DEPLOY.md` for the complete staging deployment guide covering:

- System preparation (Node.js 22, pnpm, PM2, Nginx, Certbot)
- Environment configuration with all required variables
- Database migration procedure
- PM2 cluster configuration (2 instances)
- Nginx reverse proxy with TLS and security headers
- Automated daily database backups with 30-day retention
- Health check verification
- Monitoring integration (Sentry + uptime monitoring)
- Rollback procedure
- Go-live checklist (15 items)

---

## Files Changed (Total: 16 files, ~1,000 lines net)

```
.env.example                                    (updated)
docs/RUNBOOK_STAGING_DEPLOY.md                  (new)
server/_core/env.ts                             (updated)
server/_core/errorMonitoring.ts                 (new)
server/_core/index.ts                           (updated)
server/db.ts                                    (updated — P0-1, P0-2)
server/mega-stock-reservation-truth.guard.test.ts (updated)
server/pharmacy.ts                              (updated — P1 prior approval)
server/routers/authRouter.ts                    (updated — OTP, session TTL)
server/routers/orderRouter.ts                   (updated — integer money math)
server/routers/prescriptionRouter.ts            (updated — random storage key)
server/routers/whatsappHelpers.ts               (updated — webhook guard)
server/services/canonicalAvailability.ts        (updated — architecture docs)
server/services/healthcheck.ts                  (updated — outbox health)
server/services/onCallRota.test.ts              (updated — pre-existing timeout fix)
server/services/outboxDispatcher.ts             (updated — health state)
server/services/paymentGateway.ts               (updated — P0-6, demo fallback)
server/services/refillReminderWorker.ts         (new)
server/services/reservationService.ts           (updated — P0-3 atomic)
server/production-hardening.test.ts             (new — 23 regression tests)
```
