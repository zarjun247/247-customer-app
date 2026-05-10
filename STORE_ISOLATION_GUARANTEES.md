# STORE_ISOLATION_GUARANTEES

Updated: 2026-05-10.

## Hard guarantees currently implemented

1. **Store-scoped stock truth:** stock batches, SKUs, reservations, stock movements, stock audits, quarantine, expiry actions, purchases, orders, and sales include store identifiers.
2. **Store-scoped runtime detail:** per-store runtime detail requires the caller to be assigned to that store unless the caller is an admin/ops/super-admin role.
3. **Store-scoped transfer authority:** non-admin staff can initiate outbound transfer only from their own store and receive inbound transfer only into their own store.
4. **Transfer fail-closed receive:** receive now runs source debit, destination batch creation, transfer-reservation consumption, movement writing, and transfer state update in one DB transaction.
5. **Stock audit visibility:** non-admin stock audit lists default to the caller store when no store filter is supplied, and audit line reads verify the parent audit store before returning rows.
6. **No fake runtime proof:** runtime surfaces report aggregate metadata and explicit manual-required statuses where external proof is missing.

## Explicit non-guarantees

- Provider dead-letter isolation is not yet first-class store-scoped because provider dead-letter tables do not yet carry a first-class storeId.
- Worker queue isolation is not yet first-class store-scoped because worker job rows do not yet carry a first-class storeId.
- Store isolation depends on accurate staff access assignment; missing `staffStoreId` fails closed for store staff, but launch readiness still requires a named roster review.
- Admin/ops/super-admin cross-store visibility remains privileged operational access and must be controlled by SOP, device/session governance, and audit review.

## Evidence operators must collect before second-store launch

- Store A/B staff roster with role and store assignment.
- Store A/B stock reservation, movement, audit, order, and transfer row counts.
- Store A/B runtime detail endpoint output with PHI/PII redacted.
- Failed cross-store attempts by Store A staff against Store B runtime/audit/transfer surfaces.
- Transfer receive contention test output from staging/hosted DB.
- Provider dead-letter and worker queue store-correlation report, or schema migration adding first-class store scope.
