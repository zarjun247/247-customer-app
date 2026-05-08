# Database Query Performance Status

Date: 2026-05-08  
Target scale: 30 operating stores

## Current evidence level

This branch provides static query-readiness evidence only. It adds targeted schema metadata, a migration with additive secondary indexes, a static hotspot scanner, and guard tests. It does **not** claim measured performance improvement because no live MySQL benchmark or `EXPLAIN` plan evidence was available.

## Expected 30-store query hotspots

1. **Barcode lookup:** direct scans through `barcode_aliases`, `product_barcodes`, `products.barcode`, `batches.internalBarcode`, `batches.manufacturerBarcode`, `batch_ledger.internalBarcode`, and `batch_ledger.manufacturerBarcode`.
2. **Stock availability:** store/product SKU availability, FEFO batch selection by expiry, active/quarantined/expired batch status, and stock movement history.
3. **Reservation lifecycle reads:** active reservation lookup by store/SKU/product/order/cart/status and expiration sweeps.
4. **Order queues:** store/status/date queues for pharmacists, pickers, riders, and customer support; user/status/date history for customer views.
5. **Sales and invoice reads:** bill number lookup, store/date daily sales, customer invoice history, source-channel reporting, credit note lookup, invoice snapshot regeneration checks.
6. **Payment/refund reconciliation:** gateway reference lookup, provider payment/refund references, payment/refund status queues, sale/order associations.
7. **H1 compliance:** bill number, prescription reference, sale line reference, store/date, batch number, and patient/customer lookup.
8. **Supplier outstanding:** purchase invoices by supplier/status/date, payments by supplier/date, invoice allocation lookups, voucher lookup.
9. **Audit/event traceability:** actor/date, entity/date, and action/date audit log review.
10. **Dashboards/reports:** daily sales, GST summaries, stock reconciliation, supplier ageing/outstanding, SLA/delivery operational views.

## Dashboard/report query risk areas

- Daily sales and GST reports can become range-scan heavy if store/date predicates are omitted or if reports group large cross-store windows.
- Stock reconciliation can still be expensive when joining product catalog, SKU, batch ledger, and stock movement history over long windows.
- Supplier outstanding can become expensive if due-date semantics are derived in application code instead of persisted/indexed fields.
- Audit log reviews can grow quickly; even indexed actor/entity/action/date paths may need retention/partitioning later, while store-scoped event review uses `system_events` because `audit_logs` currently has no `storeId`.
- Product name search remains a risk because full-text/prefix indexing was intentionally deferred until query shape and MySQL collation are confirmed.
- Dashboard queries that order by dates without a selective store/status/customer predicate still need EXPLAIN review.

## Recommended future EXPLAIN plan checks

Run `EXPLAIN ANALYZE` or equivalent for these representative paths after MySQL test lifecycle support is available:

- Barcode lookup by exact barcode across `barcode_aliases`, `product_barcodes`, `products`, `batches`, and `batch_ledger`.
- Stock availability by `storeId + productId` and FEFO ordering by `expiryDate`.
- Active reservation lookup by `storeId/status/expiresAt`, `skuId/status/expiresAt`, and `orderId/status`.
- Store order queue by `storeId/status/createdAt`.
- Customer order history by `userId/status/createdAt`.
- Daily sales report by `store_id/status/created_at`.
- GST report joining `sales` and `sale_lines` by sale ID and HSN.
- Invoice lookup by `bill_no`, invoice snapshot `sale_id/status/hash`, and credit note number/bill number.
- Payment/refund lookup by gateway/provider references and status/date.
- H1 register lookup by `storeId/createdAt`, `billNo`, `prescriptionRef`, `batchNo`, and `patientPhone`.
- Supplier outstanding by supplier/status/invoice date and payment allocation by purchase invoice/payment.
- Audit log review by `entityType/entityId/createdAt`, `action/createdAt`, and `actorId/createdAt`; store-scoped event review by `system_events(storeId, occurredAt)`.

## Suggested benchmark dataset size

For 30-store readiness, use a benchmark dataset at least this large:

- Products: 75,000-150,000 rows, including common duplicate/normalized names.
- SKUs/batches: 450,000-900,000 store SKU and batch/batch-ledger rows across 30 stores.
- Stock movements: 5,000,000-15,000,000 rows with realistic daily sales, inwarding, returns, adjustments, and expiry events.
- Reservations: 1,000,000-3,000,000 historical rows with at least 50,000 active/recent rows.
- Orders/sales: 2,000,000-6,000,000 rows plus line items at 4-8 lines per order/sale.
- Payments/refunds: 2,000,000-6,000,000 payment rows and 100,000-500,000 refund rows.
- Audit logs: 10,000,000-30,000,000 rows across actor/entity/action paths plus store-scoped system events.
- H1 records: 250,000-1,000,000 rows with realistic prescription, bill, batch, and patient lookup distribution.
- Supplier/accounting: 300,000-1,000,000 purchase invoices/payments/allocations, including partially paid and aged invoices.

## Performance acceptance targets to validate later

These are proposed targets for benchmark acceptance, not proven outcomes from this branch:

- Barcode lookup latency: p95 under 75 ms for exact barcode lookup with warm indexes.
- Stock availability latency: p95 under 150 ms for `storeId + productId` availability and FEFO candidate selection.
- Active reservation lookup/release latency: p95 under 150 ms for SKU/product/store status lookups and expiration sweeps limited by time window.
- Store order queue latency: p95 under 250 ms for a single-store operational queue page.
- Invoice/bill lookup latency: p95 under 100 ms for exact bill/invoice/credit-note reference lookup.
- Dashboard report latency: p95 under 2 seconds for daily single-store views and under 5 seconds for 30-store daily summary views.
- Audit log lookup latency: p95 under 500 ms for indexed actor/entity/action/date filtered views.

## Static tools added

- `server/database-index-audit.guard.test.ts` validates migration/index/documentation consistency without a live DB.
- `scripts/database-query-hotspots.mjs` emits a JSON inventory of likely query hotspots by scanning server/script source for query clauses and report/dashboard keywords.

## Remaining risks by priority

- **P0:** None identified by static audit.
- **P1:** Run live MySQL `EXPLAIN ANALYZE` and benchmark tests before claiming proven performance.
- **P1:** Validate migration runtime/write amplification on production-sized tables.
- **P1:** Confirm product search strategy and add full-text/prefix search support only after query and collation evidence exists.
- **P2:** Consider partitioning/archival for audit logs and stock movements if retention growth exceeds index-only tuning.
- **P2:** Add report-specific materialized summaries only after dashboard/report query shapes stabilize.
