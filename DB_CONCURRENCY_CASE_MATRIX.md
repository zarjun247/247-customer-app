# DB_CONCURRENCY_CASE_MATRIX

Case matrix for branch `test/real-mysql-db-proof-execution` on 2026-05-09.

`TEST_DATABASE_URL` was not present in this environment, so implemented DB-backed cases were skipped and must not be counted as production proof.

| Case | Test file | Covered? | Ran against real DB? | Result in this run | Notes | Next required work |
| --- | --- | --- | --- | --- | --- | --- |
| Migration smoke | `scripts/bootstrap-test-db.ts`; `server/mysql-db-lifecycle.integration.test.ts` | Yes | No | Blocked/skipped | Bootstrap refused to run without `TEST_DATABASE_URL`; smoke suite skipped one test. | Run against a safe disposable MySQL DB. |
| Fresh DB bootstrap | `scripts/bootstrap-test-db.ts` | Yes | No | Blocked | Safety gate requires `TEST_DATABASE_URL`; no DB mutation occurred. | Export safe `TEST_DATABASE_URL` and rerun. |
| Last-unit reservation race | `server/mysql-concurrency.integration.test.ts` | Yes | No | Skipped | Harness expects only one reservation/order to succeed with no oversell/negative stock/over-reservation. | Run three times against a safe disposable MySQL DB. |
| POS/app collision | `server/mysql-concurrency.integration.test.ts` | Yes | No | Skipped | Harness expects POS sale and app reservation not to both consume final stock. | Run three times against a safe disposable MySQL DB. |
| Purchase commit double-submit | `server/mysql-concurrency.integration.test.ts` | No | No | Missing / explicitly skipped | Harness states purchase commit lacks an exported DB-backed idempotent seam and `purchase_invoices` lacks an idempotency key/unique constraint assertion path. | Recommended prompt: `test/add-missing-db-concurrency-cases`. |
| Sale confirmation double-submit | `server/mysql-concurrency.integration.test.ts` | No | No | Missing / explicitly skipped | Harness states sale confirmation is router/session coupled and lacks a safe exported DB-backed idempotent confirmation seam. | Recommended prompt: `test/add-missing-db-concurrency-cases`. |
| Invoice number race | `server/mysql-concurrency.integration.test.ts` | Yes | No | Skipped | Harness uses `reserveInvoiceNumber` concurrently and expects unique invoice numbers plus one sequence row. | Run three times against a safe disposable MySQL DB. |
| Payment webhook replay | `server/mysql-concurrency.integration.test.ts` | Partial | No | Skipped / partial | Harness covers provider webhook event uniqueness; full payment state-transition replay remains explicitly unproven. | Add seeded payment/order graph and signed webhook lifecycle test. |
| Refund replay / over-refund prevention | `server/mysql-concurrency.integration.test.ts` | Partial | No | Skipped / partial | Harness covers duplicate provider refund id rejection; aggregate over-refund prevention remains explicitly unproven. | Add production refund-service DB test for refund cap/ledger consistency. |
| H1 duplicate prevention | `server/mysql-concurrency.integration.test.ts` | Yes | No | Skipped | Harness expects duplicate H1 sale-line registration to be rejected by the unique key. | Run three times against a safe disposable MySQL DB. |
| Reservation expiry during payment | `server/mysql-concurrency.integration.test.ts` | No | No | Missing / explicitly skipped | Harness states expiry/retry recovery lacks an exported deterministic service seam. | Recommended prompt: `test/add-missing-db-concurrency-cases`. |

## Current proof conclusion

DB race-mode proof is **not green**. The repository has useful smoke/concurrency harnesses, but this run produced no real DB execution because the required disposable `TEST_DATABASE_URL` was absent.
