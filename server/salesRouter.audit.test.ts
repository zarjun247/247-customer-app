import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("server/routers/salesRouter.ts", "utf8");

describe("salesRouter audit regression", () => {
  it("sale confirm audit does not use entityId 0", () => {
    expect(source).toContain('action: "confirm"');
    expect(source).toContain("entityId: uuidToEntityId(input.saleId)");
    expect(source).not.toContain("entityId: 0");
  });

  it("sale return audit includes reason and sourceChannel", () => {
    expect(source).toContain('action: "create_return"');
    expect(source).toContain("reason: input.reason");
    expect(source).toContain("sourceChannel: sale.saleType === \"whatsapp\" ? \"whatsapp\" : \"app\"");
  });
});
