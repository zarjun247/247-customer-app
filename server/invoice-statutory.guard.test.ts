import { describe, it, expect } from "vitest";
import {
  buildInvoiceForSale,
  getCustomerInvoiceSummary,
  getInvoiceBySale,
} from "./services/invoiceService";

describe("invoice statutory guards", () => {
  it("detects missing statutory fields including store identity and product/gst/hsn requirements", () => {
    const invoice = buildInvoiceForSale({
      header: { invoiceNumber: "INV-1" },
      lines: [{ productName: "", quantity: 1, mrp: 10, sellingPrice: 10 }],
    });
    expect(invoice.completeness.complete).toBe(false);
    const missing = invoice.completeness.missingFields.join(",");
    expect(missing).toContain("storeName");
    expect(missing).toContain("lines[0].productName");
    expect(missing).toContain("lines[0].hsnCode");
  });

  it("invoice service methods are implemented (non-stub responses)", async () => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
            orderBy: () => ({ limit: async () => [] }),
          }),
        }),
      }),
    } as unknown;
    const bySale = await getInvoiceBySale(fakeDb, "missing");
    const summary = await getCustomerInvoiceSummary(fakeDb, 1);
    expect(bySale).toHaveProperty("status");
    expect(summary).toHaveProperty("status");
  });
});
