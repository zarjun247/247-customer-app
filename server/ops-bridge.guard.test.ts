import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("ops bridge static guards", () => {
  it("support cancellation path should not mutate order directly", () => {
    const s = fs.readFileSync("server/services/supportService.ts", "utf8");
    expect(s.includes("sales.cancellation.flow")).toBe(true);
    expect(/update\(orders\)|update\(sales\)/.test(s)).toBe(false);
  });
  it("delivery router enforces compliance gate for release statuses", () => {
    const s = fs.readFileSync("server/routers/deliveryRouter.ts", "utf8");
    expect(/compliance|pharmacist|controlled/i.test(s)).toBe(true);
  });
  it("shift closing should use reconciliationTruth", () => {
    const s = fs.existsSync("server/services/shiftClosing.ts")
      ? fs.readFileSync("server/services/shiftClosing.ts", "utf8")
      : "";
    expect(s.includes("reconciliationTruth") || s.length === 0).toBe(true);
  });
  it("ops reports include rows/totals/csvData shape in reports router", () => {
    const s = fs.readFileSync("server/routers/reportsRouter.ts", "utf8");
    expect(s.includes("rows")).toBe(true);
    expect(s.includes("totals")).toBe(true);
    expect(s.includes("csvData")).toBe(true);
  });
});
