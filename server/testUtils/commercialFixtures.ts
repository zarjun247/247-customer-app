/** Commercial test fixtures scaffold for commercial-flow integration tests. */
export type CommercialFixtureSeed = {
  storeId?: number; staffUserId?: number; customerId?: number; supplierId?: number;
  productId?: number; batchId?: number; purchaseInvoiceId?: number; saleId?: number;
  paymentId?: number; prescriptionId?: number; barcodeAliasId?: number; stockAuditSessionId?: number;
};

export function fixtureDefaults(seed: CommercialFixtureSeed = {}): Required<CommercialFixtureSeed> {
  return {
    storeId: seed.storeId ?? 1001, staffUserId: seed.staffUserId ?? 2001, customerId: seed.customerId ?? 3001,
    supplierId: seed.supplierId ?? 4001, productId: seed.productId ?? 5001, batchId: seed.batchId ?? 6001,
    purchaseInvoiceId: seed.purchaseInvoiceId ?? 7001, saleId: seed.saleId ?? 8001, paymentId: seed.paymentId ?? 9001,
    prescriptionId: seed.prescriptionId ?? 10001, barcodeAliasId: seed.barcodeAliasId ?? 11001, stockAuditSessionId: seed.stockAuditSessionId ?? 12001,
  };
}
