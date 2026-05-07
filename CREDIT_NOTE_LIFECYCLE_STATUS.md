# Credit Note Lifecycle Status

## Current model inspected

- Counter invoice truth lives in `sales` and `sale_lines`. `sales.billNo` is the current invoice/bill number and `sales.total`, `sales.gstAmount`, and `sales.gstSummary` are the available sale-level invoice amounts.
- Sale return truth lives in `sale_returns` and `sale_return_lines`. The return flow records `returnNo`, original `saleId`, `refundMode`, optional `refundRef`, `totalRefund`, `gstReversal`, approval state, and line-level refund/GST reversal when the route receives line details.
- Current refund truth is still the pre-ledger payment record path. `payment_records.refundId` and `refundedAt` exist, while the dedicated refund ledger migration/branch is not present on current main and was intentionally not touched.
- Invoice document helpers can compute GST/taxable/gross summaries from sale lines, but immutable invoice snapshot work is not merged on current main and was intentionally not touched.
- Existing credit note support was only a foundation helper in `invoiceService.buildCreditNoteForReturn`; no persistent credit note table existed on current main before this change.

## Schema fields added

Migration `drizzle/0036_credit_note_lifecycle.sql` adds a backward-compatible `credit_notes` table with:

- `id`
- `credit_note_no` (unique)
- `original_invoice_no`
- `bill_no`
- nullable `sale_id`
- nullable `order_id`
- nullable `sale_return_id`
- nullable `refund_id`
- `store_id`
- nullable `customer_id`
- `amount_paise`
- `taxable_amount_paise`
- `gst_amount_paise`
- `reason`
- `status` enum: `draft`, `issued`, `cancelled`, `failed`
- nullable `issued_by`
- nullable `issued_at`
- nullable `line_splits_json`
- `created_at`
- `updated_at`

The Drizzle schema mirrors the same table and unique credit note number guard.

## Lifecycle behavior

- `createCreditNoteDraft` validates that a credit note points at a real original sale or order invoice source.
- Sales are accepted only when current-main status is `confirmed` or `returned`.
- Orders are accepted only when status is `delivered`, `returned`, or `closed`.
- If a sale return is supplied, it must exist and must belong to the original sale.
- Amount validation enforces: requested gross amount <= original invoice gross amount - already issued credit note gross amount.
- Multiple issued credit notes are accumulated before allowing another draft/issue.
- Drafts are persisted as `draft`; `issueCreditNote` re-validates invoice truth and remaining refundable capacity before marking the note `issued`.
- `cancelCreditNote` supports safe cancellation from `draft` or `issued`; cancelled notes are excluded from the issued-credit-note capacity calculation.
- `getCreditNotesForSale` and `getCreditNotesForOrder` provide read helpers for future route/UI wiring.

## GST split behavior

- The service requires paise values for taxable, GST, and gross amounts and rejects non-reconciling totals.
- Line-level splits can be stored in `line_splits_json` when sale return or caller data supplies exact line detail.
- `deriveCreditNoteSummaryFromReturn` preserves `sale_return_lines.refundAmount` and `gstReversal` into gross/taxable/GST paise line summaries.
- If exact line split is unavailable, the lifecycle stores only the safe summary values and does not fabricate line-level statutory detail.

## Refund ledger dependency

- `refund_id` is nullable by design so this branch stays compatible with current main and the in-flight refund ledger branch.
- The service allows a real current-main refund identifier when a caller already has one.
- The service rejects placeholder identifiers beginning with `refund-ledger-pending` to prevent fake ledger linkage.
- Once the refund ledger branch merges, a follow-up should replace nullable string-only linkage with validated ledger joins/foreign-key semantics if the merged schema supports that safely.

## Invoice numbering dependency

- `server/services/invoiceNumbering.ts` was inspected by usage only and was not modified.
- Current main exposes draft bill, invoice reservation, and return-note generation helpers, but not a dedicated safe credit-note sequence helper.
- To avoid conflicting with the invoice numbering race-safety branch, this work does not add or change numbering helper logic.
- Drafts can receive caller-supplied numbers or a visibly draft `CN-DRAFT-...` number; duplicates are blocked by service lookup and by the DB unique key.
- A production final-number route should be wired after the invoice race-safety branch provides/approves a credit-note sequence primitive.

## Migration/backfill notes

- Migration is additive and uses only reserved number `0036`.
- No existing rows are backfilled because current main has no credit note table.
- Historical returns can be backfilled later by joining `sale_returns` to `sales` and deriving `amount_paise`, `gst_amount_paise`, and `taxable_amount_paise` from return totals, but only when business approves historical credit note issuance status.

## Remaining risks

- P0: None identified in this branch; the change is additive and service-level only.
- P1: API/router wiring is intentionally not added until numbering and refund-ledger branches settle, so operators cannot yet issue credit notes through a route in this branch alone.
- P1: Final statutory credit-note numbering still depends on the invoice race-safety branch.
- P1: Strong refund ledger validation depends on the refund ledger branch.
- P2: Exact line-level GST split depends on caller/return-line completeness; summary-only storage remains the safe fallback.
- P2: Future immutable invoice snapshot integration should validate credit notes against snapshot totals once that branch is merged.

## Validation results

- `pnpm install` passed; pnpm reported ignored dependency build scripts for `@tailwindcss/oxide` and `esbuild` pending `pnpm approve-builds`.
- `pnpm run check` passed.
- `pnpm test -- --runInBand` passed: 55 files / 214 tests.
- `pnpm run build` passed with existing Vite warnings for missing analytics placeholders and large chunks.

## Files changed

- `drizzle/schema.ts`
- `drizzle/0036_credit_note_lifecycle.sql`
- `server/services/creditNoteService.ts`
- `server/credit-note-lifecycle.guard.test.ts`
- `CREDIT_NOTE_LIFECYCLE_STATUS.md`
