import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  formatInvoiceNumber,
  buildDraftBillNumber,
  financialYearFromIndiaBusinessDate,
  reserveInvoiceNumber,
} from "./services/invoiceNumbering";

const normalizeCode = (s: string): string =>
  s
    .replace(/\r\n/g, "\n")
    .replace(/\n\s*\./g, ".")
    .replace(/\s+/g, " ")
    .replace(/\( /g, "(")
    .replace(/\[ /g, "[")
    .replace(/ \)/g, ")")
    .replace(/, \]/g, "]")
    .replace(/ \]/g, "]");

describe("invoice numbering foundation", () => {
  it("formats sequence deterministically", () => {
    expect(formatInvoiceNumber({ prefix: "INV-S1-2026-27", sequence: 1 })).toBe(
      "INV-S1-2026-27-0001"
    );
  });

  it("draft bill numbering does not issue statutory final number and avoids same-second collisions", () => {
    const date = new Date("2026-05-07T00:00:00.000Z");
    const first = buildDraftBillNumber("1", date);
    const second = buildDraftBillNumber("1", date);
    expect(first).toContain("DRF-S1-");
    expect(first).not.toBe(second);
  });

  it("calculates financial year using Asia/Kolkata business date boundaries", () => {
    expect(
      financialYearFromIndiaBusinessDate(new Date("2026-03-31T18:29:00.000Z"))
    ).toBe("2025-26"); // Mar 31 23:59 IST
    expect(
      financialYearFromIndiaBusinessDate(new Date("2026-03-31T18:31:00.000Z"))
    ).toBe("2026-27"); // Apr 1 00:01 IST
    expect(
      financialYearFromIndiaBusinessDate(new Date("2026-03-31T20:00:00.000Z"))
    ).toBe("2026-27"); // UTC date differs from IST business date
  });

  it("reserves unique numbers for concurrent callers through the safe helper", async () => {
    let sequence: any = null;
    let lock = Promise.resolve();
    const makeSelect = (fields?: unknown) => ({
      from: () => ({
        where: () => ({
          for: () => ({
            limit: async () =>
              fields ? [] : sequence ? [{ ...sequence }] : [],
          }),
          limit: async () => (fields ? [] : sequence ? [{ ...sequence }] : []),
        }),
      }),
    });
    const db: any = {
      select: makeSelect,
      update: () => ({
        set: (values: any) => ({
          where: async () => {
            sequence = { ...sequence, ...values };
          },
        }),
      }),
      insert: () => ({
        values: async (values: any) => {
          if (sequence) {
            const err: any = new Error("duplicate");
            err.code = "ER_DUP_ENTRY";
            throw err;
          }
          sequence = { id: 1, ...values };
        },
      }),
      transaction: async (fn: any) => {
        const previous = lock;
        let release!: () => void;
        lock = new Promise<void>(resolve => {
          release = resolve;
        });
        await previous;
        try {
          return await fn(db);
        } finally {
          release();
        }
      },
    };

    const results = await Promise.all([
      reserveInvoiceNumber(
        db,
        "1",
        "sale_invoice",
        new Date("2026-04-02T00:00:00.000Z")
      ),
      reserveInvoiceNumber(
        db,
        "1",
        "sale_invoice",
        new Date("2026-04-02T00:00:00.000Z")
      ),
      reserveInvoiceNumber(
        db,
        "1",
        "sale_invoice",
        new Date("2026-04-02T00:00:00.000Z")
      ),
    ]);
    expect(new Set(results).size).toBe(3);
    expect(results).toEqual([
      "INV-S1-2026-27-0001",
      "INV-S1-2026-27-0002",
      "INV-S1-2026-27-0003",
    ]);
  });

  it("uses transaction/lock-safe reservation and caller helpers for invoice/return/credit numbers", () => {
    const src = fs.readFileSync("server/services/invoiceNumbering.ts", "utf8");
    const salesRouter =
      fs.readFileSync("server/routers/salesRouter.ts", "utf8") +
      fs.readFileSync("server/routers/salesRouterExtension.ts", "utf8");
    expect(src).toContain("db.transaction");
    expect(src).toContain('for("update")');
    expect(src).toContain("LAST_INSERT_ID");
    expect(src).toContain("for (let attempt = 0; attempt < 3");
    expect(src).toContain("financialYearFromIndiaBusinessDate");
    expect(salesRouter).toContain(
      'reserveInvoiceNumber(db, sale.storeId, "sale_invoice")'
    );
    expect(salesRouter).toContain("generateReturnNoteNumber(db, sale.storeId)");
  });

  it("keeps DB unique constraints for statutory numbers and sequence identity", () => {
    const schema = normalizeCode(
      fs
        .readdirSync("drizzle/schema")
        .filter(f => f.endsWith(".ts") && f !== "index.ts")
        .map(f => fs.readFileSync(`drizzle/schema/${f}`, "utf8"))
        .join("\n")
    );
    const migration = fs.readFileSync(
      "drizzle/0027_invoice_sequences.sql",
      "utf8"
    );
    expect(schema).toContain('uniqueIndex("uq_sales_bill_no").on(t.billNo)');
    expect(schema).toContain(
      'uniqueIndex("uq_sale_returns_return_no").on(t.returnNo)'
    );
    expect(schema).toContain(
      'uniqueIndex("uq_invoice_seq_store_fy_doc").on(t.storeId, t.financialYear, t.documentType)'
    );
    expect(migration).toContain(
      "CONSTRAINT `uq_invoice_seq_store_fy_doc` UNIQUE(`store_id`,`financial_year`,`document_type`)"
    );
    expect(migration).toContain(
      "ALTER TABLE `sales` ADD CONSTRAINT `uq_sales_bill_no` UNIQUE(`bill_no`)"
    );
    expect(migration).toContain(
      "ALTER TABLE `sale_returns` ADD CONSTRAINT `uq_sale_returns_return_no` UNIQUE(`return_no`)"
    );
  });
});
