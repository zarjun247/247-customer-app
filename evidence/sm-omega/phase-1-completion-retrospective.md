# SM-Ω Phase 1 — Completion Retrospective

Written: 2026-05-14 (SM-Ω Phase 1 cleanup PR, branch `score-lift/sm-omega-phase-1-cleanup`).

This document is the consolidated per-task evidence record for SM-Ω Phase 1. Individual per-task evidence files (`1.1-...md` through `1.8-...md`) were specified but never created during the Phase 1 sprint. This retrospective serves as their replacement, with honest accounting of what shipped, what didn't, and why.

---

## 1. What shipped

### Task 1.3 — Coverage measurement infrastructure
**PR #183 / commit `f500c28`**

`@vitest/coverage-v8` installed. Real coverage floor measured 2026-05-14 and anchored as a regression gate in `vitest.config.ts`:

| Metric | Measured | Gate (1% below measured) |
|--------|----------|--------------------------|
| Statements | 37.25% | 36% |
| Branches | 69.45% | 68% |
| Functions | 46.94% | 45% |
| Lines | 37.25% | 36% |

Gate prevents future regressions without requiring further uplift before Phase 2. Gap-fill to meaningful thresholds (80%+) and Stryker mutation testing remain deferred (Phase 8 / Phase 9).

### Task 1.4 — PII backfill script
**PR #183 / commit `f500c28`**

`scripts/pii-backfill.ts` added. Handles `users` (phone, email) and `prescriptions` (patientPhone, pharmacistNote) in configurable batches. Requires `PII_ENCRYPTION_MASTER_KEY` set in env. Operator instruction: run `pnpm tsx scripts/pii-backfill.ts --apply` in a maintenance window. Dry-run mode available without `--apply`.

### Task 1.5 — PII encryption end-to-end (executed beyond spec)
**PR #183 / commit `f500c28`**

The Phase 1 spec asked for write-path encryption. The agent also wired the read paths and added the HMAC-SHA256 `phoneHash` lookup index — work that was not in the original task spec but was necessary for correctness.

Full scope delivered:
- `users.phone` and `users.email` encrypted on all write paths (`customerPiiService.ts`)
- `prescriptions.patientPhone` and `prescriptions.pharmacistNote` encrypted on all write paths (`prescriptionGovRouter.ts`, `prescriptionReviewRouter.ts`)
- All prescription read paths decrypt before returning (`pharmacy.ts`, `prescriptionGovRouter.ts`)
- `users.phoneHash` (HMAC-SHA256, deterministic) added for lookup-under-encryption — `getUserByPhone` in `db.ts` uses hash lookup so phone-based queries remain correct when encryption is active
- Column widths widened: `users.phone VARCHAR(500)` (migration `0075`), `prescriptions.patientPhone VARCHAR(500)` (migration `0076`) — AES-GCM ciphertext is ~3× wider than plaintext

### Bonus — File splits and helper extractions (Phase 2 work pulled forward)
**PR #181 / commit `1078b97` (hygiene PR)**

The hygiene PR that preceded Phase 1's merge included 16+ router splits and 8 service-helper extractions driven by the `max-lines: warn (600)` lint rule. This was unplanned Phase 2 work executed during Phase 1. It is good work but was not called out as unplanned in the PR description.

Key splits (all tRPC procedure paths unchanged — client callers unaffected):

| Original file | Extracted to |
|---|---|
| `server/routers/routers.ts` | `authRouter.ts`, `cartRouter.ts`, `orderRouter.ts`, `prescriptionRouter.ts`, `notificationRouter.ts` |
| `server/routers/deliveryRouter.ts` | `deliveryHelpers.ts`, `deliveryTaskRouter.ts`, `deliveryTaskPodRouter.ts` |
| `server/routers/salesRouter.ts` | `salesOpsExtension.ts`, `commercialTruthSeams.ts` |
| `server/routers/commandCenterOcrRouter.ts` | `commandCenterDashboardsRouter.ts` |
| `server/routers/ocrIngestionRouter.ts` | `ocrIngestionExtension.ts` |
| `server/services/accountingLedger.ts` | `accountingLedgerHelpers.ts` |
| `server/services/commercialLifecycle.ts` | `commercialLifecycleHelpers.ts` |
| `server/services/invoiceSnapshotService.ts` | `invoiceSnapshotHelpers.ts` |
| `server/db.ts` | `db-cart-orders.ts` |

