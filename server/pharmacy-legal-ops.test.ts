import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { REQUIRED_PHARMACY_SOP_CODES, evaluateRegulatedReleasePolicy } from "./services/pharmacyLegalOps";

describe("pharmacy legal ops foundation", () => {
  it("declares required legal ops schema and indexes in a single migration", () => {
    const migration = readFileSync("drizzle/0049_pharmacy_legal_ops.sql", "utf8");
    for (const table of ["pharmacy_store_licenses", "pharmacist_registrations", "pharmacist_duty_sessions", "regulated_release_evidence", "pharmacy_sop_acknowledgements", "pharmacy_inspection_exports", "pharmacy_temperature_logs", "cold_chain_breaches", "batch_recalls", "batch_recall_customer_impacts", "expired_medicine_disposals"]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
    expect(migration).toContain("idx_pharmacy_store_licenses_store_status");
    expect(migration).toContain("idx_regulated_release_evidence_status_created");
  });

  it("cold-chain breach and recalled batch block affected release", () => {
    expect(evaluateRegulatedReleasePolicy({ scheduleCategory: "H", requiresPrescription: true, storeLicenseStatus: "active", hasPharmacistOnDuty: true, pharmacistRegistered: true, prescriptionId: 1, patientRef: "p", quantity: 1, unresolvedColdChainBreach: true }).reasons).toContain("unresolved_cold_chain_breach");
    expect(evaluateRegulatedReleasePolicy({ scheduleCategory: "H", requiresPrescription: true, storeLicenseStatus: "active", hasPharmacistOnDuty: true, pharmacistRegistered: true, prescriptionId: 1, patientRef: "p", quantity: 1, recalledBatch: true }).reasons).toContain("batch_recalled");
  });

  it("expired disposal routes stock mutation through stock invariant disposal gateway", () => {
    const service = readFileSync("server/services/pharmacyLegalOps.ts", "utf8");
    expect(service).toContain("disposeBatch");
    expect(service).not.toMatch(/update\(batchLedger\)\.set\(\{\s*qtyOnHand/);
    expect(service).toContain("pharmacy.expiry_disposal.stock_invariant_linked");
  });

  it("SOP acknowledgement records required user/version/time-safe fields", () => {
    expect(REQUIRED_PHARMACY_SOP_CODES).toEqual(["cashier_sale", "pharmacist_regulated_release", "purchase_inwarding", "stock_audit", "delivery_handover", "refund_return", "offline_manual_fallback", "cold_chain", "recall", "expiry_disposal"]);
    const schema = readFileSync("drizzle/schema.ts", "utf8");
    expect(schema).toContain("pharmacySopAcknowledgements");
    expect(schema).toContain("acknowledgedAt");
    expect(schema).toContain("sopVersion");
  });

  it("contains no fake pharmacist clearance anti-patterns", () => {
    const service = readFileSync("server/services/pharmacyLegalOps.ts", "utf8");
    expect(service).not.toContain("entityId: 0");
    expect(service).not.toContain("Number(uuid)");
    expect(service).not.toContain("fake compliance success");
  });
});
