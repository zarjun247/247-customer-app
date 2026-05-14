export function calcPurchaseGst(
  purchaseRate: number,
  gstRate: number,
  qty: number,
  schemeDiscount: number,
  cashDiscount: number
) {
  const baseAmount = purchaseRate * qty;
  const schemeDis = baseAmount * (schemeDiscount / 100);
  const cashDis = (baseAmount - schemeDis) * (cashDiscount / 100);
  const taxableAmount = baseAmount - schemeDis - cashDis;
  const gstAmount = taxableAmount * (gstRate / 100);
  return { taxableAmount, gstAmount };
}

export function duplicateResult<T extends Record<string, unknown>>(
  result: T
): T & { idempotent: true; duplicate: true; status: "already_processed" } {
  return {
    ...result,
    idempotent: true,
    duplicate: true,
    status: "already_processed",
  };
}