---

## 2. What did not ship

### Task 1.1 — Emergency stop fail-closed
**Status: Design conflict resolved — ADR 0010 (cleanup PR, commit `d267a9f`)**

The task specified making `emergencyStopMiddleware` fail-closed when the DB is unreachable. ADR-0004 (merged in SM-B/SM-E) explicitly documents fail-open as intentional for the Phase 1 pilot, citing cascading-failure risk. The Phase 1 task spec was written without knowledge of ADR-0004.

The implementing agent was correct to not change the behavior; incorrect in not surfacing the conflict. ADR-0010 (`docs/adr/0010-emergency-stop-fail-open-affirmed.md`) resolves the conflict explicitly: fail-open is correct because every mutation requires the DB and cannot succeed during an outage anyway. The cache-expiry window is documented as a known limitation for Phase 2.

No code changes made to `emergencyStopMiddleware.ts` or `emergencyStopService.ts`.

### Task 1.2 — Dead-letter replay re-enqueue
**Status: Formally deferred — ADR 0011 (cleanup PR, commit `05cab21`)**

The task specified implementing actual replay (worker reads `rawPayload`, re-enqueues to original handler). Three unmet prerequisites make this Phase 2 work:

1. `startOutboxDispatcher()` not called at boot — no worker polls `nextRetryAt`
2. No per-provider handler registry for generic dispatch
3. `providerDeadLetters` has `rawPayloadHash` only (not `rawPayload`); payload is in the linked `providerWebhookEvents.payloadJson`

ADR-0011 (`docs/adr/0011-dead-letter-replay-deferred.md`) documents these blockers and the upgrade path. The `retry` mutation now carries a prominent comment block explaining its triage-signal semantics. Procedure rename (`retry → markForFollowup`) deferred to Phase 2.

### Task 1.6 — Capability grants ADR
**Status: Written — ADR 0012 (cleanup PR, commit `edb8656`)**

OPEN_BLOCKERS.md was updated during Phase 1 to say the empty `capability_grants` table is "by design" but no ADR was written. ADR-0012 (`docs/adr/0012-capability-grants-role-default-mode.md`) documents the `CAPABILITY_ROLE_DEFAULTS` fast-path in `capabilityGrantService.ts` (sealed), the lookup order in `hasCapability`, all 6 active `capabilityProcedure` usages, what explicit grants are for, and the upgrade triggers (multi-store scoping, RBAC tightening).

### Task 1.7 — Dead code purge
**Status: Completed in cleanup PR (commits `8d57720`, `49bd25f`, `2a27659`)**

Three groups deleted:

| Group | Files deleted | Commit |
|---|---|---|
| Build-tool residue | `client/public/__manus__/debug-collector.js` | `8d57720` |
| Dead migration scripts | `scripts/migrate-part10.mjs`, `migrate-part11.mjs`, `migrate-part12.mjs`, `migrate-v10.mjs` | `49bd25f` |
| Legacy SQL files | `drizzle/part10_whatsapp.sql`, `part11_routing_rider.sql`, `part12_system_events.sql` | `2a27659` |

The `part\d+_` compat shim in `apply-migrations.mjs` and `bootstrap-migrations-table.mjs` was also removed in `2a27659` — the shim's only purpose was to skip those three SQL files, which no longer exist.

Zero references to any deleted file found in `server/`, `client/`, `scripts/`, `.github/`, or `package.json`.

### Task 1.8 — `.env.example` fixes
**Status: Partially completed in cleanup PR (commit `fcfc538`)**

`DATABASE_URL` corrected from `postgres://user:password@localhost:5432/pharmacy_dev` to `mysql://user:password@localhost:3306/pharmacy_dev`.

OTEL + email vars were added by Phase 1 (confirmed present in `.env.example`). The DATABASE_URL correction was the remaining gap.

### Task 1.9 — Per-task evidence files
**Status: Consolidated here**

Files `evidence/sm-omega/1.1-emergency-stop.md` through `evidence/sm-omega/1.8-env-example.md` were specified but never created during Phase 1. This retrospective is the consolidated replacement. It covers every task ID with status, disposition, and commit/ADR reference.

---

## 3. Problems introduced by Phase 1 (since corrected)

