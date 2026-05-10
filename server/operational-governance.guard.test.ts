import { describe, expect, it } from "vitest";
import fs from "node:fs";

const requiredDocs = [
  "PHARMACIST_OPERATIONS_SOP.md",
  "SHIFT_HANDOFF_SOP.md",
  "STORE_OPENING_CHECKLIST.md",
  "STORE_CLOSING_CHECKLIST.md",
  "CONTROLLED_DRUG_HANDLING_SOP.md",
  "INCIDENT_ESCALATION_MATRIX.md",
  "OPERATIONAL_OWNERSHIP_MATRIX.md",
  "PHARMACIST_ESCALATION_RULES.md",
  "RECONCILIATION_OVERRIDE_GOVERNANCE.md",
  "OPERATIONAL_READINESS_MATRIX.md",
  "PHARMACIST_TRAINING_PACKET.md",
  "STORE_MANAGER_TRAINING_PACKET.md",
  "INCIDENT_COMMANDER_RUNBOOK.md",
];

function readDoc(path: string): string {
  expect(fs.existsSync(path), `${path} must exist`).toBe(true);
  return fs.readFileSync(path, "utf8");
}

describe("operational governance documentation guard", () => {
  it("keeps the operational SOP corpus present and explicit", () => {
    for (const docPath of requiredDocs) {
      const text = readDoc(docPath);
      expect(text.length, `${docPath} should contain executable doctrine`).toBeGreaterThan(800);
      expect(text).toMatch(/Updated: 2026-05-10/);
    }
  });

  it("preserves pharmacist gates, H\/H1 controls, and AI boundaries", () => {
    const corpus = requiredDocs.map(readDoc).join("\n");
    expect(corpus).toMatch(/AI[^\n]+assistive only/i);
    expect(corpus).toMatch(/cannot approve|No staff member, AI\/OCR output/i);
    expect(corpus).toMatch(/H\/H1\/X|H\/H1/i);
    expect(corpus).toMatch(/pharmacist[^\n]+stop-the-line authority/i);
    expect(corpus).not.toMatch(/AI[^\n]+approve prescriptions/i);
  });

  it("requires operational escalation, ownership, and override metadata", () => {
    const escalation = readDoc("INCIDENT_ESCALATION_MATRIX.md") + readDoc("PHARMACIST_ESCALATION_RULES.md");
    expect(escalation).toContain("Incident commander");
    expect(escalation).toContain("Rollback authority");
    expect(escalation).toContain("Emergency freeze authority");
    expect(escalation).toContain("Required escalation metadata");

    const overrideGovernance = readDoc("RECONCILIATION_OVERRIDE_GOVERNANCE.md");
    for (const required of ["previous value", "proposed value", "reason category", "approver", "affected store"]) {
      expect(overrideGovernance.toLowerCase()).toContain(required);
    }
  });

  it("does not convert doctrine into unsupported legal, provider, or production signoff claims", () => {
    const readiness = readDoc("OPERATIONAL_READINESS_MATRIX.md");
    expect(readiness).toContain("Legally reviewed");
    expect(readiness).toContain("Not claimed");
    expect(readiness).toContain("Provider-verified");
    expect(readiness).toContain("Production-approved");
    expect(readiness).toMatch(/Actual controlled-production readiness is \*\*8\.9 \/ 10\*\*/);
  });
});
