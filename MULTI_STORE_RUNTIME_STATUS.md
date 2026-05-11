# MULTI_STORE_RUNTIME_STATUS

Updated: 2026-05-10.

## Readiness summary

Current multi-store runtime readiness is **8.6 / 10** for controlled non-production/staging rehearsal and **not yet 9.5 / 10** for true multi-store live expansion. The score improved because transfer and runtime visibility store-scope gaps were hardened, but store-scoped provider/dead-letter and worker proof still require schema-backed evidence before a second live store.

## Implemented guarantees

| Area | Current guarantee | Evidence |
| --- | --- | --- |
| Store stock isolation | Batch, SKU, stock movement, stock reservation, stock audit, purchase, order, and sales models carry store identifiers. Negative stock aggregate checks are exposed through multi-store runtime overview. | `drizzle/schema.ts`, `server/services/deploymentRuntimeReadiness.ts`, `server/routers/inventoryRouter.ts` |
| Store runtime detail | Store staff can read only their assigned store. Admin/ops/super-admin roles can read cross-store operational detail. | `server/routers/multiStoreRuntimeRouter.ts`, `server/multi-store-runtime-isolation.guard.test.ts` |
| Transfer initiate | Source and destination stores must differ; source batch must belong to `fromStoreId`; product must match; destination store must exist; non-admin staff may initiate only from their own store. | `server/routers/inventoryRouter.ts` |
| Transfer receive | Non-admin staff may receive only into their assigned destination store; receive is executed inside a single DB transaction that consumes the transfer reservation, debits source on-hand, creates destination batch stock, writes both stock movements, and marks transfer received. | `server/routers/inventoryRouter.ts` |
| Reconciliation/stock audit visibility | Stock audit list defaults to caller store for non-admin staff when no `storeId` is supplied; audit lines verify audit store access before returning rows. | `server/routers/inventoryRouter.ts` |
| Runtime endpoint gating | Multi-store runtime endpoints are staff-gated and per-store detail additionally enforces store access. | `server/routers/multiStoreRuntimeRouter.ts` |
| PHI/PII safety | Multi-store runtime outputs expose aggregate operational metadata only; no names, phone numbers, prescription payloads, addresses, provider secrets, or raw PHI/PII. | `server/services/deploymentRuntimeReadiness.ts` |

## Assumed guarantees requiring runtime evidence

- Every launch staff account has a correct `staffStoreId` and no shared admin accounts.
- All production order ingestion paths populate `orders.storeId` before stock reservation or fulfillment.
- Reconciliation operators use stock audit and movement surfaces rather than ad-hoc SQL exports.
- Provider payloads can be correlated to store through order/payment joins during manual review until a first-class `storeId` is added to provider dead-letter tables.

## Simulated proof added

The controlled two-store drill is documented in `MULTI_STORE_SIMULATION_STATUS.md`. It is a scenario/evidence contract, not fake production scale proof.

## Observed proof available in repository

- Static and router-level guards cover store runtime detail isolation, transfer source/destination checks, transfer fail-closed language, default store filters for non-admin list paths, and documentation non-claims.
- Existing MySQL concurrency infrastructure covers stock reservation and commercial replay foundations, but the expanded multi-store transfer receive transaction still needs hosted/staging DB observation before closure.

## Unsupported/not-yet-proven behavior

- Provider dead-letter tables do not yet carry a first-class storeId, so dead-letter isolation is not runtime-proven as a direct store-scoped query.
- Worker queue rows do not yet carry a first-class storeId; queue separation is an expectation through queue naming/payload correlation, not a hard schema guarantee.
- Multi-store production traffic, multi-region failover, enterprise HA, and high-throughput scale claims are not asserted.
- Partial transfer failure has been hardened at receive time, but concurrent hosted DB proof for the new transfer receive transaction is still pending.

## Remaining blockers before marking 9.5/10 closed

1. Add first-class `storeId` to provider event/dead-letter and worker job operational tables, or produce a documented join-backed runtime report that proves equivalent isolation without PHI/PII exposure.
2. Run the two-store simulation against staging/prod-like data and archive counts for orphan orders, missing staff stores, negative stock, active transfer reservations, dead letters, and worker backlog by store.
3. Attach hosted CI/staging DB output proving transfer receive cannot create phantom inventory or negative source stock under contention.
4. Complete access roster review: named users, roles, store assignment, pharmacist privileges, and admin break-glass owners.
