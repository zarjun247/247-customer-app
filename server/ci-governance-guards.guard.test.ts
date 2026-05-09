import { describe, expect, it } from "vitest";
import { scanVirtualFiles } from "../scripts/ci-governance-guards.mjs";

function findingsFor(files: Record<string, string>) {
  return scanVirtualFiles(files);
}

function categoriesFor(files: Record<string, string>) {
  return findingsFor(files).map(finding => finding.category);
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

  it("catches provider_unconfigured returned as success across one return object", () => {
    expect(
      categoriesFor({
        "server/provider.ts":
          "return {\n  status: 'provider_unconfigured',\n  sent: true,\n};\n",
      })
    ).toContain("provider-risk");
  });

  it("catches printer unconfigured behavior marked printed", () => {
    expect(
      categoriesFor({
        "server/printer.ts":
          "return { status: 'provider_unconfigured', printed: true };\n",
      })
    ).toContain("provider-risk");
  });

  it("catches OCR unconfigured behavior marked parsed", () => {
    expect(
      categoriesFor({
        "server/ocr.ts":
          "return { status: 'provider_unconfigured', parsed: true };\n",
      })
    ).toContain("provider-risk");
  });

  it("catches payment/refund success without nearby provider proof", () => {
    expect(
      categoriesFor({ "server/payment.ts": "return { paid: true, id };\n" })
    ).toContain("provider-risk");
    expect(
      categoriesFor({ "server/refund.ts": "return { refunded: true, id };\n" })
    ).toContain("provider-risk");
  });

  it("allows explicit fail-closed provider states when they do not return success", () => {
    expect(
      scanVirtualFiles({
        "server/provider.ts": [
          "return { ok: false, status: 'not_configured', sent: false };",
          "return { ok: false, status: 'disabled', synced: false };",
          "return { ok: false, status: 'manual_required', verified: false };",
          "return { ok: false, status: 'queued' };",
          "return { ok: false, status: 'pending' };",
          "return { ok: false, status: 'failed' };",
          "return { ok: false, status: 'dead_letter' };",
          "return { ok: false, status: 'not_implemented' };",
        ].join("\n"),
      })
    ).toEqual([]);
  });

  it("catches direct stock mutation outside allowed files", () => {
    expect(
      categoriesFor({
        "server/random-router.ts":
          "await db.update(storeSkus).set({ availableQty: 1, stockQty: 1 });\n",
      })
    ).toContain("stock-mutation-risk");
  });

  it("catches stock movement audit placeholders", () => {
    expect(
      categoriesFor({
        "server/random-router.ts":
          "await db.insert(stockMovements).values({ qtyBefore: 0, qtyAfter: 0, ref: 'fake audit' });\n",
      })
    ).toContain("stock-mutation-risk");
  });

  it("does not flag read-only stock health checks", () => {
    expect(
      scanVirtualFiles({
        "server/stock-health.ts":
          "await db.select().from(storeSkus).where(eq(storeSkus.id, id));\n",
      })
    ).toEqual([]);
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

  it("allows a clean migration tail", () => {
    expect(
      scanVirtualFiles({
        "drizzle/0045_alpha.sql": "CREATE TABLE alpha (id int);\n",
        "drizzle/0046_beta.sql": "CREATE TABLE beta (id int);\n",
      })
    ).toEqual([]);
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

  it("catches placeholder OCR/storage success", () => {
    expect(
      categoriesFor({
        "server/ocr-storage.ts":
          "const storageUrl = 'https://example.com/placeholder.pdf';\nreturn { success: true, status: 'uploaded', storageUrl };\n",
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
