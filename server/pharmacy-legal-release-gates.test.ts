import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateRegulatedReleasePolicy } from "./services/pharmacyLegalOps";

describe("pharmacy legal regulated release gates", () => {
  it("blocks missing, expired, and suspended store license states", () => {
    for (const storeLicenseStatus of ["missing", "expired", "suspended"]) {
      const decision = evaluateRegulatedReleasePolicy({
        scheduleCategory: "H1",
        requiresPrescription: true,
        storeLicenseStatus,
        hasPharmacistOnDuty: true,
        pharmacistRegistered: true,
        prescriptionId: 101,
        patientRef: "patient:1",
        doctorName: "Dr Registered",
        batchRef: "batch:1",
        quantity: 1,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reasons).toContain("active_store_license_required");
    }
  });

  it("blocks missing pharmacist duty or unregistered pharmacist approval", () => {
    expect(evaluateRegulatedReleasePolicy({ scheduleCategory: "H", requiresPrescription: true, storeLicenseStatus: "active", hasPharmacistOnDuty: false, pharmacistRegistered: true, prescriptionId: 1, patientRef: "p", quantity: 1 }).reasons).toContain("active_pharmacist_duty_required");
    expect(evaluateRegulatedReleasePolicy({ scheduleCategory: "H", requiresPrescription: true, storeLicenseStatus: "active", hasPharmacistOnDuty: true, pharmacistRegistered: false, prescriptionId: 1, patientRef: "p", quantity: 1 }).reasons).toContain("active_pharmacist_registration_required");
  });

  it("requires H1/Rx evidence and does not let reservation/payment bypass release approval", () => {
    const decision = evaluateRegulatedReleasePolicy({
      scheduleCategory: "H1",
      requiresPrescription: true,
      storeLicenseStatus: "active",
      hasPharmacistOnDuty: true,
      pharmacistRegistered: true,
      paymentVerified: true,
      reservationStatus: "consumed",
      quantity: 1,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.paymentOrReservationBypass).toBe(true);
    expect(decision.reasons).toEqual(expect.arrayContaining(["prescription_reference_required", "patient_ref_required", "doctor_evidence_required"]));
  });

  it("confirm sale path requires legal evidence pack in addition to existing compliance gate", () => {
    const compliance = readFileSync("server/services/complianceGate.ts", "utf8");
    expect(compliance).toContain("assertRegulatedEvidencePackForSale");
    expect(compliance).toContain("regulated.release_approved");
    expect(compliance).toContain("evidencePack: \"checked\"");
  });
});
