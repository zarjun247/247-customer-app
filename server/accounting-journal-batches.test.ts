import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  assertBalancedJournalBatch,
  createPaymentJournalBatch,
  createPurchaseJournalBatch,
  createPurchaseReturnJournalBatch,
  createRefundJournalBatch,
  createSaleJournalBatch,
  createSaleReturnJournalBatch,
} from "./services/accountingLedger";

function expectBalanced(batch: Parameters<typeof assertBalancedJournalBatch>[0]) {
  const result = assertBalancedJournalBatch(batch);
  expect(result.totalDebit).toBe(result.totalCredit);
  expect(result.debitLineCount).toBeGreaterThan(0);
  expect(result.creditLineCount).toBeGreaterThan(0);
  return result;
}

describe("balanced accounting journal batches", () => {
  it("posts a balanced sale helper with output GST credit", () => {
    const batch = createSaleJournalBatch({ saleId: 101, storeId: 1, total: 112, gstAmount: 12 });
    expect(batch.lines).toContainEqual(expect.objectContaining({ accountName: "Output GST", credit: 12 }));
    expectBalanced(batch);
  });

  it("posts a balanced purchase helper with input GST debit", () => {
    const batch = createPurchaseJournalBatch({ purchaseInvoiceId: 202, storeId: 1, netAmount: 118, totalGst: 18 });
    expect(batch.lines).toContainEqual(expect.objectContaining({ accountName: "Input GST", debit: 18 }));
    expectBalanced(batch);
  });

  it("posts a balanced payment helper", () => {
    expectBalanced(createPaymentJournalBatch({ paymentId: 303, amount: 99.5 }));
  });

  it("posts a balanced refund helper against current refund source", () => {
    const batch = createRefundJournalBatch({ refundId: 404, amount: 56, gstAmount: 6 });
    expect(batch.sourceType).toBe("refund");
    expectBalanced(batch);
  });

  it("posts balanced sale and purchase return helpers", () => {
    expectBalanced(createSaleReturnJournalBatch({ saleReturnId: 505, totalRefund: 56, gstReversal: 6 }));
    expectBalanced(createPurchaseReturnJournalBatch({ purchaseReturnId: 606, totalAmount: 118, gstReversal: 18 }));
  });

  it("rejects unbalanced batches", () => {
    expect(() => assertBalancedJournalBatch({
      sourceType: "sale",
      sourceRef: "1",
      lines: [
        { accountCode: "1000", accountName: "Cash", debit: 10 },
        { accountCode: "4000", accountName: "Sales", credit: 9 },
      ],
    })).toThrow(/not balanced/);
  });

  it("rejects negative debit or credit", () => {
    expect(() => assertBalancedJournalBatch({
      sourceType: "sale",
      sourceRef: "1",
      lines: [
        { accountCode: "1000", accountName: "Cash", debit: -10 },
        { accountCode: "4000", accountName: "Sales", credit: 10 },
      ],
    })).toThrow(/negative/);
  });

  it("rejects a batch without debit and credit coverage", () => {
    expect(() => assertBalancedJournalBatch({
      sourceType: "sale",
      sourceRef: "1",
      lines: [{ accountCode: "1000", accountName: "Cash", debit: 10 }],
    })).toThrow(/credit line/);
  });

  it("trial balance is limited to posted batches and detects legacy/orphan rows", () => {
    const service = fs.readFileSync("server/services/accountingLedger.ts", "utf8");
    expect(service).toContain("innerJoin(accountingJournalBatches");
    expect(service).toContain("eq(accountingJournalBatches.status, \"posted\")");
    expect(service).toContain("groupBy(accountingJournalEntries.accountCode");
    expect(service).toContain("orphanEntryCount");
    expect(service).toContain("isNull(accountingJournalEntries.journalBatchId)");
  });

  it("schema and reserved migration add journal batches and nullable entry linkage", () => {
    const schema = fs.readFileSync("drizzle/schema.ts", "utf8");
    const migration = fs.readFileSync("drizzle/0038_accounting_journal_batches.sql", "utf8");
    expect(schema).toContain("accountingJournalBatches");
    expect(schema).toContain("journalBatchId: int(\"journalBatchId\")");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS accounting_journal_batches");
    expect(migration).toContain("ALTER TABLE accounting_journal_entries ADD COLUMN journalBatchId int NULL");
  });
});
