# H1 Statutory Schema Status

## Schema fields added or confirmed

The H1 register keeps existing compatibility fields (`saleId`, `prescriptionLineId`, `prescriptionRef`, `billNo`) and adds nullable statutory/audit truth fields in `drizzle/0032_h1_statutory_schema.sql`:

- `storeRef` for string-safe store identity when sales carry UUID/string store references.
- `saleRef` for the immutable sale id/reference.
- `saleLineRef` for the immutable sale-line id/reference.
- `saleBillNo` for the final statutory bill number, while keeping `billNo` compatible.
- `productId` for the product reference used on the sale line.
- `batchLedgerId` and `batchId` for string-safe batch/ledger references where available.
- `doctorName` and `doctorRegNo`, while keeping `prescribingDoctor` compatible.
- `statutoryContextStatus`, currently written as `complete` only for final rows.

`storeId` is relaxed to nullable because the active sales schema stores `store_id` as a string. New H1 rows preserve `storeRef` and only populate legacy numeric `storeId` when the value is already a decimal legacy id.

## H1 creation behavior

`server/services/complianceGate.ts` now treats `saleRef`, `saleLineRef`, `productId`, `batchLedgerId`/`batchId`, `saleBillNo`, and doctor context as the statutory-grade context for H1 rows.

For final H1 creation during sale confirmation:

- The sale reference is preserved as `saleRef`.
- The line reference is preserved as `saleLineRef`.
- The final bill number is written to both `saleBillNo` and compatible `billNo`.
- The product reference is written to `productId`; `drugName` remains the product name.
- `batchNo`, `batchLedgerId`, and `batchId` are preserved when available from the sale line.
- `prescriptionRef` remains the compatible `sale:{saleRef}:line:{saleLineRef}` reference.
- Legacy numeric fields are populated only when the original value is already decimal; UUID/string refs are not coerced to fake numbers.
- Doctor name is required before a final `complete` H1 row is created. If a linked prescription has no doctor name, creation fails rather than silently inserting a meaningless null doctor.

The manual H1 governance route now requires `prescribingDoctor` and writes the new schema-safe fields when supplied.

## Duplicate prevention behavior

Duplicate prevention now looks for an existing row by `saleRef + saleLineRef` first, with a compatibility fallback to the historic `prescriptionRef + drugName` lookup. Existing rows are verified and patched with missing schema-safe references instead of duplicated.

The migration adds a unique index on `(saleRef, saleLineRef)` for new sale-line-backed rows.

## Audit behavior

H1 creation and verification audit payloads include string-safe `saleRef` and `saleLineRef`, plus `saleBillNo`, `productId`, `batchLedgerId`/`batchId`, doctor context, patient context, quantity, pharmacist, and prescription reference.

Audit `entityId` is only set when the sale reference is already a decimal legacy id. UUID/string references remain in the payload and are not coerced to `0`, `NaN`, or any fake numeric id.

## Migration and backfill notes

Migration `drizzle/0032_h1_statutory_schema.sql` is intentionally additive/non-destructive except for relaxing `storeId` nullability. Existing H1 rows are retained.

Feasible backfill included in the migration:

- Rows with historic `prescriptionRef` formatted as `sale:{saleId}:line:{saleLineRef}` backfill `saleRef` and `saleLineRef`.
- `saleBillNo` backfills from `billNo` where available.

Safe follow-up backfill plan for remaining legacy rows:

1. Join H1 rows with sales/sale lines where a trustworthy external reference exists.
2. Populate `productId`, `batchLedgerId`, doctor context, and `storeRef` only when a deterministic match is available.
3. Leave unmatched rows untouched and flag for pharmacist/admin review rather than guessing statutory identity from `drugName` alone.

## Remaining statutory risks

- Historical rows that lack a parseable `prescriptionRef` cannot be fully backfilled without a manual review or a deterministic sale-line mapping.
- Sale confirmation for H1 products now blocks when the linked prescription does not have a doctor name. This is safer than writing incomplete statutory rows, but workflows must ensure doctor details are captured before final billing.
- Doctor registration number is preserved when available but is not hard-required yet because existing prescription data may not always include it.
- The current product lookup still depends on the legacy numeric `products.id` table. Non-decimal product references are blocked rather than coerced.

## Validation results

- `pnpm install` completed successfully.
- `pnpm run check` completed successfully.
- `pnpm test -- --runInBand` completed successfully.
- `pnpm run build` completed successfully.

## Files changed

- `drizzle/schema.ts`
- `drizzle/0032_h1_statutory_schema.sql`
- `server/services/complianceGate.ts`
- `server/h1-register-correctness.guard.test.ts`
- `server/routers/prescriptionGovRouter.ts`
- `server/routers/reportsRouter.ts`
- `H1_STATUTORY_SCHEMA_STATUS.md`
