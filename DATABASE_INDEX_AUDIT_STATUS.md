# Database Index Audit Status

Date: 2026-05-08  
Branch: `perf/database-index-audit`

## Scope and safety position

This PR is limited to database index/query-readiness work. It does **not** change production business logic, stock reservation behavior, payment/refund lifecycle behavior, invoice lifecycle behavior, commercial lifecycle behavior, routers, or services.

No live MySQL `EXPLAIN` or load benchmark was run in this branch. The changes are static schema/migration/readiness guards only; **EXPLAIN/benchmark proof remains P1** after the MySQL test lifecycle is available.

## Tables inspected

Schema and migrations were inspected for these high-volume tables and access paths:

- Catalog/search: `products`, `product_variants`, `store_skus`, `product_barcodes`, `barcode_aliases`.
- Inventory: `batches`, `batch_ledger`, `stock_movements`, `stock_reservations`, `stock_transfers`, `stock_audits`.
- Orders/sales/invoicing: `orders`, `order_items`, `sales`, `sale_lines`, `invoice_snapshots`, `sale_returns`, `credit_notes`, `invoice_sequences`.
- Payments/refunds: `counter_payments`, `refunds`, `supplier_payments`, `supplier_payment_allocations`.
- H1/compliance: `h1_register`, `prescriptions`, `prescription_lines`.
- Supplier/accounting: `suppliers`, `purchase_invoices`, `purchase_lines`, `purchase_returns`, `accounting_journal_batches`, `accounting_journal_entries`.
- Audit/events/reports: `audit_logs`, `system_events`, report/service query sites under `server/`.

## Existing indexes and constraints confirmed before adding indexes

The audit found these existing index/unique safeguards in the current schema/migrations:

- `users.openId` unique constraint.
- `barcode_aliases.barcode` unique constraint for direct barcode alias lookup.
- `refunds_provider_refund_id_uq` on `(provider, providerRefundId)`.
- `uq_supplier_alloc_payment_invoice_type` on `(supplierPaymentId, purchaseInvoiceId, allocationType)`.
- `uq_journal_batch_source` and `uq_journal_source_account_direction` for accounting journal idempotency.
- `uq_h1_register_sale_line_ref` on `(saleRef, saleLineRef)`.
- `uq_sales_bill_no` on `sales.bill_no`.
- `idx_invoice_snapshots_sale_id_status_hash` on `(sale_id, status, snapshot_hash)`.
- `uq_sale_returns_return_no` on `sale_returns.return_no`.
- `credit_notes_credit_note_no_unique` plus existing credit note indexes on sale/order/refund/original invoice/store status in `0036_credit_note_lifecycle.sql`.
- `uq_invoice_seq_store_fy_doc` on `(store_id, financial_year, document_type)`.
- `idempotency_keys_key_scope_uidx` on `(key, scope)`.
- `system_events` indexes for event type/time, store/time, and severity/time.

## Missing indexes added

Migration added: `drizzle/0044_index_performance_audit.sql`.

### Product/search and barcode

- `idx_products_canonical_name` on `products(canonicalName)`.
- `idx_products_company_name` on `products(companyName)`.
- `idx_products_hsn_code` on `products(hsnCode)`.
- `idx_products_schedule` on `products(schedule)`.
- `idx_products_barcode` on `products(barcode)`.
- `idx_product_barcodes_barcode` on `product_barcodes(barcode)`.
- `idx_product_barcodes_product` on `product_barcodes(productId)`.
- `idx_barcode_aliases_product_batch` on `barcode_aliases(productId, batchId)`.
- `idx_barcode_aliases_store_active` on `barcode_aliases(storeId, isActive)`.

### Inventory and stock availability

- `idx_store_skus_store_product` on `store_skus(storeId, productId)`.
- `idx_store_skus_store_active_stock` on `store_skus(storeId, isActive, stockQty)`.
- `idx_store_skus_product_variant` on `store_skus(productId, variantId)`.
- `idx_batches_store_product_expiry` on `batches(storeId, productId, expiryDate)`.
- `idx_batches_store_product_batch` on `batches(storeId, productId, batchNumber)`.
- `idx_batches_internal_barcode` on `batches(internalBarcode)`.
- `idx_batches_manufacturer_barcode` on `batches(manufacturerBarcode)`.
- `idx_batches_status_expiry` on `batches(status, expiryDate)`.
- `idx_batch_ledger_store_product_batch` on `batch_ledger(storeId, productId, batchNo)`.
- `idx_batch_ledger_store_product_expiry` on `batch_ledger(storeId, productId, expiryDate)`.
- `idx_batch_ledger_internal_barcode` on `batch_ledger(internalBarcode)`.
- `idx_batch_ledger_manufacturer_barcode` on `batch_ledger(manufacturerBarcode)`.
- `idx_batch_ledger_status_expiry` on `batch_ledger(status, expiryDate)`.
- `idx_batch_ledger_supplier_invoice` on `batch_ledger(supplierId, purchaseInvoiceId)`.
- `idx_stock_movements_store_batch_date` on `stock_movements(storeId, batchId, createdAt)`.
- `idx_stock_movements_batch_date` on `stock_movements(batchId, createdAt)`.
- `idx_stock_movements_type_date` on `stock_movements(movementType, createdAt)`.

### Reservations

- `idx_stock_reservations_store_status_expires` on `stock_reservations(storeId, status, expiresAt)`.
- `idx_stock_reservations_sku_status_expires` on `stock_reservations(skuId, status, expiresAt)`.
- `idx_stock_reservations_product_status` on `stock_reservations(productId, status)`.
- `idx_stock_reservations_order_status` on `stock_reservations(orderId, status)`.
- `idx_stock_reservations_cart_status` on `stock_reservations(cartId, status)`.

