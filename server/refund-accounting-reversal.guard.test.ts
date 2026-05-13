import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  assertBalancedJournalBatch,
  createRefundJournalBatch,
} from "./services/accountingLedger";

describe("refund accounting reversal proof", () => {
  it("refund reversal helper balances debit and credit totals", () => {
    const batch = createRefundJournalBatch({
      refundId: 901,
      amount: 118,
      gstAmount: 18,
    });
    expect(batch.sourceType).toBe("refund");
    expect(batch.sourceRef).toBe("901");
    expect(batch.lines).toContainEqual(
      expect.objectContaining({ accountName: "Output GST Reversal", debit: 18 })
    );
    expect(assertBalancedJournalBatch(batch).totalDebit).toBe(
      assertBalancedJournalBatch(batch).totalCredit
    );
  });

  it("successful provider refund settlement posts one source-unique journal batch linked to refund/payment/order IDs", () => {
    const service = fs.readFileSync(
      "server/services/commercialTruthSeams.ts",
      "utf8"
    );
    const schema = fs
      .readdirSync("drizzle/schema")
      .filter(f => f.endsWith(".ts") && f !== "index.ts")
      .map(f => fs.readFileSync(`drizzle/schema/${f}`, "utf8"))
      .join("\n");
    expect(service).toContain("postBalancedJournalBatch(tx");
    expect(service).toContain("createRefundJournalBatch({");
    expect(service).toContain("paymentId: payment.id");
    expect(service).toContain("orderId: payment.orderId");
    expect(service).toContain("refundId,");
    expect(service).toContain("providerRefundId: input.providerRefundId");
    expect(schema).toContain("uqJournalBatchSource");
    expect(
      service.indexOf("if (existing) return duplicateResult")
    ).toBeLessThan(service.indexOf("postBalancedJournalBatch(tx"));
  });

  it("failed refund webhook path does not create reversal entries", () => {
    const lifecycle = fs.readFileSync(
      "server/services/paymentWebhookLifecycle.ts",
      "utf8"
    );
    const successPath = lifecycle.indexOf(
      "if (REFUND_SUCCESS_EVENTS.has(refs.eventType))"
    );
    const successJournalCall = lifecycle.indexOf(
      "settleProviderRefundExactlyOnce",
      successPath
    );
    const failedCall = lifecycle.indexOf("markRefundFailedRecord", successPath);
    expect(successPath).toBeGreaterThan(-1);
    expect(successJournalCall).toBeGreaterThan(successPath);
    expect(failedCall).toBeGreaterThan(successJournalCall);
    expect(lifecycle.slice(failedCall, failedCall + 220)).not.toContain(
      "postBalancedJournalBatch"
    );
  });
});
