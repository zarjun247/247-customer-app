import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("transactional usage guard", () => {
  it("commercialTruthSeams uses appendCommercialEventWithDb for refund settlement", () => {
    const file = fs.readFileSync(path.join(__dirname, "services", "commercialTruthSeams.ts"), "utf8");
    expect(file.includes("appendCommercialEventWithDb")).toBe(true);
  });
});
