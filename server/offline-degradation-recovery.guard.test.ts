import { describe, expect, it } from "vitest";
import fs from "fs";
import {
  assertOperationAllowedInMode,
  getOfflineOperationPolicy,
} from "./services/offlineDegradationPolicy";
import {
  InMemoryOfflineQueueRepository,
  buildOfflineQueueHealthSummary,
  classifyReplayConflict,
  queueOfflineOperation,
  replayOfflineOperation,
  sanitizeOfflinePayload,
  type OfflineOperationRecord,
} from "./services/offlineOperationQueue";
import { buildOfflineRecoveryReport } from "./services/offlineRecoveryReport";

function baseRecord(overrides: Partial<OfflineOperationRecord> = {}): OfflineOperationRecord {
  const now = new Date("2026-05-08T00:00:00.000Z");
  return {
    id: 1,
    storeId: 7,
    terminalId: "terminal-a",
    actorId: 11,
    operationType: "cart_draft",
    operationCategory: "draft_intent",
    payloadJson: {},
    payloadHash: "hash",
    idempotencyKey: "idem-1",
    status: "queued",
    replayAttempts: 0,
    lastReplayAt: null,
    conflictReason: null,
    rejectionReason: null,
    duplicateCount: 0,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("offline/degraded mode policy", () => {
  it("allows safe draft operations offline", () => {
    expect(assertOperationAllowedInMode("customer_order_draft", "offline").category).toBe("draft_intent");
    expect(assertOperationAllowedInMode("cart_draft", "degraded_network").allowedOffline).toBe(true);
  });

  it("blocks payment verification offline", () => {
    expect(() => assertOperationAllowedInMode("payment_verification", "offline")).toThrow(/not allowed/);
    expect(getOfflineOperationPolicy("payment_verification")).toMatchObject({ highRisk: true, allowedOffline: false });
  });

  it("blocks H/H1/X regulated release offline", () => {
    for (const operation of ["regulated_h_release", "regulated_h1_release", "regulated_x_release"] as const) {
      expect(() => assertOperationAllowedInMode(operation, "offline")).toThrow(/not allowed/);
    }
  });

  it("blocks stock decrement/inward commit offline", () => {
    expect(() => assertOperationAllowedInMode("stock_physical_decrement", "offline")).toThrow(/not allowed/);
    expect(() => assertOperationAllowedInMode("stock_inward_commit", "offline")).toThrow(/not allowed/);
  });
});

describe("offline operation queue and replay", () => {
  it("requires idempotencyKey", async () => {
    const repo = new InMemoryOfflineQueueRepository();
    await expect(queueOfflineOperation({ storeId: 1, terminalId: "t1", operationType: "cart_draft" }, repo)).rejects.toThrow(/idempotencyKey/);
  });

  it("duplicate idempotencyKey does not create duplicate queued operation", async () => {
    const repo = new InMemoryOfflineQueueRepository();
    const first = await queueOfflineOperation({ storeId: 1, terminalId: "t1", operationType: "cart_draft", idempotencyKey: "same" }, repo);
    const second = await queueOfflineOperation({ storeId: 1, terminalId: "t1", operationType: "cart_draft", idempotencyKey: "same" }, repo);
    expect(second.duplicate).toBe(true);
    expect(second.operation.id).toBe(first.operation.id);
    expect(second.operation.duplicateCount).toBe(1);
    expect(await repo.listForStore(1)).toHaveLength(1);
  });

  it("replay does not double-apply", async () => {
    const repo = new InMemoryOfflineQueueRepository([baseRecord()]);
    let applied = 0;
    const first = await replayOfflineOperation(1, { repository: repo, apply: async () => { applied += 1; return { applied: true }; } });
    const second = await replayOfflineOperation(1, { repository: repo, apply: async () => { applied += 1; return { applied: true }; } });
    expect(first.status).toBe("applied");
    expect(second.status).toBe("applied");
    expect(applied).toBe(1);
  });

  it("replay validates online state before apply", async () => {
    const repo = new InMemoryOfflineQueueRepository([baseRecord({ payloadJson: { stockVersion: "old" } })]);
    let applied = false;
    const result = await replayOfflineOperation(1, {
      repository: repo,
      validationContext: { currentStockVersion: "new" },
      apply: async () => { applied = true; return { applied: true }; },
    });
    expect(result.status).toBe("conflict");
    expect(result.conflictReason).toBe("stale_stock");
    expect(applied).toBe(false);
  });

  it("regulated offline operation is rejected/fail-closed during replay", async () => {
    const repo = new InMemoryOfflineQueueRepository([
      baseRecord({ operationType: "regulated_h1_release", operationCategory: "never_finalize_offline" }),
    ]);
    const result = await replayOfflineOperation(1, { repository: repo, apply: async () => ({ applied: true }) });
    expect(result.status).toBe("rejected");
    expect(result.rejectionReason).toBe("regulated_or_financial_gate_blocked");
  });

  it("sanitized payload does not store secrets/prescription blobs/payment signatures", async () => {
    const repo = new InMemoryOfflineQueueRepository();
    const result = await queueOfflineOperation({
      storeId: 1,
      terminalId: "t1",
      operationType: "prescription_upload_metadata_placeholder",
      idempotencyKey: "safe-payload",
      payloadJson: {
        note: "metadata only",
        paymentSignature: "sig",
        providerSecret: "secret",
        prescriptionImageBlob: "data:image/png;base64," + "A".repeat(800),
        nested: { token: "raw-token" },
      },
    }, repo);
    expect(JSON.stringify(result.operation.payloadJson)).not.toContain("raw-token");
    expect(JSON.stringify(result.operation.payloadJson)).not.toContain("data:image/png");
    expect(result.operation.payloadJson.note).toBe("metadata only");
    expect(sanitizeOfflinePayload({ razorpayToken: "tok" }).razorpayToken).toBe("[REDACTED_OFFLINE_QUEUE]");
  });

  it("provider_unconfigured/offline provider is not marked success", () => {
    const conflict = classifyReplayConflict(baseRecord({ operationType: "staff_note", operationCategory: "reconcile_intent" }), {
      providerResult: { providerName: "whatsapp", status: "sent", ok: true, configured: false },
    });
    expect(conflict).toBe("provider_unavailable");
  });

  it("no direct stock mutation introduced in offline queue/replay paths", () => {
    const source = fs.readFileSync("server/services/offlineOperationQueue.ts", "utf8");
    expect(source).not.toMatch(/insert\(stockMovements\)|update\(batchLedger\)|update\(storeSkus\)|stockQty\s*[+-]/);
  });
});

describe("offline recovery report and health summary", () => {
  it("recovery report returns rows/totals/csvData", () => {
    const report = buildOfflineRecoveryReport([
      baseRecord({ duplicateCount: 2, createdAt: new Date("2026-05-08T00:00:00.000Z") }),
      baseRecord({ id: 2, status: "rejected", operationType: "payment_verification", operationCategory: "never_finalize_offline", rejectionReason: "regulated_or_financial_gate_blocked" }),
      baseRecord({ id: 3, status: "conflict", conflictReason: "stale_price" }),
    ], { now: new Date("2026-05-08T01:00:00.000Z"), pendingThresholdMs: 10 });
    expect(report.rows).toHaveLength(3);
    expect(report.totals.queued).toBe(1);
    expect(report.queuedCount).toBe(1);
    expect(report.rejectedCount).toBe(1);
    expect(report.conflictCount).toBe(1);
    expect(report.csvData).toContain("operationType");
    expect(report.csvData).not.toContain("payloadJson");
  });

  it("healthcheck summary exposes counts only, no payload", async () => {
    const repo = new InMemoryOfflineQueueRepository([
      baseRecord({ payloadJson: { secret: "do-not-leak" } }),
      baseRecord({ id: 2, status: "conflict", payloadJson: { secret: "do-not-leak" } }),
      baseRecord({ id: 3, status: "rejected", operationType: "payment_verification", operationCategory: "never_finalize_offline" }),
    ]);
    const summary = await buildOfflineQueueHealthSummary(repo, 7);
    expect(summary).toEqual(expect.objectContaining({ queuedCount: 1, conflictCount: 1, highRiskBlockedCount: 1 }));
    expect(JSON.stringify(summary)).not.toContain("do-not-leak");
  });
});
