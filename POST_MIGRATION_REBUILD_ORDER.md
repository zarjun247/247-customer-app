# Post-Migration Rebuild Order

Latest local main inspection SHA: `aef2de345c06fce30a298e4a0e195a9ae4039462` (`aef2de3`).

All rebuilds must start from latest main after migration surgery, not from stale PR branches. If a rebuild needs a migration, the next migration number must come from `MIGRATION_AUDIT_STATUS.md` after migration surgery.

| Order | Work item | Branch name | Dependencies | Migration need | Conflict risk | Validation required | Safe-to-merge conditions |
|---:|---|---|---|---|---|---|---|
| 1 | Latest-main validation proof | `chore/post-migration-latest-main-validation` | Migration surgery merged | No | Low | `pnpm install`; `pnpm run check`; `pnpm test -- --runInBand`; `pnpm run build`; `node scripts/verify-migrations.mjs`; `node scripts/ci-governance-guards.mjs all`; `git diff --check` | All validation commands pass; DB skips, if any, are documented as P1 proof gaps. |
| 2 | Observability / healthchecks rebuild from #91 | `fix/rebuild-observability-healthchecks-from-latest-main` | Step 1 validation proof | No expected | Medium | Full app checks plus focused route/middleware tests if added | Reuses latest HTTP/security/provider/worker services; no duplicate middleware; redaction verified. |
| 3 | Consolidated MySQL concurrency harness from #89/#90 | `test/consolidated-mysql-concurrency-proof` | Step 1; can follow step 2 | No expected | Medium | Full app checks; harness dry-run; DB-backed run when `TEST_DATABASE_URL` is available | One consolidated harness only; duplicate scripts/names removed; DB skips documented as P1 proof gap. |
| 4 | Reservation lifecycle rebuild from #88 | `feat/rebuild-reservation-lifecycle-truth` | Steps 1-3; migration surgery; race harness available | Yes if schema changes are required; next number from `MIGRATION_AUDIT_STATUS.md` | High | Full app checks; migration verifier; reservation lifecycle tests; DB-backed race tests where possible | Canonical availability formula; idempotent release/consume/expire/fail transitions; no nullable-ID unsafe patterns; no stale migrations. |
| 5 | Provider runtime enforcement rebuild from #95 | `feat/rebuild-provider-runtime-enforcement` | Steps 1-4; worker queue reliability on latest main | Yes if persistence changes are required; next number from `MIGRATION_AUDIT_STATUS.md` | High | Full app checks; migration verifier; provider retry/dead-letter tests; worker tests | Reuses provider contract matrix and worker queue; retry classification and dead letters verified; no stale migration numbers. |
| 6 | Pharmacy legal operations rebuild from #94 | `feat/rebuild-pharmacy-legal-ops` | Steps 1-5; RBAC/session/security on latest main | Yes if legal-op proof tables are required; next number from `MIGRATION_AUDIT_STATUS.md` | High | Full app checks; migration verifier; regulated-release/recall/cold-chain/SOP/inspector tests | Regulated-release proof, recall, cold-chain, SOP acknowledgement, and inspector report pass with current RBAC/security gates. |
| 7 | Offline/degraded recovery rebuild from #96 | `feat/rebuild-offline-degraded-recovery` | Steps 1-6; provider runtime enforcement | Yes if offline queue persistence is required; next number from `MIGRATION_AUDIT_STATUS.md` | High | Full app checks; migration verifier; offline queue/idempotency/recovery tests | Offline mode cannot verify payments, mutate stock, or perform regulated release; recovery report and idempotency verified. |
| 8 | DB-backed concurrency execution with `TEST_DATABASE_URL` | `test/consolidated-mysql-concurrency-proof` or follow-up proof branch | Steps 3-7 depending on target coverage | No expected | Medium | Race harness against MySQL using `TEST_DATABASE_URL` | Real DB race proof passes or failures are filed as blocking gaps. |
| 9 | Atomic reservation locking if tests expose race gap | `feat/rebuild-reservation-lifecycle-truth` or focused follow-up | Step 8 exposes a concrete race gap | Yes if locking schema/index changes are required; next number from `MIGRATION_AUDIT_STATUS.md` | High | Full app checks; migration verifier; failing race reproduced then passing | Only implement if DB-backed tests prove the gap; locking behavior documented and race proof green. |
| 10 | Final latest-main audit checkpoint | `chore/post-migration-latest-main-validation` | Steps 1-9 merged or explicitly postponed | No | Low | Full validation proof suite plus current-main audit checklist | Latest main is green; postponed gaps are documented with owners and severity. |

## Required rebuild sequence

1. Latest-main validation proof.
2. Observability / healthchecks rebuild from #91.
3. Consolidated MySQL concurrency harness from #89/#90.
4. Reservation lifecycle rebuild from #88.
5. Provider runtime enforcement rebuild from #95.
6. Pharmacy legal operations rebuild from #94.
7. Offline/degraded recovery rebuild from #96.
8. DB-backed concurrency execution with `TEST_DATABASE_URL`.
9. Atomic reservation locking if tests expose a race gap.
10. Final latest-main audit checkpoint.
