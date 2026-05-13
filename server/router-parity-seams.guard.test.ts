import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const purchaseRouter = readFileSync("server/routers/purchaseRouter.ts", "utf8");
const salesRouter = readFileSync("server/routers/salesRouter.ts", "utf8");
const paymentLifecycle = readFileSync(
  "server/services/paymentWebhookLifecycle.ts",
  "utf8"
);
const seams = readFileSync("server/services/commercialTruthSeams.ts", "utf8");

describe("router parity commercial truth seams", () => {
  it("purchase commit delegates runtime mutation to commitPurchaseInvoiceExactlyOnce", () => {
    const block = purchaseRouter.slice(
      purchaseRouter.indexOf("commitInvoice"),
      purchaseRouter.indexOf("stockMovements")
    );
    expect(block).toContain("commitPurchaseInvoiceExactlyOnce");
    expect(block).toContain("buildIdempotencyKey");
    expect(seams).toContain("commitPurchaseInvoiceExactlyOnce");
  });

  it("sale confirmation delegates runtime mutation to confirmSaleExactlyOnce", () => {
    const block = salesRouter.slice(
      salesRouter.indexOf("confirmSale: protectedProcedure"),
      salesRouter.indexOf("getInvoiceSnapshotPackage: protectedProcedure")
    );
    expect(block).toContain("confirmSaleExactlyOnce");
    expect(block).toContain("buildIdempotencyKey");
    expect(seams).toContain("confirmSaleExactlyOnce");
  });

  it("provider refund webhook settlement delegates to settleProviderRefundExactlyOnce", () => {
    expect(paymentLifecycle).toContain("handleRazorpayWebhook");
    expect(paymentLifecycle).toContain("settleProviderRefundExactlyOnce");
    expect(seams).toContain("settleProviderRefundExactlyOnce");
  });
});
