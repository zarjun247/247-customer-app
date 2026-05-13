import { describe, it, expect } from "vitest";
import { invoiceSequences } from "../drizzle/schema";

describe("invoice sequence schema guards", () => {
  it("invoice sequences table exists in schema", () => {
    expect(invoiceSequences).toBeTruthy();
  });
});
