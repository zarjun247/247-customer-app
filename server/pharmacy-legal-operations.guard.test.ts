import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { buildRegulatedReleaseProof } from "./services/regulatedReleaseProof";
import { createRecallNotice, generateRecallActionPlan, markBatchQuarantinedForRecall } from "./services/recallManagement";
import { recordTemperatureReading } from "./services/coldChainMonitoring";
import { getStaffSopStatus, recordSopAcknowledgement } from "./services/sopAcknowledgement";
import { buildPharmacyLegalOpsReport } from "./services/pharmacyLegalOpsReport";

describe("pharmacy legal operations pack", () => {
  it("regulated release checklist blocks missing prescription", () => {
    const evidence = buildRegulatedReleaseProof({ saleId: "sale-uuid", productId: "prod-uuid", batchId: "batch-uuid", pharmacistId: "pharm-1", actorType: "pharmacist", scheduleFlag: "H", decision: "approved" });
    expect(evidence.decision).toBe("rejected");
    expect(evidence.missingFieldsJson).toContain("validPrescriptionPresent");
  });

  it("regulated release checklist blocks missing pharmacist actor", () => {
    const evidence = buildRegulatedReleaseProof({ saleId: "sale-uuid", productId: "prod-uuid", batchId: "batch-uuid", prescriptionId: "rx-uuid", prescription: { present: true, doctorName: "Dr A", patientIdentity: "patient-ref" }, scheduleFlag: "H", decision: "approved" });
    expect(evidence.decision).toBe("rejected");
    expect(evidence.missingFieldsJson).toContain("pharmacistActorRecorded");
  });

  it("H1 product requires H1 evidence or reports missing evidence", () => {
    const evidence = buildRegulatedReleaseProof({ saleId: "sale-uuid", productId: "prod-uuid", batchId: "batch-uuid", prescriptionId: "rx-uuid", prescription: { present: true, doctorName: "Dr A", patientIdentity: "patient-ref" }, pharmacistId: "pharm-1", actorType: "pharmacist", scheduleFlag: "H1", decision: "approved" });
    expect(evidence.missingFieldsJson).toContain("h1EvidencePresent");
  });

  it("AI/system actor cannot approve regulated release", () => {
    const evidence = buildRegulatedReleaseProof({ saleId: "sale-uuid", productId: "prod-uuid", batchId: "batch-uuid", prescriptionId: "rx-uuid", prescription: { present: true, doctorName: "Dr A", patientIdentity: "patient-ref" }, pharmacistId: "ai-agent", actorType: "ai", scheduleFlag: "H", decision: "approved" });
    expect(evidence.decision).toBe("rejected");
    expect(evidence.missingFieldsJson).toContain("aiDidNotApprove");
  });

  it("release evidence uses string-safe refs, no Number(uuid)", () => {
    const evidence = buildRegulatedReleaseProof({ saleId: "550e8400-e29b-41d4-a716-446655440000", productId: "prod-uuid", batchLedgerId: "batch-ledger-uuid", prescriptionId: "rx-uuid", h1Ref: "h1-uuid", prescription: { present: true, doctorName: "Dr A", patientIdentity: "patient-ref" }, pharmacistId: "pharm-uuid", actorType: "pharmacist", scheduleFlag: "H1", decision: "approved" });
    expect(evidence.saleId).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(evidence.pharmacistId).toBe("pharm-uuid");
  });

  it("recall action plan identifies affected inventory/sales by product/batch", () => {
    const notice = createRecallNotice({ manufacturer: "Maker", productId: "prod-1", batchNo: "B1", reason: "recall" });
    const plan = generateRecallActionPlan(notice, [{ id: "inv-1", storeId: "s1", productId: "prod-1", batchNo: "B1" }, { id: "inv-2", storeId: "s1", productId: "prod-1", batchNo: "B2" }], [{ saleId: "sale-1", customerMobile: "999", customerId: "cust-1", productId: "prod-1", batchNo: "B1" }]);
    expect(plan.affectedInventory).toHaveLength(1);
    expect(plan.affectedSales).toHaveLength(1);
  });

  it("recall does not directly mutate stock unless routed through approved gateway", async () => {
    const notice = createRecallNotice({ manufacturer: "Maker", productId: "prod-1", batchNo: "B1", reason: "recall" });
    const result = await markBatchQuarantinedForRecall(notice);
    expect(result).toMatchObject({ routed: false, action: "route_to_stockInvariant_or_approved_inventory_service" });
  });

  it("cold-chain excursion is detected from manual readings", async () => {
    const alerts: any[] = [];
    const result = await recordTemperatureReading({ storeId: "s1", storageUnitId: "fridge-1", temperatureC: 12, capturedBy: "staff-1", source: "manual", minAllowedC: 2, maxAllowedC: 8 }, { alerts });
    expect(result.alert?.excursionStatus).toBe("high_excursion");
    expect(alerts).toHaveLength(1);
  });

  it("cold-chain normal readings do not create false alerts", async () => {
    const alerts: any[] = [];
    const result = await recordTemperatureReading({ storeId: "s1", storageUnitId: "fridge-1", temperatureC: 5, capturedBy: "staff-1", source: "manual", minAllowedC: 2, maxAllowedC: 8 }, { alerts });
    expect(result.alert).toBeNull();
    expect(alerts).toHaveLength(0);
  });

  it("SOP acknowledgement status works", async () => {
    const ack = await recordSopAcknowledgement({ staffId: "staff-1", sopType: "cold_chain", version: "v1", expiresAt: new Date("2099-01-01") });
    expect(getStaffSopStatus("staff-1", [ack], ["cold_chain"])[0].status).toBe("current");
  });

  it("legal ops report returns rows/totals/csvData", () => {
    const release = buildRegulatedReleaseProof({ saleId: "sale-1", productId: "prod-1", batchId: "batch-1", prescriptionId: "rx-secret", prescription: { present: true, doctorName: "Dr A", patientIdentity: "patient-ref" }, pharmacistId: "pharm-1", actorType: "pharmacist", scheduleFlag: "H", decision: "approved" });
    const report = buildPharmacyLegalOpsReport({ regulatedReleases: [release] });
    expect(report.rows).toHaveLength(1);
    expect(report.totals.regulatedReleaseCount).toBe(1);
    expect(report.csvData).toContain("regulated_release");
  });

  it("reports redact sensitive prescription/customer data", () => {
    const notice = createRecallNotice({ manufacturer: "Maker", productId: "prod-1", batchNo: "B1", reason: "recall" });
    const release = buildRegulatedReleaseProof({ saleId: "sale-1", productId: "prod-1", batchId: "batch-1", prescriptionId: "rx-secret", prescription: { present: true, doctorName: "Dr A", patientIdentity: "patient-ref", fileBlob: "raw", imageUrl: "secret-url", token: "secret" }, pharmacistId: "pharm-1", actorType: "pharmacist", scheduleFlag: "H", decision: "approved" });
    const report = buildPharmacyLegalOpsReport({ regulatedReleases: [release], recalls: [notice] });
    expect(JSON.stringify(report)).not.toContain("secret-url");
    expect(report.csvData).not.toContain("rx-secret");
  });

  it("no direct stock mutation introduced outside approved services", () => {
    const recallSource = fs.readFileSync("server/services/recallManagement.ts", "utf8");
    expect(recallSource).not.toMatch(/db\.update\(|stockQty|qtyOnHand\s*[:=]/);
    expect(recallSource).toContain("quarantineGateway");
  });
});
