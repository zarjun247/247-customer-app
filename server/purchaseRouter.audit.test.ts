import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("server/routers/purchaseRouter.ts", "utf8");

describe("purchaseRouter audit regression", () => {
  it("purchase commit audit uses central call pattern with reason/sourceChannel", () => {
    expect(source).toContain('action: "commit", entityType: "purchase_invoice"');
    expect(source).toContain("reason,");
    expect(source).toContain("sourceChannel: inv.sourceType === \"whatsapp\" ? \"whatsapp\" : \"app\"");
  });

  it("purchase return audit uses non-empty reason and non-zero entityId", () => {
    expect(source).toContain('action: "create", entityType: "purchase_return", entityId: id');
    expect(source).toContain("if (!reason) throw new TRPCError");
    expect(source).not.toContain("entityId: 0");
  });
});
