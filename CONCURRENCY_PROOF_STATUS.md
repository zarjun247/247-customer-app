# CONCURRENCY_PROOF_STATUS

Updated: 2026-05-10.

## Current status

- `pnpm run test:db:concurrency` was run in this checkout on 2026-05-10.
- `TEST_DATABASE_URL` is not set, so `server/mysql-concurrency.integration.test.ts` skipped all 11 MySQL-backed tests.
- Therefore DB-backed concurrency proof is **not claimed** by this pass.

## How to obtain real proof

Run against a real MySQL-compatible test database with the full schema migrated:

```bash
export TEST_DATABASE_URL='mysql://USER:PASSWORD@HOST:PORT/DB_NAME'
pnpm run test:db:concurrency
```

The proof can only be marked green when the command above runs the MySQL integration tests instead of skipping them and exits successfully.

## Runtime parity status

- Purchase commit router delegates to `commitPurchaseInvoiceExactlyOnce`.
- Sale confirmation router delegates to `confirmSaleExactlyOnce`.
- Refund success webhook settlement delegates to `settleProviderRefundExactlyOnce`.
- Payment capture webhooks continue to enter through `handleRazorpayWebhook`, the canonical raw provider webhook seam.

## Remaining unproven guarantees

- Real DB race proof for last-unit reservation, sale-vs-reservation, invoice number races, webhook replay, refund replay/over-refund, and reservation terminal races remains pending until `TEST_DATABASE_URL` is available.
- Supplier invoice duplicate uniqueness/backfill remains a P1 production-hardening item.
