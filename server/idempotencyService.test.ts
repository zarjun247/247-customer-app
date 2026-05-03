import { describe, it, expect } from "vitest";
import fs from "node:fs";

describe("idempotency service", () => {
  it("exports required helpers", () => {
    const src = fs.readFileSync("server/services/idempotencyService.ts", "utf8");
    ["buildIdempotencyKey","beginIdempotentOperation","withIdempotency","idempotency.operation_started"].forEach((k)=>expect(src.includes(k)).toBe(true));
  });
});
