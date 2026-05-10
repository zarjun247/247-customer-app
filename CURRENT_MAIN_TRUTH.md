# CURRENT_MAIN_TRUTH

Canonical production-readiness and merge-control entry as of 2026-05-10.

## Current pass summary

- Real DB-backed MySQL concurrency proof is now **claimed locally** for this checkout.
- `pnpm run test:db:bootstrap` applied the full Drizzle migration set against `TEST_DATABASE_URL`.
- `pnpm run test:db:concurrency` executed `server/mysql-concurrency.integration.test.ts` and passed all 11 MySQL-backed race/replay cases.
- Migration metadata and statement splitting were fixed so the DB proof path can actually bootstrap through the post-`0021` migrations.
- Invoice collision handling, provider webhook replay idempotency, deterministic fixture isolation, and reservation terminal proof setup were fixed based on real MySQL failures.

## Launch mode decision

| Launch mode | Current decision | Rationale |
| --- | --- | --- |
| Investor demo | Allowed | Supervised demo flows are supported with the DB concurrency proof now locally green. |
| Controlled internal pilot | Caution | Core commercial race seams have real MySQL proof, but hosted CI parity and P1 operational hardening should still be completed. |
| Multi-store beta | Not yet | Requires observed GitHub Actions MySQL 8.4 proof, provider retry/dead-letter proof, accounting reversal proof, and operational runbooks. |
| Race-mode unsupervised production | Not allowed | Local DB proof is green, but production race-mode still needs hosted CI parity plus remaining P1/P2 operational controls. |

## Current estimated scores

| Area | Estimated score | Meaning |
| --- | ---: | --- |
| Code maturity | 7.7 / 10 | Router parity, reservation accounting, invoice collision handling, and webhook replay idempotency are materially improved. |
| Proof maturity | 7.2 / 10 | Real local MySQL proof is green; hosted MySQL 8.4 workflow observation remains a P1 parity item. |
| Investor-demo readiness | 8.4 / 10 | Suitable for supervised demos with fewer DB-proof caveats. |
| Controlled-pilot readiness | 7.3 / 10 | Closer to pilot readiness, pending hosted CI proof and operational fallback drills. |
| Multi-store beta readiness | 5.8 / 10 | Still blocked by provider retry/dead-letter, accounting reversal, and operational hardening. |
| Race-mode readiness | 5.7 / 10 | Improved after green local MySQL proof, but not production-ready without CI parity and remaining hardening. |

## Remaining blockers

See `OPEN_BLOCKERS.md` and `CONCURRENCY_PROOF_STATUS.md` for the canonical remaining blocker list and exact DB proof commands.
