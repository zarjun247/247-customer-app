export type JournalLineInput = {
  accountCode: string;
  accountName: string;
  debit?: number;
  credit?: number;
  narration?: string;
  metadataJson?: unknown;
};

export type BalancedJournalBatchInput = {
  sourceType: string;
  sourceRef: string;
  sourceId?: number;
  storeId?: number | null;
  entryDate?: Date;
  postedBy?: number | null;
  narration?: string;
  metadataJson?: unknown;
  lines: JournalLineInput[];
};

function money(input: unknown) {
  const value = Number(input ?? 0);
  if (!Number.isFinite(value))
    throw new Error("journal line amount must be finite");
  return Math.round(value * 100) / 100;
}

export function createSaleJournalBatch(input: {
  saleId: number;
  storeId?: number | null;
  total: number;
  gstAmount?: number;
  paymentAccountCode?: string;
  paymentAccountName?: string;
  postedBy?: number | null;
}) {
  const gst = money(input.gstAmount);
  const total = money(input.total);
  const revenue = money(total - gst);
  if (revenue < 0) throw new Error("sale GST cannot exceed sale total");
  return {
    sourceType: "sale",
    sourceRef: String(input.saleId),
    sourceId: input.saleId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      {
        accountCode: input.paymentAccountCode ?? "1000",
        accountName: input.paymentAccountName ?? "Cash / Receivable",
        debit: total,
        credit: 0,
      },
      ...(revenue > 0
        ? [
            {
              accountCode: "4000",
              accountName: "Sales Revenue",
              debit: 0,
              credit: revenue,
            },
          ]
        : []),
      ...(gst > 0
        ? [
            {
              accountCode: "2400",
              accountName: "Output GST",
              debit: 0,
              credit: gst,
            },
          ]
        : []),
    ],
  } satisfies BalancedJournalBatchInput;
}

export function createPurchaseJournalBatch(input: {
  purchaseInvoiceId: number;
  storeId?: number | null;
  netAmount: number;
  totalGst?: number;
  postedBy?: number | null;
}) {
  const gst = money(input.totalGst);
  const net = money(input.netAmount);
  const purchases = money(net - gst);
  if (purchases < 0)
    throw new Error("purchase GST cannot exceed purchase net amount");
  return {
    sourceType: "purchase",
    sourceRef: String(input.purchaseInvoiceId),
    sourceId: input.purchaseInvoiceId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      ...(purchases > 0
        ? [
            {
              accountCode: "5000",
              accountName: "Purchases",
              debit: purchases,
              credit: 0,
            },
          ]
        : []),
      ...(gst > 0
        ? [
            {
              accountCode: "1400",
              accountName: "Input GST",
              debit: gst,
              credit: 0,
            },
          ]
        : []),
      {
        accountCode: "2100",
        accountName: "Supplier Payable",
        debit: 0,
        credit: net,
      },
    ],
  } satisfies BalancedJournalBatchInput;
}

export function createPaymentJournalBatch(input: {
  paymentId: number;
  storeId?: number | null;
  amount: number;
  postedBy?: number | null;
  settlementAccountCode?: string;
  settlementAccountName?: string;
}) {
  const amount = money(input.amount);
  return {
    sourceType: "payment",
    sourceRef: String(input.paymentId),
    sourceId: input.paymentId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      {
        accountCode: input.settlementAccountCode ?? "1000",
        accountName: input.settlementAccountName ?? "Cash / Bank",
        debit: amount,
        credit: 0,
      },
      {
        accountCode: "1100",
        accountName: "Customer Receivable",
        debit: 0,
        credit: amount,
      },
    ],
  } satisfies BalancedJournalBatchInput;
}

export function createRefundJournalBatch(input: {
  refundId: number;
  storeId?: number | null;
  amount: number;
  gstAmount?: number;
  postedBy?: number | null;
}) {
  const gst = money(input.gstAmount);
  const amount = money(input.amount);
  const salesReturn = money(amount - gst);
  if (salesReturn < 0)
    throw new Error("refund GST cannot exceed refund amount");
  return {
    sourceType: "refund",
    sourceRef: String(input.refundId),
    sourceId: input.refundId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      ...(salesReturn > 0
        ? [
            {
              accountCode: "4100",
              accountName: "Sales Returns",
              debit: salesReturn,
              credit: 0,
            },
          ]
        : []),
      ...(gst > 0
        ? [
            {
              accountCode: "2400",
              accountName: "Output GST Reversal",
              debit: gst,
              credit: 0,
            },
          ]
        : []),
      {
        accountCode: "1000",
        accountName: "Cash / Bank",
        debit: 0,
        credit: amount,
      },
    ],
  } satisfies BalancedJournalBatchInput;
}

export function createSaleReturnJournalBatch(input: {
  saleReturnId: number;
  storeId?: number | null;
  totalRefund: number;
  gstReversal?: number;
  postedBy?: number | null;
}) {
  return {
    ...createRefundJournalBatch({
      refundId: input.saleReturnId,
      storeId: input.storeId,
      amount: input.totalRefund,
      gstAmount: input.gstReversal,
      postedBy: input.postedBy,
    }),
    sourceType: "sale_return",
  } satisfies BalancedJournalBatchInput;
}

export function createPurchaseReturnJournalBatch(input: {
  purchaseReturnId: number;
  storeId?: number | null;
  totalAmount: number;
  gstReversal?: number;
  postedBy?: number | null;
}) {
  const gst = money(input.gstReversal);
  const total = money(input.totalAmount);
  const purchaseReturn = money(total - gst);
  if (purchaseReturn < 0)
    throw new Error("purchase return GST cannot exceed return amount");
  return {
    sourceType: "purchase_return",
    sourceRef: String(input.purchaseReturnId),
    sourceId: input.purchaseReturnId,
    storeId: input.storeId ?? null,
    postedBy: input.postedBy ?? null,
    lines: [
      {
        accountCode: "2100",
        accountName: "Supplier Payable",
        debit: total,
        credit: 0,
      },
      ...(purchaseReturn > 0
        ? [
            {
              accountCode: "5100",
              accountName: "Purchase Returns",
              debit: 0,
              credit: purchaseReturn,
            },
          ]
        : []),
      ...(gst > 0
        ? [
            {
              accountCode: "1400",
              accountName: "Input GST Reversal",
              debit: 0,
              credit: gst,
            },
          ]
        : []),
    ],
  } satisfies BalancedJournalBatchInput;
}
