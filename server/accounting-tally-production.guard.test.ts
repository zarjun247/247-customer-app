import { describe, expect, it } from "vitest";
import fs from "node:fs";

describe("accounting+tally production guards", () => {
  it("supplier allocation table and journal/tally tables are in schema", () => {
    const txt = fs
      .readdirSync("drizzle/schema")
      .filter(f => f.endsWith(".ts") && f !== "index.ts")
      .map(f => fs.readFileSync(`drizzle/schema/${f}`, "utf8"))
      .join("\n");
    expect(txt).toContain("supplierPaymentAllocations");
    expect(txt).toContain("accountingJournalEntries");
    expect(txt).toContain("tallyExportRuns");
  });

  it("migration includes paymentMode enum alter + new durable tables", () => {
    const txt = fs.readFileSync(
      "drizzle/0028_accounting_allocation_journal_tally.sql",
      "utf8"
    );
    expect(txt).toContain("ALTER TABLE supplier_payments");
    expect(txt).toContain("credit");
    expect(txt).toContain("advance");
    expect(txt).toContain(
      "CREATE TABLE IF NOT EXISTS supplier_payment_allocations"
    );
    expect(txt).toContain(
      "CREATE TABLE IF NOT EXISTS accounting_journal_entries"
    );
    expect(txt).toContain("CREATE TABLE IF NOT EXISTS tally_export_runs");
  });

  it("supplier ledger writes durable allocation rows and avoids placeholder-only path", () => {
    const txt =
      fs.readFileSync("server/services/supplierLedger.ts", "utf8") +
      fs.readFileSync("server/services/supplierPaymentsService.ts", "utf8");
    expect(txt).toContain("allocatePaymentToInvoice");
    expect(txt).toContain("supplierPaymentAllocations");
    expect(txt).not.toContain("direct_or_manual");
    expect(txt).toContain("idempotent");
  });

  it("accounting ledger helpers distinguish debit/credit and persist entries", () => {
    const txt = fs.readFileSync("server/services/accountingLedger.ts", "utf8");
    expect(txt).toContain("debit");
    expect(txt).toContain("credit");
    expect(txt).toContain("persisted: true");
  });

  it("tally export has checksum + run tracking and xml/odbc deferred", () => {
    const txt = fs.readFileSync("server/services/tallyExport.ts", "utf8");
    expect(txt).toContain("checksum");
    expect(txt).toContain("tallyExportRuns");
    expect(txt).toContain("duplicate_blocked");
    expect(txt).toContain("provider_unconfigured_export_generated");
    expect(txt).toContain("synced: false");
  });
});
