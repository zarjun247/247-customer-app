# CURRENT_MAIN_TRUTH

Canonical production-readiness and merge-control entry as of 2026-05-10.

## Current pass summary

- Router parity for the commercial truth seams is implemented for purchase commit, sale confirmation, and provider refund settlement.
- Physical reservation accounting is implemented for reserve/release/consume with transaction-scoped `qtyReserved` and `qtyOnHand` safety checks.
- Direct runtime `qtyReserved` writes outside approved stock/reservation services are now governance-guarded.
- DB-backed race proof is **not claimed** because `TEST_DATABASE_URL` is not configured in this environment and `pnpm run test:db:concurrency` skipped the MySQL suite.

## Launch mode decision

| Launch mode | Current decision | Rationale |
| --- | --- | --- |
| Investor demo | Allowed with caveats | Supervised demo flows remain acceptable with controlled data and explicit DB-proof caveat. |
| Controlled internal pilot | Caution | Router parity and reservation accounting improved, but real DB concurrency proof must still run before high-risk operations. |
| Multi-store beta | Not yet | Requires green `TEST_DATABASE_URL` concurrency run, CI proof, provider retry/dead-letter proof, and operational runbooks. |
| Race-mode unsupervised production | Not allowed | Real DB race proof is absent in this checkout. |

## Current estimated scores

| Area | Estimated score | Meaning |
| --- | ---: | --- |
| Code maturity | 7.4 / 10 | Router parity and reservation accounting are materially improved. |
| Proof maturity | 5.2 / 10 | Static/unit validation improved; real DB proof is still missing locally. |
| Investor-demo readiness | 8.1 / 10 | Suitable for supervised demos with caveats. |
| Controlled-pilot readiness | 6.7 / 10 | Possible only with tight controls and manual fallback. |
| Multi-store beta readiness | 5.0 / 10 | Blocked by absent DB-backed proof and remaining P1 hardening. |
| Race-mode readiness | 4.2 / 10 | Not ready without green real MySQL concurrency proof. |

## Remaining blockers

See `OPEN_BLOCKERS.md` and `CONCURRENCY_PROOF_STATUS.md` for the canonical remaining blocker list and exact DB proof command.
