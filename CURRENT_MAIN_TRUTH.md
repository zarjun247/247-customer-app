# CURRENT_MAIN_TRUTH

Canonical production-readiness and merge-control entry as of 2026-05-10.

## Current pass summary

- Governance audit execution has been restored through `scripts/repo-governance-audit.mjs`.
- CI DB concurrency evidence path has been restored through `.github/workflows/concurrency-proof.yml`.
- `pnpm run test:db:concurrency` exists and points to `server/mysql-concurrency.integration.test.ts`.
- `TEST_DATABASE_URL` requirements, local Docker MySQL command path, and CI proof path are documented in `VALIDATION_COMMANDS.md` and `CONCURRENCY_PROOF_STATUS.md`.
- DB-backed race proof is **not claimed locally** because this environment has no `TEST_DATABASE_URL` and no Docker runtime.

## Launch mode decision

| Launch mode | Current decision | Rationale |
| --- | --- | --- |
| Investor demo | Allowed with caveats | Supervised demo flows remain acceptable with controlled data and explicit DB-proof caveat. |
| Controlled internal pilot | Caution | Router parity and reservation accounting improved, but green MySQL concurrency proof is still required before high-risk operations. |
| Multi-store beta | Not yet | Requires observed green CI/local DB concurrency run, provider retry/dead-letter proof, and operational runbooks. |
| Race-mode unsupervised production | Not allowed | Real DB race proof is not yet observed green. |

## Current estimated scores

| Area | Estimated score | Meaning |
| --- | ---: | --- |
| Code maturity | 7.4 / 10 | Router parity and reservation accounting remain materially improved. |
| Proof maturity | 5.8 / 10 | CI/local DB proof path and governance audit are restored, but green DB execution is still pending. |
| Investor-demo readiness | 8.1 / 10 | Suitable for supervised demos with caveats. |
| Controlled-pilot readiness | 6.8 / 10 | Possible only with tight controls and manual fallback until DB proof is green. |
| Multi-store beta readiness | 5.2 / 10 | Blocked by absent observed DB-backed proof and remaining P1 hardening. |
| Race-mode readiness | 4.4 / 10 | Not ready without green real MySQL concurrency proof. |

## Remaining blockers

See `OPEN_BLOCKERS.md` and `CONCURRENCY_PROOF_STATUS.md` for the canonical remaining blocker list and exact DB proof commands.
