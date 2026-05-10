# PRODUCTION_EVIDENCE_REGISTER

Updated: 2026-05-10.

This register separates checked-in code proof, local proof, hosted CI proof, skipped tests, and production behavior that is still not proven. It is intentionally conservative: skipped tests, dry runs, mocks, and documentation do not count as production evidence.

## Evidence ledger

| Evidence area | Current status | Claimable now? | Evidence required to close |
| --- | --- | ---: | --- |
| Local MySQL DB concurrency proof | Prior local proof claimed in `CONCURRENCY_PROOF_STATUS.md`; not re-claimed unless `TEST_DATABASE_URL` is available and the command is rerun. | Partial | Local command log showing `pnpm run test:db:bootstrap` and `pnpm run test:db:concurrency` against a safe real MySQL test database. |
| Hosted GitHub Actions DB concurrency proof | Workflow wired and artifact capture added; hosted run not attached in repo. | No | Green GitHub Actions run ID, commit SHA, logs, and `db-concurrency-proof-*` artifact. |
| Skipped DB tests | Harness skips when `TEST_DATABASE_URL` is absent. | No | Skips must be recorded as non-proof; rerun with `TEST_DATABASE_URL` to claim DB proof. |
| Purchase double-submit | Covered by MySQL harness through `commitPurchaseInvoiceExactlyOnce`. | Local/prior only until hosted run observed | Hosted pass log for `server/mysql-concurrency.integration.test.ts`. |
| Sale confirmation double-submit | Covered by MySQL harness through `confirmSaleExactlyOnce`. | Local/prior only until hosted run observed | Hosted pass log for `server/mysql-concurrency.integration.test.ts`. |
| Provider webhook replay | Covered by uniqueness and webhook seam tests. | Local/prior only until hosted run observed | Hosted pass log plus artifact. |
| Refund replay / over-refund | Covered by provider refund uniqueness and settlement seam tests. | Local/prior only until hosted run observed | Hosted pass log plus artifact. |
| Reservation expiry/payment race | Covered by terminal reservation race test. | Local/prior only until hosted run observed | Hosted pass log plus artifact. |
| Invoice collision protection | Covered by concurrent invoice sequence reservation test. | Local/prior only until hosted run observed | Hosted pass log plus artifact. |
| No negative stock under contention | Covered by last-unit reservation and POS-vs-app contention tests. | Local/prior only until hosted run observed | Hosted pass log plus artifact. |
| Duplicate supplier invoice guard | Covered non-destructively by commit seam and MySQL harness; no hard unique constraint is claimed. | Guard only | Business-reviewed duplicate report and approved migration plan before hard uniqueness. |
| Provider credentials and sandbox verification | Not attached. | No | Provider matrix with environment, IDs, evidence, owner signoff. |
| Staging/prod deployment and rollback | Not attached. | No | Artifact ID, URL, health/readiness output, rollback proof. |
| Measured staging backup/restore | Not attached. | No | Backup ID, restore target, timings, verification queries, owner signoff. |
| Staff access, pharmacist SOP, legal/compliance, monitoring rota | Not attached. | No | Named records and signoffs outside code. |

## Evidence attachment rules

- A local terminal transcript proves only the local environment and commit it references.
- A hosted CI run proves only the branch, commit SHA, run attempt, and workflow file used by that run.
- A green non-DB unit test run does not prove DB-backed concurrency if the MySQL harness skipped.
- A skipped DB test must be labeled **skipped / non-proof**.
- A service seam guard can prove future behavior at that seam, but it does not clean existing dirty production data.
- Production readiness cannot be marked 9.5/10 until external operations evidence is attached in addition to software validation.

## Minimum release evidence bundle

For a controlled deployment readiness review, attach:

1. Full validation transcript for `pnpm run check`, `pnpm test`, `pnpm run build`, `node scripts/verify-migrations.mjs`, `node scripts/ci-governance-guards.mjs all`, and `git diff --check`.
2. Hosted DB concurrency proof run URL, run ID, branch, commit SHA, logs, and artifact.
3. Staging/prod deployment artifact ID and runtime health/readiness evidence.
4. Rollback rehearsal evidence.
5. Provider verification matrix.
6. Measured backup/restore drill report.
7. Named operational ownership, staff access, pharmacist SOP, legal/compliance review, and monitoring rota.