### Orders, sales, invoices, and credit notes

- `idx_orders_store_status_created`, `idx_orders_user_status_created`, `idx_orders_store_created`, `idx_orders_prescription`.
- `idx_order_items_order`, `idx_order_items_product`, `idx_order_items_sku`.
- `idx_sales_store_status_created`, `idx_sales_customer_status_created`, `idx_sales_sale_type_created`, `idx_sales_payment_ref`.
- `idx_sale_lines_sale`, `idx_sale_lines_product_batch`, `idx_sale_lines_hsn`.
- `idx_invoice_snapshots_bill_no`, `idx_invoice_snapshots_store_generated`, `idx_invoice_snapshots_customer_generated`, `idx_invoice_snapshots_order`.
- `idx_credit_notes_bill_no`, `idx_credit_notes_customer_created`, `idx_credit_notes_store_issued`.

### Payments/refunds

- `idx_counter_payments_sale_created`, `idx_counter_payments_status_created`, `idx_counter_payments_payment_ref`, `idx_counter_payments_gateway_ref`.
- `idx_refunds_order_status`, `idx_refunds_payment_status`, `idx_refunds_sale_status`, `idx_refunds_status_created`.

### H1/compliance

- `idx_h1_register_store_created`.
- `idx_h1_register_prescription_ref`.
- `idx_h1_register_bill_no`.
- `idx_h1_register_batch_no`.
- `idx_h1_register_patient_phone`.

### Supplier/accounting and audit logs

- `idx_suppliers_active_name`, `idx_suppliers_gstin`.
- `idx_purchase_invoices_supplier_status_due`, `idx_purchase_invoices_store_invoice_date`, `idx_purchase_invoices_invoice_no`.
- `idx_supplier_payments_supplier_date`, `idx_supplier_payments_purchase_invoice`, `idx_supplier_payments_voucher_no`.
- `idx_supplier_alloc_purchase_invoice`, `idx_supplier_alloc_payment`.
- `idx_audit_logs_actor_created`, `idx_audit_logs_entity_created`, `idx_audit_logs_action_created`.

## Intentionally deferred indexes and why

- Product full-text/name search on `products.name`, `genericName`, and `searchableTokens` is deferred. The current schema stores `searchableTokens` as `text`, and a safe full-text/ngram/prefix strategy requires real MySQL collation, query shape, and benchmark validation.
- Large free-text columns (`audit_logs.beforeJson`, `audit_logs.afterJson`, invoice JSON snapshots, raw OCR lines) are not indexed because they would be wide, expensive, and not aligned with obvious equality/range predicates.
- `stock_transfers` and `stock_audits` secondary indexes are deferred until production report filters are confirmed; current hotspot evidence was stronger for `batch_ledger`, `stock_movements`, and `stock_reservations`.
- Additional accounting journal report indexes are deferred because existing unique/source indexes exist, and financial reports need EXPLAIN evidence before adding wider composite indexes.
- Supplier due-date index is represented by invoice date/status in this schema because `purchase_invoices` does not currently expose a `dueDate` column.

## Query paths covered

- Product lookup by canonical key, manufacturer/company, HSN, schedule, and barcode.
- SKU and batch availability by store/product, store/active stock, batch barcode, batch expiry, and quarantine/expired status.
- Reservation release/expiry and active reservation lookup by store/status/expires, SKU/status/expires, product/status, order/status, and cart/status.
- Order queue lookup by store/status/date and user/status/date.
- Sales and invoice reporting by store/status/date, customer/status/date, bill number, source/sale type, invoice snapshot bill/store/customer/order, and credit note bill/customer/store/date.
- Payment/refund lookup by sale/date, status/date, gateway reference, provider payment ID, order/status, and provider refund uniqueness.
- H1 compliance lookup by store/date, bill number, prescription reference, batch number, and patient phone.
- Supplier outstanding/reconciliation by supplier/date, purchase invoice, voucher, supplier allocations, invoice number, and supplier active/name.
- Audit log lookup by actor/date, entity/date, store/date, and action/date.

## Validation results

Static validation added in `server/database-index-audit.guard.test.ts` checks:

- No duplicate migration number for `0044`.
- No duplicate index names in the new migration.
- Migration statements are additive `ALTER TABLE ... ADD INDEX` statements only.
- New migration index names are mirrored in `drizzle/schema.ts` metadata.
- Critical query families have indexes or documented deferrals.
- Docs explicitly state that EXPLAIN/benchmark proof remains P1.

## Remaining performance risks

- **P0:** None identified in static audit after adding obvious critical indexes; no live DB proof was available.
- **P1:** Run MySQL `EXPLAIN ANALYZE` and benchmark the 30-store dashboard/report/barcode/availability paths on realistic data before claiming proven latency.
- **P1:** Validate write amplification and migration runtime for the index build on production-sized `stock_movements`, `audit_logs`, `sales`, and `batch_ledger` tables.
- **P2:** Revisit full-text product search once real search query patterns and MySQL collation/tokenization strategy are finalized.
- **P2:** Add report-specific accounting journal and stock audit indexes only after report SQL shapes are stable.

## Files changed

- `drizzle/schema.ts`
- `drizzle/0044_index_performance_audit.sql`
- `server/database-index-audit.guard.test.ts`
- `scripts/database-query-hotspots.mjs`
- `DATABASE_INDEX_AUDIT_STATUS.md`
- `DATABASE_QUERY_PERFORMANCE_STATUS.md`
