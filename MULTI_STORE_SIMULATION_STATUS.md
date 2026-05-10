# MULTI_STORE_SIMULATION_STATUS

Updated: 2026-05-10.

## Purpose

This file defines a controlled two-store runtime evidence drill. It intentionally does **not** claim production throughput, live multi-store proof, multi-region resilience, or enterprise HA.

## Scenario: two-store controlled runtime

| Step | Store A expected outcome | Store B expected outcome | Evidence required |
| --- | --- | --- | --- |
| Seed/verify stores | Active store row exists; staff assigned to Store A. | Active store row exists; staff assigned to Store B. | Store IDs, staff role/store roster with secrets and PII redacted. |
| Simultaneous order activity | Store A order reserves only Store A batch/stock. | Store B order reserves only Store B batch/stock. | Reservation rows grouped by `storeId`; stock movement rows grouped by `storeId`. |
| Reconciliation separation | Store A stock audit shows only Store A batches/lines to Store A staff. | Store B stock audit shows only Store B batches/lines to Store B staff. | Audit list and audit line endpoint responses captured with redacted IDs. |
| Transfer A → B | Initiation allowed only by Store A staff/admin; source batch must belong to Store A. | Receive allowed only by Store B staff/admin. | Transfer row, consumed transfer reservation, paired stock movements, no negative source stock. |
| Partial transfer failure | Receive fails closed before destination stock is usable if reservation/source invariants are missing. | No phantom destination stock is accepted without source debit and movement pair. | Failed transaction output plus row counts before/after. |
| Provider failure isolation | Provider failure for Store A order must not appear as Store B operator action. | Store B operator must not replay Store A event. | Currently manual/join-backed only; first-class store-scoped provider evidence pending. |
| Dead-letter isolation | Store A dead-letter review is correlated to Store A order/payment only. | Store B dead-letter review is correlated to Store B order/payment only. | Unsupported/not-yet-proven as a direct table query because provider dead-letter tables do not yet carry a first-class storeId. |
| Degraded mode isolation | Store A freeze/backlog does not authorize Store B stock mutation bypasses. | Store B continues only if its own checks are healthy and global safety gates remain green. | Operator drill timestamps and freeze/unfreeze audit notes. |
| Worker queue visibility | Store A backlog is shown as Store A only if queue payload/name correlation is available. | Store B backlog is separated the same way. | Unsupported/not-yet-proven as schema-backed isolation until worker jobs carry/store-resolve `storeId`. |

## Pass criteria

- No order, reservation, batch, stock movement, stock audit, transfer, or runtime detail response crosses store scope for non-admin staff.
- Transfer receive creates no destination inventory unless the same transaction also debits source stock, consumes the transfer reservation, writes stock movement evidence, and marks the transfer received.
- Runtime/observability evidence remains redacted and does not include secrets, PHI, PII, raw provider payloads, addresses, or prescription contents.
- Unsupported provider dead-letter and worker queue store isolation remains explicitly marked unsupported/not-yet-proven until schema/runtime evidence exists.

## Known limits

- This is a controlled simulation contract. Real staging execution with logs/artifacts is still required.
- Provider dead-letter tables do not yet carry a first-class storeId.
- Worker queue tables do not yet carry a first-class storeId.
- No fake commercial success, production deployment proof, or impossible scale claim is made.
