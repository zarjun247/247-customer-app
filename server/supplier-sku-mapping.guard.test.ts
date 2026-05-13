import { describe, it, expect } from "vitest";
import { assertSupplierSkuMappingUnique } from "./services/supplierSkuMapping";

describe("supplier sku mapping guards", () => {
  it("blocks duplicate active supplier sku mappings", () => {
    expect(() =>
      assertSupplierSkuMappingUnique(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ supplierId: 1, supplierSkuCode: "ABC", status: "approved" } as any],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { supplierId: 1, supplierSkuCode: "ABC", status: "draft" } as any
      )
    ).toThrow();
  });
});
