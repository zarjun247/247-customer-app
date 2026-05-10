# STOCK_INVARIANT_COMPLETION_STATUS

Updated: 2026-05-10.

## Current result

- Commercial purchase and sale stock changes route through the canonical commercial seams and `stockInvariant` stock movement helpers.
- Physical reservation accounting is now centralized in `reservationService`:
  - `reserveBatchAtomic` increments `batch_ledger.qtyReserved` only when `qtyOnHand - qtyReserved - qtyQuarantined - qtyExpired >= qty`.
  - `releaseReservationAtomic` terminally releases active reservation rows and decrements `qtyReserved` without allowing negative reserved stock.
  - `consumeReservationAtomic` terminally consumes active reservation rows and decrements both `qtyReserved` and `qtyOnHand` without allowing negative quantities.
- Reservation terminal changes are transactional and audited with stock movement rows plus reservation lifecycle events.
- Direct `qtyReserved` writes outside `stockInvariant`/`reservationService` are guarded by `scripts/ci-governance-guards.mjs` and static tests.

## Known exceptions

- Legacy `batches` mirror writes remain for compatibility and should be removed after all readers use `batch_ledger`.
- Test fixtures and in-memory commercial harnesses can mutate fixture objects; they are not runtime stock truth.

## Audit commands

```bash
rg -n "(?:db|tx)\.update\(batchLedger\)\.set\(\{[^}]*qtyReserved" server scripts -g '!server/services/reservationService.ts' -g '!server/services/stockInvariant.ts'
node scripts/ci-governance-guards.mjs all
```
