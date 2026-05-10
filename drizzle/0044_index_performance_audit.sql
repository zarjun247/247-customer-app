-- 0044_index_performance_audit.sql
-- Static DB performance readiness pass for 30-store scale.
-- Adds secondary indexes only; no column, FK, data, or lifecycle behavior changes.

ALTER TABLE `products`
  ADD INDEX `idx_products_canonical_name` (`canonicalName`),
  ADD INDEX `idx_products_company_name` (`companyName`),
  ADD INDEX `idx_products_hsn_code` (`hsnCode`),
  ADD INDEX `idx_products_schedule` (`schedule`),
  ADD INDEX `idx_products_barcode` (`barcode`);--> statement-breakpoint
ALTER TABLE `store_skus`
  ADD INDEX `idx_store_skus_store_product` (`storeId`, `productId`),
  ADD INDEX `idx_store_skus_store_active_stock` (`storeId`, `isActive`, `stockQty`),
  ADD INDEX `idx_store_skus_product_variant` (`productId`, `variantId`);--> statement-breakpoint
ALTER TABLE `batches`
  ADD INDEX `idx_batches_store_product_expiry` (`storeId`, `productId`, `expiryDate`),
  ADD INDEX `idx_batches_store_product_batch` (`storeId`, `productId`, `batchNumber`),
  ADD INDEX `idx_batches_internal_barcode` (`internalBarcode`),
  ADD INDEX `idx_batches_manufacturer_barcode` (`manufacturerBarcode`),
  ADD INDEX `idx_batches_status_expiry` (`status`, `expiryDate`);--> statement-breakpoint
ALTER TABLE `orders`
  ADD INDEX `idx_orders_store_status_created` (`storeId`, `status`, `createdAt`),
  ADD INDEX `idx_orders_user_status_created` (`userId`, `status`, `createdAt`),
  ADD INDEX `idx_orders_store_created` (`storeId`, `createdAt`),
  ADD INDEX `idx_orders_prescription` (`prescriptionId`);--> statement-breakpoint
ALTER TABLE `order_items`
  ADD INDEX `idx_order_items_order` (`orderId`),
  ADD INDEX `idx_order_items_product` (`productId`),
  ADD INDEX `idx_order_items_sku` (`storeSkuId`);--> statement-breakpoint
ALTER TABLE `audit_logs`
  ADD INDEX `idx_audit_logs_actor_created` (`actorId`, `createdAt`),
  ADD INDEX `idx_audit_logs_entity_created` (`entityType`, `entityId`, `createdAt`),
  ADD INDEX `idx_audit_logs_action_created` (`action`, `createdAt`);--> statement-breakpoint
ALTER TABLE `refunds`
  ADD INDEX `idx_refunds_order_status` (`orderId`, `status`),
  ADD INDEX `idx_refunds_payment_status` (`paymentId`, `status`),
  ADD INDEX `idx_refunds_sale_status` (`saleId`, `status`),
  ADD INDEX `idx_refunds_status_created` (`status`, `createdAt`);--> statement-breakpoint
ALTER TABLE `suppliers`
  ADD INDEX `idx_suppliers_active_name` (`isActive`, `supplierName`),
  ADD INDEX `idx_suppliers_gstin` (`gstin`);--> statement-breakpoint
ALTER TABLE `stock_movements`
  ADD INDEX `idx_stock_movements_store_batch_date` (`storeId`, `batchId`, `createdAt`),
  ADD INDEX `idx_stock_movements_batch_date` (`batchId`, `createdAt`),
  ADD INDEX `idx_stock_movements_type_date` (`movementType`, `createdAt`);--> statement-breakpoint
ALTER TABLE `purchase_invoices`
  ADD INDEX `idx_purchase_invoices_supplier_status_due` (`supplierId`, `status`, `invoiceDate`),
  ADD INDEX `idx_purchase_invoices_store_invoice_date` (`storeId`, `invoiceDate`),
  ADD INDEX `idx_purchase_invoices_invoice_no` (`invoiceNo`);--> statement-breakpoint
ALTER TABLE `supplier_payments`
  ADD INDEX `idx_supplier_payments_supplier_date` (`supplierId`, `paymentDate`),
  ADD INDEX `idx_supplier_payments_purchase_invoice` (`purchaseInvoiceId`),
  ADD INDEX `idx_supplier_payments_voucher_no` (`voucherNo`);--> statement-breakpoint
