import { describe, expect, it } from "vitest";
import fs from "fs";

describe("refund ledger implementation guards", () => {
  const service = fs.readFileSync("server/services/refundService.ts", "utf8");
  const schema = fs.readFileSync("drizzle/schema.ts", "utf8");
  const migration = fs.readFileSync("drizzle/0035_refund_ledger.sql", "utf8");

  it("uses the refunds ledger as refund truth instead of paymentRecords.failureReason", () => {
    expect(schema).toContain("export const refunds");
    expect(service).toContain("from(refunds)");
    expect(service).toContain("markRefundFailedRecord");
    expect(service).not.toContain("failureReason: `refund:");
  });

  it("persists failed provider refunds and does not fake provider success", () => {
    expect(service).toContain("paymentConnector.refund");
    expect(service).toContain("markRefundFailedRecord({ refundId: created.refundId");
    expect(service).toContain('status: "failed" as const');
    expect(service.indexOf("paymentConnector.refund")).toBeLessThan(service.indexOf('providerState: "succeeded" as RefundProviderState'));
  });

  it("declares duplicate provider refund protection", () => {
    expect(schema).toContain("refunds_provider_refund_id_uq");
    expect(migration).toContain("UNIQUE(`provider`,`providerRefundId`)");
    expect(service).toContain("Duplicate provider refund");
  });
});