| Problem | Introduced by | Corrected in | Commit |
|---|---|---|---|
| `.claude/settings.local.json` tracked | PR #183 | Untracked + gitignored | `4f9f38e` |
| `trivy-results.sarif` (790KB) tracked | PR #183 | Untracked + gitignored | `75eafb4` |
| `trivy-new/trivy-results.sarif` (78KB) tracked | PR #183 | Untracked + gitignored | `75eafb4` |
| `.nvmrc` set to node 24, all 8 CI workflows pin node 20 | PR #183 | `.nvmrc` reverted to 20 | `05d69de` |
| `lint-baseline-by-file.json` stale (claimed 4,248 warnings; actual is 0) | PR #183 | Regenerated to `{}` | `a55ef46` |
| `sbom.cyclonedx.json` has empty `components: []` | Prior to Phase 1 | Diagnosed; fix deferred to dedicated SBOM PR (OPEN_BLOCKERS.md updated) | `cb4aa1c` |

---

## 4. Numbers

### Code hygiene (Phase 1 + hygiene PR #181)

| Metric | Before | After |
|---|---|---|
| `as any` outside sealed files | 443 | 0 |
| `eslint-disable` in source | many | 0 |
| `@ts-ignore` in source | present | 0 |
| Lint warnings | 4,248 | 0 |
| Files >600 LOC (server/) | 31 | 12 |

### Test suite

| Metric | Value |
|---|---|
| Test files | 143 (141 passing, 2 skipped) |
| Individual tests | 1,034 (1,020 passing, 14 skipped) |
| Test count vs pre-Phase-1 | Unchanged (143) |

### Migrations

| Metric | Value |
|---|---|
| Migrations before Phase 1 | 73 (0000–0072) |
| Migrations added by Phase 1 | 2 (0075 users phone PII, 0076 prescriptions patientPhone PII) |
| Total after Phase 1 | 75 |

Note: migration numbering has gaps (0073, 0074 were not in this sprint).

### PII encryption

| Surface | Before Phase 1 | After Phase 1 |
|---|---|---|
| `users.phone` write paths | plaintext | AES-GCM encrypted |
| `users.email` write paths | plaintext | AES-GCM encrypted |
| `users.phoneHash` | absent | HMAC-SHA256, used for lookup |
| `prescriptions.patientPhone` write paths | plaintext | AES-GCM encrypted |
| `prescriptions.pharmacistNote` write paths | plaintext | AES-GCM encrypted |
| Prescription read paths | no decryption | full decryption on all read paths |
| Existing plaintext rows | — | pending backfill (`scripts/pii-backfill.ts`) |

---

## 5. Process lessons for Phase 2

### 1. Agents must escalate conflicts between prompt and merged ADRs — not silently skip

Tasks 1.1 and 1.2 were skipped without surfacing the conflict. The correct behavior: read the relevant ADR, state the conflict explicitly, propose a resolution path, and pause for human decision. Silence is not a valid response to a conflict between a task spec and authoritative design documentation.

### 2. Per-task evidence files are not optional

Eight tasks were specified; zero evidence files existed before the PR merged. Per-task evidence is part of the definition of done, not a post-hoc nicety. If a task is resolved by a design decision rather than code, the evidence file is the ADR reference. If a task is formally deferred, the evidence file is the blocker entry and deferral reasoning. "The PR merged" is not evidence.

### 3. Unplanned Phase 2 work must be called out explicitly in the PR description

The hygiene PR (#181) and Phase 1 PR (#183) together included 16+ router splits and 8 service-helper extractions that were Phase 2 scope. This is good work. But burying it in the diff without calling it out in the PR description means reviewers can't assess whether the Phase 2 work was done correctly, whether it introduced regressions in the Phase 2 scope boundaries, or whether it should have been its own PR.

Rule for Phase 2: if a task spawns work outside the stated scope, the PR description must have an explicit "bonus work" section listing it.

### 4. PRs touching >100 files need a structured commit history

PR #183 was a single squash commit touching 16 files across PII encryption, coverage measurement, migrations, and config changes. One commit per logical task would have made bisection, review, and the post-merge audit faster. For Phase 2 sprints: one commit per task, conventional-commit format, no squash at merge.

### 5. Config drift belongs in the same PR as the feature

`.nvmrc` set to node 24 in the same PR that pinned all CI workflows to node 20. These are in the same repo; the mismatch should have been caught before merge. Tooling versions (node, pnpm, docker base image) must be consistent across `.nvmrc`, `.github/workflows/`, `Dockerfile`, and any lockfile engine declarations — all in the same commit.
