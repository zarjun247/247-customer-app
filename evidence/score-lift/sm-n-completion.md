# SM-N Final Closure — Evidence

**Date:** 2026-05-13  
**Branch:** score-lift/sm-n-final-closure  

---

## Step 1: CSRF client wired

- **Cookie name:** `__Host-csrf` (matches `server/services/csrfService.ts`)
- **Header name:** `x-csrf-token`
- **File:** `client/src/main.tsx`
- **Change:** Added `getCsrfToken()` helper that reads `__Host-csrf` from `document.cookie`; wired as `headers: () => ({ "x-csrf-token": getCsrfToken() })` on `httpBatchLink`
- **OPEN_BLOCKERS.md:** P0 CSRF client wiring entry moved to closed section

---

## Step 2: Emergency stop middleware applied to /api/trpc

- **File:** `server/_core/index.ts`
- **Import:** `createEmergencyStopMiddleware` from `./emergencyStopMiddleware`
- **Wiring:** `app.use("/api/trpc", (req, res, next) => { void emergencyStop(req, res, next); })` inserted before the tRPC `createExpressMiddleware` mount
- **Behavior:** Reads DB flag via `readFlag()` with 5 s TTL cache; returns 503 when active; fails open (calls next()) if DB is unreachable

---

## Step 3: Circuit breakers — provider calls

| Provider | Function | Timeout | File | Notes |
|----------|----------|---------|------|-------|
| SMS (MSG91) | `_smsFetch` | 8_000 ms | `server/connectors.ts` | Pre-existing ✅ |
| WhatsApp Cloud API | `_whatsappFetch` | 5_000 ms | `server/connectors.ts` | Was 8_000 ms — updated |
| Razorpay createOrder | `_razorpayCreate` | 10_000 ms | `server/connectors.ts` | New — uses `Promise.race` with `signal` since SDK has no AbortSignal support |
| Razorpay refund | `_razorpayRefund` | 10_000 ms | `server/connectors.ts` | New — same pattern |
| Storage presign (Forge) | `_storagePresign` | 10_000 ms | `server/storage.ts` | New — wraps presign and get-signed-url fetches |
| Storage upload (S3 PUT) | `_storageUpload` | 10_000 ms | `server/storage.ts` | New — wraps direct PUT to S3 URL |

---

## Step 4: SLO paths — before/after

All 9 critical paths were already wired in prior SMs; `SLO_COVERAGE.md` was stale.

| Path | Before (doc) | After (doc) | Actual code |
|------|-------------|-------------|-------------|
| sale.confirmSale | Planned | Yes — salesRouter.ts:740 | ✅ |
| purchase.commitPurchaseInvoice | Planned | Yes — purchaseRouter.ts:693 | ✅ |
| payment.captureWebhook | Planned | Yes — paymentWebhookRoutes.ts:53 | ✅ |
| prescription.upload | Not yet wired | Yes — routers.ts:962 | ✅ |
| ocr.process | Not yet wired | Yes — ingestion.ts:435 | ✅ |
| inventory.adjust | Not yet wired | Yes — inventoryRouter.ts:954 | ✅ |
| dsr.access | Not yet wired | Yes — dsrRouter.ts:18 | ✅ |
| dsr.erasure | Not yet wired | Yes — dsrRouter.ts:85 | ✅ |
| retention.tick | Not yet wired | Yes — retentionWorker.ts:81 | ✅ |

---

## Step 5: PII encryption wired on user write paths

- **File:** `server/db.ts`
- **Import added:** `encryptUserPii`, `encryptUserPhone` from `./services/customerPiiService`
- **Write paths wired:**
  - `upsertUser()` — encrypts `phone` and `email` via `encryptUserPii()` before insert/update
  - `upsertUserByPhone()` — encrypts `phone` via `encryptUserPhone()` before insert
  - `updateUserProfile()` — encrypts `phone` if present in the update payload
- **Passthrough mode:** When `PII_ENCRYPTION_MASTER_KEY` is not set, `encrypt()` returns plaintext (dev/test safe)
- **Backfill:** Existing rows remain plaintext; a backfill migration is a deferred ops item (tracked in OPEN_BLOCKERS.md)

---

## Step 6: LEGAL_REVIEW_PACK.md §11(5) ✅

- **Before:** `Section 11(5) | Right to nominate | Not yet implemented | ⚠️`
- **After:** Implementation details + `✅`
- **L-6 open item:** Closed: `Done — SM-LM Phase 11`
- **docs/COMPLIANCE.md:** Updated remaining DPDP gaps section

---

## Step 7: lint-baseline flipped to 0

- **lint-baseline.txt:** Changed from `4248` → `0`
- **scripts/lint-gate.mjs:** Hard-zero mode — non-test source files must have 0 errors; test files (`*.test.ts`) retain per-file ratchet from `lint-baseline-by-file.json`
- **Verified:** `node scripts/lint-gate.mjs` → `Lint gate OK: 0 total errors`

---

## Step 8: TSDoc added to key exported services

| File | Functions documented |
|------|---------------------|
| `server/services/commercialTruthSeams.ts` | `commitPurchaseInvoiceExactlyOnce`, `confirmSaleExactlyOnce`, `settleProviderRefundExactlyOnce` |
| `server/services/stockInvariant.ts` | `assertNoNegativeStock`, `getCurrentBatchQty` (sealed — docs only) |
| `server/services/dsrService.ts` | `createAccessRequest` |
| `server/services/emergencyStopService.ts` | `readFlag`, `setFlag` |
| `server/_core/circuitBreaker.ts` | Pre-existing TSDoc ✅ |
| `server/services/sloService.ts` | `emitSloEvent`, `recordLatencyForSlo` |
| `server/services/reservationExpiryWorker.ts` | `startReservationExpiryWorker`, `stopReservationExpiryWorker`, `sweepOnce` |
| `server/services/outboxDispatcher.ts` | `registerOutboxHandler`, `startOutboxDispatcher`, `stopOutboxDispatcher`, `pollOnce` |

---

## Verification results

| Check | Result |
|-------|--------|
| `pnpm run check` | ✅ 0 TS errors |
| `pnpm run lint` | ✅ 0 errors |
| `node scripts/lint-gate.mjs` | ✅ Lint gate OK: 0 total errors |
| `pnpm test` | ✅ 1020 passed, 14 skipped, 0 failed |
| `pnpm run build` | ✅ Built clean |
| `node scripts/verify-doc-claims.mjs` | ✅ 5/5 checks passed |
| `node scripts/verify-wiring.mjs` | ✅ 11/11 checks passed |
| `node scripts/slo-coverage-verify.mjs` | ✅ PASS (doc validation) |
| `cat lint-baseline.txt` | ✅ 0 |
| `§11(5) in LEGAL_REVIEW_PACK.md` | ✅ |
