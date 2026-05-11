import { describe, expect, it } from "vitest";
import fs from "node:fs";

function readDoc(path: string): string {
  expect(fs.existsSync(path), `${path} must exist`).toBe(true);
  return fs.readFileSync(path, "utf8");
}

describe("operational governance documentation guard", () => {
  it("keeps the operational SOP corpus present and substantial", () => {
    const ops = readDoc("docs/OPERATIONS.md");
    const compliance = readDoc("docs/COMPLIANCE.md");
    expect(ops.length, "docs/OPERATIONS.md should be substantial").toBeGreaterThan(5000);
    expect(compliance.length, "docs/COMPLIANCE.md should be substantial").toBeGreaterThan(2000);
  });

  it("preserves pharmacist gates, H/H1 controls, and AI boundaries", () => {
    const corpus = readDoc("docs/OPERATIONS.md") + "\n" + readDoc("docs/COMPLIANCE.md");
    expect(corpus).toMatch(/AI[^\n]+assistive only/i);
    expect(corpus).toMatch(/cannot approve|No staff member, AI\/OCR output/i);
    expect(corpus).toMatch(/H\/H1\/X|H\/H1/i);
    expect(corpus).toMatch(/pharmacist[^\n]+stop-the-line authority/i);
    expect(corpus).not.toMatch(/AI[^\n]+approve prescriptions/i);
  });

  it("requires operational escalation, ownership, and override metadata", () => {
    const ops = readDoc("docs/OPERATIONS.md");
    expect(ops).toContain("Incident commander");
    expect(ops.toLowerCase()).toContain("rollback authority");
    expect(ops.toLowerCase()).toContain("emergency freeze");
    expect(ops).toContain("Required escalation metadata");

    for (const required of ["previous value", "proposed value", "reason category", "approver", "affected store"]) {
      expect(ops.toLowerCase()).toContain(required);
    }
  });

  it("does not overclaim legal, provider, or production readiness", () => {
    const status = readDoc("docs/STATUS.md");
    expect(status).toContain("NO-GO for live controlled production");
    expect(status).toMatch(/no production deployment.*proof claimed|Hosted DB observation still required/i);
  });
});
