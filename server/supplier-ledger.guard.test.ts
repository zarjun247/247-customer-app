import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("supplier ledger guards", () => {
  it("purchase commit path references payable creation", () => {
    const src =
      fs.readFileSync("server/routers/purchaseRouter.ts", "utf8") +
      fs.readFileSync("server/routers/purchaseReturnsRouter.ts", "utf8") +
      fs.readFileSync("server/services/commercialTruthSeams.ts", "utf8");
    expect(src.includes("recordSupplierPayable")).toBe(true);
  });

  it("supplier outstanding report shape helper exists", () => {
    const src =
      fs.readFileSync("server/services/supplierLedger.ts", "utf8") +
      fs.readFileSync("server/services/supplierLedgerCore.ts", "utf8");
    expect(src.includes("outstanding")).toBe(true);
  });
});
