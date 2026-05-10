# ACCOUNTING_COMPLETION_PLAN

Updated: 2026-05-10.

## Current truth

- Existing balanced journal batches remain the canonical accounting ledger for new proof work.
- Successful provider refund settlement now posts a balanced `refund` journal batch through `postBalancedJournalBatch` and `createRefundJournalBatch`.
- Refund replay returns through the existing refund/idempotency guard before another journal batch is posted, and `accounting_journal_batches` keeps `sourceType + sourceRef` unique.
- Failed/refused refund webhooks continue to call `markRefundFailedRecord` and do not post reversal entries.

## Still required

- Observe CI MySQL 8.4 parity green before upgrading DB proof from local-claimed to CI-confirmed.
- Expand production accounting runbooks for operator repair of failed journal batch postings.
- Continue migrating legacy/orphan journal rows into balanced batches so reporting can fully ignore unbatched rows.
