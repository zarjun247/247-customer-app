import { describe, expect, it } from "vitest";
import { scanVirtualFiles } from "../scripts/ci-governance-guards-shim";

function categoriesFor(files: Record<string, string>) {
  return scanVirtualFiles(files).map(finding => finding.category);
}

describe("ci governance/security guards", () => {
  it("catches unresolved conflict markers", () => {
    expect(
      categoriesFor({
        "server/runtime.ts":
          "<<<<<<< HEAD\nconst a = 1;\n=======\nconst a = 2;\n>>>>>>> branch\n",
      })
    ).toContain("merge-corruption");
  });

  it("catches fake provider success", () => {
    expect(
      categoriesFor({
        "server/payment.ts":
          "const note = 'fake success';\nreturn { status: 'sent' };\n",
      })
    ).toContain("provider-risk");
  });

  it("catches direct stock mutation outside allowed files", () => {
    expect(
      categoriesFor({
        "server/random-router.ts":
          "await db.update(batches).set({ [batches.qtyOnHand.name]: 1 });\n",
      })
    ).toContain("stock-mutation-risk");
  });

  it("catches unsafe audit numeric coercion", () => {
    expect(
      categoriesFor({
        "server/h1-audit.ts":
          "audit({ entityId: 0, line: Number(line.id), sale: Number(saleId), order: Number(orderId), uuid: parseInt(uuid) });\n",
      })
    ).toContain("audit-reference-risk");
  });

  it("catches duplicate migration numbers", () => {
    const findings = scanVirtualFiles({
      "drizzle/0045_alpha.sql": "CREATE TABLE alpha (id int);\n",
      "drizzle/0045_beta.sql": "CREATE TABLE beta (id int);\n",
    });
    expect(
      findings.filter(finding => finding.category === "migration-risk")
    ).toHaveLength(2);
  });

  it("catches obvious secret strings", () => {
    expect(
      categoriesFor({
        "server/secret.ts": "const JWT_SECRET = 'super-secret-token-value';\n",
      })
    ).toContain("secret-leakage");
  });

  it("catches admin bypass patterns", () => {
    expect(
      categoriesFor({
        "client/src/App.tsx":
          '<Route path="/admin/users"><AdminUsers /></Route>\n',
      })
    ).toContain("admin-auth-bypass-risk");
  });

  it("catches placeholder production success", () => {
    expect(
      categoriesFor({
        "server/provider.ts":
          "// not implemented yet\nreturn { success: true };\n",
      })
    ).toContain("placeholder-production-risk");
  });

  it("does not flag provider_unconfigured returned as failure/unavailable", () => {
    expect(
      scanVirtualFiles({
        "server/provider.ts":
          "return { ok: false, status: 'provider_unconfigured', unavailable: true, sent: false, synced: false, verified: false };\n",
      })
    ).toEqual([]);
  });

  it("does not flag preview_only printer behavior when not marked printed", () => {
    expect(
      scanVirtualFiles({
        "server/printer.ts":
          "return { status: 'preview_only', printed: false, previewGenerated: true };\n",
      })
    ).toEqual([]);
  });

  it("does not flag stock mutations inside an allowed invariant service", () => {
    expect(
      scanVirtualFiles({
        "server/stock-invariant.service.ts":
          "await db.insert(stockMovements).values(row);\nawait db.update(storeSkus).set({ availableQty: 1 });\n",
      })
    ).toEqual([]);
  });

  it("does not flag explicit test fixtures under test directories", () => {
    expect(
      scanVirtualFiles({
        "server/tests/provider-fixtures.ts":
          "const note = 'fake success'; return { success: true, status: 'sent' };\n",
        "server/tests/stock-fixtures.ts":
          "await db.insert(stockMovements).values(row);\n",
        "server/tests/audit-fixtures.ts":
          "audit({ entityId: 0, uuid: Number(uuid) });\n",
      })
    ).toEqual([]);
  });
});
