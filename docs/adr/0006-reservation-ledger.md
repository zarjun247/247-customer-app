# ADR-0006: Dual reservation system — stockReservations table retained alongside reservation_ledger

## Status

Accepted (transitional) — documented in SM-LM Phase 4, 2026-05.

---

## Context

The original stock reservation mechanism used a `stockReservations` table (one row per reservation, updated in-place). This table has atomicity issues: concurrent updates to `available_quantity` can race.

An improved `reservation_ledger` approach was designed to provide an append-only ledger of reservation events with `SELECT ... FOR UPDATE SKIP LOCKED` for safe concurrent reads. The new design uses `reservations` + `reservation_lines` tables.

---

## Decision

**Do not drop `stockReservations` yet.** The table is actively written by `reservationService.ts` and read by `inventoryRouter.ts`, `healthcheck.ts`, and stock availability queries in `db.ts` / `db-extended.ts`. Dropping it without completing the write-path migration to `reservation_lines` would break the system.

The plan is:
1. Wire all write paths to `reservation_lines` (incremental — one write path at a time).
2. Run both tables in parallel with a reconciliation check.
3. Drop `stockReservations` once all write paths are migrated and reconciliation confirms parity.

This incremental migration is deferred to post-launch architecture cleanup.

---

## Consequences

### Positive

- No production risk from a premature table drop.
- The two-table state is explicitly documented and tracked in OPEN_BLOCKERS.md.

### Negative

- Two reservation systems coexist — operators and engineers must understand both.
- `stockReservations` retains its atomicity risk during the migration window.
- The `startReservationExpiryWorker()` is not started at boot (documented in OPEN_BLOCKERS.md) because it operates on `reservations` / `reservation_lines` while stock availability still reads `stockReservations`.
