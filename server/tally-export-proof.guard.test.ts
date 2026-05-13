import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  buildTallyCsvRows,
  defaultTallyLedgerMapping,
  deterministicSha256,
  generateTallyCsvExport,
  toTallyCsv,
} from "./services/tallyExport";

function createFakeDb() {
  const runs: Record<string, unknown>[] = [];
  return {
    runs,
    async findTallyExportRun(input: Record<string, unknown>) {
      return (
        runs.find(
          run =>
            run.storeId === input.storeId &&
            run.exportType === input.exportType &&
            run.checksum === input.checksum &&
            String(run.periodStart) === String(input.periodStart) &&
            String(run.periodEnd) === String(input.periodEnd)
        ) ?? null
      );
    },
    async insertTallyExportRun(values: Record<string, unknown>) {
      const run = { id: runs.length + 1, ...values };
      runs.push(run);
      return run;
    },
  };
}

const ledgerRows = [
  {
    id: 1,
    storeId: 7,
    sourceType: "sale",
    sourceId: 101,
    entryDate: new Date("2026-04-01T10:00:00Z"),
    accountCode: "SALES",
    accountName: "Sales",
    debit: 0,
    credit: "100.00",
    narration: "Invoice INV-101",
  },
  {
    id: 2,
    storeId: 7,
    sourceType: "payment",
    sourceId: 101,
    entryDate: new Date("2026-04-01T10:00:00Z"),
    accountCode: "CASH",
    accountName: "Cash",
    debit: "100.00",
    credit: 0,
    narration: "Paid INV-101",
  },
  {
    id: 3,
    storeId: 7,
    sourceType: "gst_output",
    sourceId: 101,
    entryDate: new Date("2026-04-01T10:00:00Z"),
    accountCode: "OUTPUT_GST",
    accountName: "Output GST",
    debit: 0,
    credit: "12.00",
    narration: "GST INV-101",
  },
];

describe("tally export proof", () => {
  it("creates an export run row and never claims import/sync", async () => {
    const db = createFakeDb();
    const result = await generateTallyCsvExport(db, {
      exportType: "journal_csv",
      rows: ledgerRows,
      storeId: 7,
      periodStart: new Date("2026-04-01T00:00:00Z"),
      periodEnd: new Date("2026-04-30T23:59:59Z"),
      generatedBy: 9,
    });
    expect(result.status).toBe("generated");
    expect(result.imported).toBe(false);
    expect(result.synced).toBe(false);
    expect(result.providerState).toBe("provider_unconfigured_export_generated");
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0]).toMatchObject({
      status: "generated",
      storeId: 7,
      exportType: "journal_csv",
      generatedBy: 9,
      exportedAt: null,
      failureReason: null,
    });
  });

  it("blocks a duplicate export for store/type/period/checksum", async () => {
    const db = createFakeDb();
    const base = {
      exportType: "journal_csv",
      rows: ledgerRows,
      storeId: 7,
      periodStart: new Date("2026-04-01T00:00:00Z"),
      periodEnd: new Date("2026-04-30T23:59:59Z"),
    };
    const first = await generateTallyCsvExport(db, base);
    const second = await generateTallyCsvExport(db, base);
    expect(first.status).toBe("generated");
    expect(second.status).toBe("duplicate_blocked");
    expect(second.runId).toBe(first.runId);
    expect(db.runs).toHaveLength(1);
  });

  it("uses deterministic checksum serialization and changes checksum when data changes", () => {
    const a = deterministicSha256({ b: 2, a: [{ z: "same", n: 1 }] });
    const b = deterministicSha256({ a: [{ n: 1, z: "same" }], b: 2 });
    const c = deterministicSha256({ a: [{ n: 2, z: "same" }], b: 2 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("exports debit and credit CSV rows with GST ledger mapping", () => {
    const rows = buildTallyCsvRows(ledgerRows, {
      companyIdentifier: "STORE-7",
    });
    const csv = toTallyCsv(rows);
    expect(csv).toContain("debitAmount");
    expect(csv).toContain("creditAmount");
    expect(csv).toContain('"100.00"');
    expect(rows.some(row => row.debitAmount === "100.00")).toBe(true);
    expect(rows.some(row => row.creditAmount === "100.00")).toBe(true);
    expect(rows.some(row => row.gstLedgerMapping === "Output GST")).toBe(true);
    expect(
      defaultTallyLedgerMapping({
        sourceType: "gst_input",
        accountCode: "INPUT_GST",
        accountName: "Input GST",
      })
    ).toBe("Input GST");
  });

  it("persists failed status with failure reason when generation fails", async () => {
    const db = createFakeDb();
    const result = await generateTallyCsvExport(db, {
      exportType: "journal_csv",
      rows: [{ id: 99, debit: 0, credit: 0 }],
      storeId: 7,
    });
    expect(result.status).toBe("failed");
    expect(result.failureReason).toContain("neither debit nor credit");
    expect(db.runs).toHaveLength(1);
    expect(db.runs[0].status).toBe("failed");
    expect(db.runs[0].failureReason).toContain("neither debit nor credit");
    expect(result.imported).toBe(false);
    expect(result.synced).toBe(false);
  });

  it("documents export proof migration and schema fields", () => {
    const migration = fs.readFileSync(
      "drizzle/0040_tally_export_proof.sql",
      "utf8"
    );
    const schema = fs
      .readdirSync("drizzle/schema")
      .filter(f => f.endsWith(".ts") && f !== "index.ts")
      .map(f => fs.readFileSync(`drizzle/schema/${f}`, "utf8"))
      .join("\n");
    expect(migration).toContain("uq_tally_export_proof_window");
    expect(schema).toContain("periodStart");
    expect(schema).toContain("exportedAt");
    expect(schema).toContain("failureReason");
  });
});
