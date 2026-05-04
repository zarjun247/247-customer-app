# INVOICE_STATUTORY_STATUS

## Scope audited
- `drizzle/schema.ts`: `sales`, `sale_lines`, `sale_returns`, `sale_return_lines`, `stores`, `products`, `counter_payments`.
- `server/routers/salesRouter.ts`, `server/routers/reportsRouter.ts`, `server/routers.ts`.
- Existing status docs and payment/reconciliation services.

## Implemented in this PR
- Added `server/services/invoiceNumbering.ts` with helpers:
  - `generateInvoiceNumber`, `assertInvoiceNumberUnique`, `getNextInvoiceSequence`, `formatInvoiceNumber`, `reserveInvoiceNumber`, `getInvoiceNumberForSale`, `generateCreditNoteNumber`, `generateReturnNoteNumber`.
- Added `server/services/invoiceService.ts` with helpers:
  - `buildInvoiceForSale`, `buildInvoiceLine`, `computeGstBreakup`, `computeInvoiceTotals`, `buildInsurerReadyInvoiceSummary`, `buildCreditNoteForReturn`, `buildInvoiceDocumentPayload`, `validateInvoiceCompleteness`, `getInvoiceBySale`, `getCustomerInvoiceSummary`.
- Integrated invoice number reservation in sale draft creation, and return-note numbering in returns.
- Added statutory guard tests for numbering, GST/HSN completeness, and credit-note over-refund protection.

## Behavior status
- Invoice numbering: store-wise prefix + FY + date + sequence; uniqueness guard across sales/returns; idempotent confirm remains based on existing confirmed-sale guard.
- Credit/return note: return notes now generated with dedicated `RTN` prefix; credit-note numbering helper added as foundation.
- GST computation: explicit taxable + CGST/SGST/IGST + total GST; rounding to 2 decimals.
- Completeness: missing store GSTIN/license and line HSN/GST are flagged; no fake placeholder values emitted.
- Reports: existing GST/daily/H1 endpoints already return normalized `{ rows, totals, csvData }` shapes (with legacy fields retained where present).
- Customer/insurer-ready: insurer-ready summary helper reports readiness only when completeness passes; direct insurer API submission remains deferred.

## Remaining gaps
- DB-level unique constraint/index for `sales.bill_no` and `sale_returns.return_no` still recommended.
- Store statutory fields (GSTIN/drug license) are not fully modeled on `stores`; completeness can flag missing but cannot auto-fill.
- Full statutory invoice persistence/read-model and PDF harmonization still partial.
- Credit-note persistence workflow is foundation-only; full lifecycle deferred.

## Validation
- `pnpm install`
- `pnpm run check`
- `pnpm test -- --runInBand`
- `pnpm run build`

## Next recommended prompt
`feat/accounting-supplier-tally-production`
