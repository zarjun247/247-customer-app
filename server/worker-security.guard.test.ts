import { describe, it, expect } from "vitest";
import fs from "fs";

describe("worker route security", () => {
  it("checks for cron secret or admin token", () => {
    const src = fs.readFileSync("server/_core/index.ts", "utf8");
    expect(src).toContain("x-cron-secret");
    expect(src).toContain("authorization");
  });
});
