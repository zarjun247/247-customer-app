# OCR Purchase + Supplier Ledger + Accounting Status

## Canonical schema reused
- `ingestion_jobs`, `ocr_extracted_headers`, `ocr_extracted_lines`, `ocr_match_candidates`, `ocr_review_tasks`
- `purchase_invoices`, `purchase_lines`, `purchase_returns`, `purchase_return_lines`
- `suppliers`, `products`, `product_supplier_mappings`, `batches`, `batch_ledger`
- `supplier_payments` used for payable + payment foundation

## OCR provider
- Provider adapter is pluggable via `OCR_PROVIDER` env.
- Current fallback: mock parser / existing OCR ingestion router flow.

## Behavior implemented
- OCR stays assistive; stock commit blocked unless purchase invoice is already committed.
- Matching order: barcode -> SKU -> supplier SKU mapping -> name fallback -> draft required.
- Low confidence / ambiguous lines become draft candidates.
- Price-change detection flags on >=10% delta from historical average purchase rate.
- OCR reviewed draft can create draft invoice and later commit via existing purchase commit route.

## Supplier ledger/payables
- Purchase commit triggers idempotent `recordSupplierPayable` entry.
- Supplier payments recorded via ledger service.
- Outstanding computed as committed invoice totals minus non-credit payments.

## Accounting basics
- Lightweight accounting service added (purchase payable, supplier payment, sale payment, trial balance lite).
- Full accounting suite/year-end lock deferred.

## Tally export
- JSON + CSV foundation added for purchases/supplier-payments/sales summary.
- Direct Tally XML/ODBC deferred.

## Reports
- Supplier outstanding endpoint normalized to `{ rows, totals, csvData }`.

## Tests/guards
- `server/ocr-purchase.guard.test.ts`
- `server/supplier-ledger.guard.test.ts`

## Migrations
- No new migrations added.

## Validation
- Run: `pnpm run check`, `pnpm test -- --runInBand`, `pnpm run build`.

## Next recommended mega prompt
- Ops Bridge: Support + WhatsApp + Delivery + SLA + Shift Closing
