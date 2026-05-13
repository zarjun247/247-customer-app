export function createPurchasePayableEntry(input: Record<string, unknown>) {
  return Promise.resolve({ journalType: "purchase_payable", ...input });
}
export function createSupplierPaymentEntry(input: Record<string, unknown>) {
  return Promise.resolve({ journalType: "supplier_payment", ...input });
}
export function createSalePaymentEntry(input: Record<string, unknown>) {
  return Promise.resolve({ journalType: "sale_payment", ...input });
}
export function getTrialBalanceLite() {
  return Promise.resolve({ assets: 0, liabilities: 0, expenses: 0, income: 0 });
}
