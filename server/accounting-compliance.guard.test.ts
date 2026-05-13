import { describe, test, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Accounting & Compliance routers present", () => {
  test("routers.ts imports accounting/compliance/reconciliation routers", () => {
    const src = fs.readFileSync("server/routers.ts", "utf8");
    expect(src).toContain("accountingOps");
    expect(src).toContain("complianceOps");
    expect(src).toContain("reconciliation");
  });

  test("accountingOps router file exists", () => {
    const p = path.join("server", "routers", "accountingOpsRouter.ts");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("grossMarginSummary");
    expect(src).toContain("paymentMethodBreakdown");
  });
});
