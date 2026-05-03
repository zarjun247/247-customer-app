export async function createPurchasePayableEntry(input: any) { return { journalType: "purchase_payable", ...input }; }
export async function createSupplierPaymentEntry(input: any) { return { journalType: "supplier_payment", ...input }; }
export async function createSalePaymentEntry(input: any) { return { journalType: "sale_payment", ...input }; }
export async function getTrialBalanceLite() { return { assets: 0, liabilities: 0, expenses: 0, income: 0 }; }
