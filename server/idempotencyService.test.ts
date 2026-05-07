import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { createMutationFingerprint } from "./services/idempotencyService";

describe("idempotency service", () => {
  it("exports required helpers and uses duplicate-key safe insert path", () => {
    const src = fs.readFileSync("server/services/idempotencyService.ts", "utf8");
    ["buildIdempotencyKey", "beginIdempotentOperation", "withIdempotency", "idempotency.operation_started"].forEach((k) => expect(src.includes(k)).toBe(true));
    expect(src).toContain("ER_DUP_ENTRY");
    expect(src.indexOf("db.insert(table).values(values)")).toBeLessThan(src.indexOf("fetchOperation(db, table"));
    expect(src).toContain("Idempotency key reused with different payload");
  });

  it("requires schema uniqueness on scope and key", () => {
    const schema = fs.readFileSync("drizzle/schema.ts", "utf8");
    const migration = fs.readFileSync("drizzle/0026_idempotency_reservations.sql", "utf8");
    expect(schema).toContain('uniqueIndex("idempotency_keys_key_scope_uidx").on(t.key, t.scope)');
    expect(migration).toContain("UNIQUE KEY `idempotency_keys_key_scope_uidx` (`key`,`scope`)");
  });

  it("creates stable SHA-256 canonical fingerprints", () => {
    const a = createMutationFingerprint({ b: 2, a: { y: 1, x: [3, 2] } });
    const b = createMutationFingerprint({ a: { x: [3, 2], y: 1 }, b: 2 });
    const c = createMutationFingerprint({ a: { x: [3, 2], y: 9 }, b: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("documents withIdempotency replay, conflict, in-progress, and failed retry behavior", () => {
    const src = fs.readFileSync("server/services/idempotencyService.ts", "utf8");
    expect(src).toContain('existing.status === "completed"');
    expect(src).toContain("return existing.resultJson as T");
    expect(src).toContain("assertRequestHashMatches(existing, params.requestHash)");
    expect(src).toContain('existing.status === "started" && !existing.__created');
    expect(src).toContain("Failed operations may be retried only with the same requestHash");
  });

  it("preserves UUID entity refs instead of unsafe Number conversions in idempotency/audit paths", () => {
    const idem = fs.readFileSync("server/services/idempotencyService.ts", "utf8");
    const audit = fs.readFileSync("server/services/audit.ts", "utf8");
    const sales = fs.readFileSync("server/routers/salesRouter.ts", "utf8");
    const compliance = fs.readFileSync("server/services/complianceGate.ts", "utf8");
    const margin = fs.readFileSync("server/services/marginGuard.ts", "utf8");
    expect(idem).not.toMatch(/Number\((input\.entityId|params\.entityId)\)/);
    expect(`${sales}\n${margin}`).not.toMatch(/Number\((saleId|input\.saleId)\)/);
    expect(compliance).not.toContain("Number(line.id)");
    expect(audit).toContain("entityRef?: string | null");
    expect(`${idem}\n${sales}\n${compliance}\n${margin}`).toContain("entityRef");
  });
});
