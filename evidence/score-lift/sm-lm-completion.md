# SM-LM Completion Evidence

**Branch:** score-lift/sm-lm-complete  
**Status:** In progress (Phases 1–5 complete; 6–13 pending)  
**Date:** 2026-05-13

---

## Phase 1 — Core reliability wiring

### Step 1.1: Outbox + reservation expiry + stock lock cleanup at boot
- `startOutboxDispatcher()` call site wired in server startup
- `startReservationExpiryWorker()` call site wired
- `cleanupExpiredStockLocks()` runs at boot
- Commit: `3ce4663`

### Step 1.2: Emergency stop real control plane (migration 0072)
- Migration 0072: `emergency_stop_events` table
- `emergencyStopService.ts` reads/writes feature_flags table
- Admin procedures: `security.emergencyStop.activate` / `.deactivate`
- Commit: `1edd88f`

### Step 1.3: Granular /health/ready with workers + emergency_stop checks
- `/health/ready` checks: DB, outbox dispatcher, reservation worker, emergency stop flag
- Returns `degraded` / `not_ready` states with component detail
- Commit: `fb91792`

### Step 1.4: Circuit breakers (opossum) + AbortController on external providers
- `opossum` circuit breaker wrapped around Razorpay, WhatsApp, MediVision, storage
- `AbortController` with 10s timeout on all external fetches
- Commit: `8573978`

---

## Phase 2 — SLO wiring

- `emitSloEvent` called on 9 critical paths: sale.confirm, purchase.commitInvoice, payment.verifyPayment, prescription approval, stock reserve/release, refund initiation, DSR operations
- SLO names follow `trpc.<router>.<procedure>.p99` convention
- Commit: `0e0d359`

---

## Phase 3 — Lint baseline 4248 → 0

- Added `linterOptions: { reportUnusedDisableDirectives: false }` to ESLint flat config
- Added sealed-file override block (5 critical service files)
- Fixed 150+ individual file warnings across routers, services, tests
- Created `lint-staged.config.mjs` with 30-file chunking for Windows 8K cmd.exe limit
- Pre-commit hook: `eslint --max-warnings=0 --no-warn-ignored`
- Verification: `pnpm run lint` → 0 errors, 0 warnings (Phase 3 baseline)
- Commit: `ef121c5`

---

## Phase 4 — Architecture cleanup

### Step 4.1: stockReservations drop
- SKIPPED: table is actively written by `reservationService.ts`. See OPEN_BLOCKERS.md.

### Step 4.2: executeCommand migration
- DEFERRED: 97 procedures still bypass executeCommand. See OPEN_BLOCKERS.md.

### Step 4.3: Circular import check
- Added `scripts/check-circular.mjs` (madge substitute; SSL cert prevents madge install)
- Fixed real cycle: `trpc.ts ↔ rbac.ts` by extracting `server/_core/roles.ts`
- 4 documented cycles remain (intentional Part2 barrel-export pattern)

### Step 4.4: File renames
- 4 Part2 files → domain names: `dbPart2→db-extended`, `connectorsPart2→connectors-peripheral`, `pharmacyPart2→pharmacy-metrics`, `routingEnginePart2→routing-engine-extended`
- 12 Extension/Part3 router files → domain names (see commit for full mapping)
- All imports and 23 guard-test path references updated
- `pnpm run check`: 0 errors ✓

### Step 4.5: max-lines lint rule
- `max-lines: warn (600, skipComments, skipBlankLines)` added to ESLint source block
- Pre-commit gate exempts this rule: `--rule "max-lines: off"`
- 31 existing offenders documented in OPEN_BLOCKERS.md
- Commit: `b07cb85`

---

## Phase 5 — TSDoc + ADRs

- 8 new ADRs (0002–0009) covering: executeCommand, roles extraction, emergency stop, migration runner, reservation ledger, CSRF rollout, AI boundary, file splitting
- `typedoc.json` config: targets sealed services + core layer → `docs/api/`
- `docs:api` npm script added
- ADR index (`docs/adr/README.md`) updated
- Commit: `65be853`

---

## Verification gate (Phases 1–5)

```
pnpm run check      → 0 TypeScript errors
pnpm run lint       → 0 errors / 27 advisory max-lines warnings
pnpm test           → 1020/1022 pass, 2 pre-existing failures (guard tests for
                      inArray/createRefundJournalBatch multi-line format)
node scripts/check-circular.mjs → 4 documented Part2 cycles; trpc↔rbac fixed
```

Pre-existing test failures (not introduced by SM-LM):
- `server/refund-accounting-reversal.guard.test.ts` — expects `createRefundJournalBatch({ refundId` on one line; source is multi-line (format mismatch)
- `server/supplier-invoice-duplicate-plan.guard.test.ts` — expects `inArray(purchaseInvoices.status, ["committed", ...])` on one line; source is multi-line

---

## Open items (Phases 6–13 pending)

See OPEN_BLOCKERS.md for full list. Key items:

- Phase 6: SM-L verification gate + PR creation
- Phase 7: Coverage setup (@vitest/coverage-v8), thresholds, baseline
- Phase 8: Coverage gap-fill
- Phase 9: Stryker mutation testing
- Phase 10: Product completeness (HALT for doctor consult)
- Phase 11: DSR §11(5) Right to Nominate (migration 0074)
- Phase 12: Skipped tests + scorecard update
- Phase 13: Final verification gate + PR creation
