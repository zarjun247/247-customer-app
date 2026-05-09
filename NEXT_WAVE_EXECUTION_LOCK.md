# Next Wave Execution Lock

Latest local main inspection SHA: `aef2de345c06fce30a298e4a0e195a9ae4039462` (`aef2de3`).

## Current locked state

- Migration surgery is P0.
- Schema-changing work is locked until migration surgery merges.
- Runtime branches touching reservation, payment, provider, offline, or legal operations are locked until latest main validation passes after migration surgery.
- Docs/governance-only work can continue in parallel.

## Allowed now

- Docs/control prompts.
- Stale PR triage.
- Branch protection docs.
- CODEOWNERS/review gate planning.
- Rebuild backlog maintenance.
- Manual closure instructions.

## Not allowed now

- New migrations.
- Schema changes.
- Reservation runtime rebuild.
- Provider runtime rebuild.
- Pharmacy legal operations rebuild.
- Offline queue rebuild.
- Payment/refund schema changes.
- Commercial ledger schema changes.

## Unlock condition

The next runtime/schema wave unlocks only after all of the following are true:

1. Migration surgery is merged.
2. Latest-main validation proof passes:
   - `pnpm install`
   - `pnpm run check`
   - `pnpm test -- --runInBand`
   - `pnpm run build`
   - `node scripts/verify-migrations.mjs`
   - `node scripts/ci-governance-guards.mjs all`
   - `git diff --check`
3. The next migration number is read from `MIGRATION_AUDIT_STATUS.md` after migration surgery, not guessed from stale PR branches.

If DB tests are skipped, the result must be marked as a P1 proof gap, not green race-mode proof.

## Current risk tiers

- P0: duplicate migration prefixes around `0045`/`0046` on latest main; migration surgery must land before schema-changing branches.
- P1: DB-backed race proof may remain incomplete without `TEST_DATABASE_URL`; skipped DB tests are proof gaps.
- P2: stale PR branches may contain useful concepts but are unsafe to merge directly because they can revert hardening work merged through PR #99.
