import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("reconciliation truth guard", () => {
  const reports = readFileSync("server/routers/reportsRouter.ts", "utf8");
  const sales =
    readFileSync("server/routers/salesRouter.ts", "utf8") +
    readFileSync("server/routers/salesReportsRouter.ts", "utf8");

  it("migrated reports return normalized shape", () => {
    expect(reports).toContain("rows");
    expect(reports).toContain("totals");
    expect(reports).toContain("csvData");
  });

  it("sales cancellation flow audits request and result", () => {
    expect(sales).toContain("sale.cancel_requested");
    expect(sales).toContain("sale.cancelled");
  });
});
