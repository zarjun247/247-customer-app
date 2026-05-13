import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("supplier invoice duplicate enforcement plan", () => {
  it("purchase commit seam guards future committed duplicates without destructive backfill", () => {
    const seam = fs.readFileSync(
      "server/services/commercialTruthSeams.ts",
      "utf8"
    );
    expect(seam).toContain("assertNoCommittedSupplierInvoiceDuplicate");
    expect(seam).toContain(
      "eq(purchaseInvoices.supplierId, invoice.supplierId)"
    );
    expect(seam).toContain("eq(purchaseInvoices.storeId, invoice.storeId)");
    expect(seam).toContain(
      "eq(purchaseInvoices.invoiceNo, normalizedInvoiceNo)"
    );
    expect(seam).toContain(
      'inArray(purchaseInvoices.status, ["committed", "partially_returned", "returned"])'
    );
    expect(seam).toContain('code: "CONFLICT"');
  });

  it("documents business-review backfill before adding hard uniqueness", () => {
    const blockers = fs.readFileSync("OPEN_BLOCKERS.md", "utf8");
    expect(blockers).toContain("supplier + store + invoice number");
    expect(blockers).toContain("business-review backfill");
  });
});
