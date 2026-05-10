# OPEN_BLOCKERS

Updated: 2026-05-10.

## P0

- Do not claim DB-backed concurrency proof unless `TEST_DATABASE_URL` is configured and `pnpm run test:db:concurrency` passes.
- Original purchase and sale routers still need parity refactor to call the new exported service seams directly.
- Reservation terminal status proof exists, but physical `qtyReserved` release/consume accounting remains incomplete.

## P1

- Add safe non-destructive supplier invoice duplicate enforcement/backfill plan before relying on supplier invoice uniqueness in production.
- Extend webhook/refund tests to cover real provider dead-letter retry paths.
- Add accounting journal reversal proof for refunds once journal batches are wired to refund settlement.
