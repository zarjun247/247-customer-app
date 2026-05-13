/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/require-await */
export async function createPurchasePayableEntry(input: any) {
  return { journalType: "purchase_payable", ...input };
}
export async function createSupplierPaymentEntry(input: any) {
  return { journalType: "supplier_payment", ...input };
}
export async function createSalePaymentEntry(input: any) {
  return { journalType: "sale_payment", ...input };
}
export async function getTrialBalanceLite() {
  return { assets: 0, liabilities: 0, expenses: 0, income: 0 };
}
