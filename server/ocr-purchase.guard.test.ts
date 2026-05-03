import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("ocr purchase guards", () => {
  it("does not allow direct stock commit from OCR router", () => {
    const src = fs.readFileSync("server/routers/ocrIngestionRouter.ts", "utf8");
    expect(src.includes("increaseStockForPurchaseCommit")).toBe(false);
  });

  it("has low-confidence draft safeguard", () => {
    const src = fs.readFileSync("server/services/ocrPurchaseInwarding.ts", "utf8");
    expect(src.includes("draft_required")).toBe(true);
  });
});
