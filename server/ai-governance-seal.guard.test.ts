import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ writeAuditLog: vi.fn(async () => undefined) }));

const ai = await import("./services/aiGovernance");
const db = await import("./db");
const worker = await import("./services/workerRuntime");
const queue = await import("./services/jobQueue");

describe("AI governance seal", () => {
  it("classifies only assistive AI/OCR tasks and rejects clinical authority", () => {
    expect(ai.classifyAITask("ocr.parse.prescription")).toBe("ocr_data_capture");
    expect(ai.classifyAITask("ai.expiry.analysis")).toBe("inventory_expiry_analysis");
    expect(() => ai.assertAITaskAllowed("ai.approve.prescription")).toThrow(/outside governance boundary/);
    expect(() => ai.assertAITaskAllowed("ai.dosage.recommendation")).toThrow(/outside governance boundary/);
  });

  it("blocks AI outputs that try to finalize regulated fulfillment", () => {
    expect(() => ai.assertAIOutputAssistiveOnly({ suggestions: [{ sku: "abc", confidence: 0.7 }] })).not.toThrow();
    expect(() => ai.assertAIOutputAssistiveOnly({ regulatedFulfillment: { approved: true, release: "H1 medicine" } })).toThrow(/pharmacist-gated/);
  });

  it("records AI decisions with hashes and redacted audit payloads only", async () => {
    const decision = await ai.auditAIDecision({
      taskType: "ocr.parse.prescription",
      modelName: "ops-ocr-model",
      input: { patientName: "Jane Patient", phone: "+919999999999", prescriptionImage: "data:image/png;base64,abcd" },
      output: { extractedText: "manual review required" },
      regulatedEntityRef: "prescription:123",
      correlationId: "corr-ai-001",
    });
    expect(decision.assistiveOnly).toBe(true);
    expect(decision.mayMutateRegulatedFulfillment).toBe(false);
    expect(decision.pharmacistApprovalRequired).toBe(true);
    expect(db.writeAuditLog).toHaveBeenCalled();
    const auditPayload = JSON.stringify(vi.mocked(db.writeAuditLog).mock.calls.at(-1)?.[0]);
    expect(auditPayload).toContain("ai.decision_recorded");
    expect(auditPayload).not.toContain("Jane Patient");
    expect(auditPayload).not.toContain("9999999999");
  });

  it("dead-letters governed worker jobs when handler output attempts regulated mutation", async () => {
    queue.resetJobQueueForTests();
    const enqueued = await queue.enqueueJob({ queueName: "ai", jobType: "ai.anomaly.scan", idempotencyKey: "ai:regulated:1", payloadJson: { orderId: 10 } });
    const reserved = await queue.reserveJob({ queueName: "ai", workerId: "worker-ai" });
    expect(reserved?.id).toBe(enqueued.job.id);
    const result = await worker.executeJob(reserved!, { workerId: "worker-ai", handler: () => ({ regulatedFulfillment: { approved: true, release: "schedule H1" } }) });
    expect(result.status).toBe("dead_letter");
    expect(result.job.deadLetterReason).toMatch(/regulated fulfillment mutation/);
  });

  it("keeps AI/OCR worker registry non-mutating and explicitly bounded", () => {
    for (const jobType of ["ocr.parse.prescription", "ocr.parse.invoice", "ai.anomaly.scan", "ai.expiry.analysis"]) {
      const metadata = worker.getJobTypeMetadata(jobType);
      expect(metadata.mutatesExternalState).toBe(false);
      expect(metadata.regulatedExecutionAllowed).toBe(false);
      expect(metadata.governanceBoundary).toBe("assistive_only_no_regulated_mutation");
    }
  });
});