ALTER TABLE `supplier_payment_allocations`
  ADD INDEX `idx_supplier_alloc_purchase_invoice` (`purchaseInvoiceId`),
  ADD INDEX `idx_supplier_alloc_payment` (`supplierPaymentId`);--> statement-breakpoint
ALTER TABLE `h1_register`
  ADD INDEX `idx_h1_register_store_created` (`storeId`, `createdAt`),
  ADD INDEX `idx_h1_register_prescription_ref` (`prescriptionRef`),
  ADD INDEX `idx_h1_register_bill_no` (`billNo`),
  ADD INDEX `idx_h1_register_batch_no` (`batchNo`),
  ADD INDEX `idx_h1_register_patient_phone` (`patientPhone`);--> statement-breakpoint
ALTER TABLE `product_barcodes`
  ADD INDEX `idx_product_barcodes_barcode` (`barcode`),
  ADD INDEX `idx_product_barcodes_product` (`productId`);--> statement-breakpoint
ALTER TABLE `barcode_aliases`
  ADD INDEX `idx_barcode_aliases_product_batch` (`productId`, `batchId`),
  ADD INDEX `idx_barcode_aliases_store_active` (`storeId`, `isActive`);--> statement-breakpoint
ALTER TABLE `batch_ledger`
  ADD INDEX `idx_batch_ledger_store_product_batch` (`storeId`, `productId`, `batchNo`),
  ADD INDEX `idx_batch_ledger_store_product_expiry` (`storeId`, `productId`, `expiryDate`),
  ADD INDEX `idx_batch_ledger_internal_barcode` (`internalBarcode`),
  ADD INDEX `idx_batch_ledger_manufacturer_barcode` (`manufacturerBarcode`),
  ADD INDEX `idx_batch_ledger_status_expiry` (`status`, `expiryDate`),
  ADD INDEX `idx_batch_ledger_supplier_invoice` (`supplierId`, `purchaseInvoiceId`);--> statement-breakpoint
ALTER TABLE `stock_reservations`
  ADD INDEX `idx_stock_reservations_store_status_expires` (`storeId`, `status`, `expiresAt`),
  ADD INDEX `idx_stock_reservations_sku_status_expires` (`skuId`, `status`, `expiresAt`),
  ADD INDEX `idx_stock_reservations_product_status` (`productId`, `status`),
  ADD INDEX `idx_stock_reservations_order_status` (`orderId`, `status`),
  ADD INDEX `idx_stock_reservations_cart_status` (`cartId`, `status`);--> statement-breakpoint
ALTER TABLE `sales`
  ADD INDEX `idx_sales_store_status_created` (`store_id`, `status`, `created_at`),
  ADD INDEX `idx_sales_customer_status_created` (`customer_id`, `status`, `created_at`),
  ADD INDEX `idx_sales_sale_type_created` (`sale_type`, `created_at`),
  ADD INDEX `idx_sales_payment_ref` (`payment_ref`);--> statement-breakpoint
ALTER TABLE `sale_lines`
  ADD INDEX `idx_sale_lines_sale` (`sale_id`),
  ADD INDEX `idx_sale_lines_product_batch` (`product_id`, `batch_no`),
  ADD INDEX `idx_sale_lines_hsn` (`hsn_code`);--> statement-breakpoint
ALTER TABLE `invoice_snapshots`
  ADD INDEX `idx_invoice_snapshots_bill_no` (`bill_no`),
  ADD INDEX `idx_invoice_snapshots_store_generated` (`store_id`, `generated_at`),
  ADD INDEX `idx_invoice_snapshots_customer_generated` (`customer_id`, `generated_at`),
  ADD INDEX `idx_invoice_snapshots_order` (`order_id`);--> statement-breakpoint
ALTER TABLE `credit_notes`
  ADD INDEX `idx_credit_notes_bill_no` (`bill_no`),
  ADD INDEX `idx_credit_notes_customer_created` (`customer_id`, `created_at`),
  ADD INDEX `idx_credit_notes_store_issued` (`store_id`, `issued_at`);--> statement-breakpoint
ALTER TABLE `counter_payments`
  ADD INDEX `idx_counter_payments_sale_created` (`sale_id`, `created_at`),
  ADD INDEX `idx_counter_payments_status_created` (`status`, `created_at`),
  ADD INDEX `idx_counter_payments_payment_ref` (`payment_ref`),
  ADD INDEX `idx_counter_payments_gateway_ref` (`gateway_ref`);
