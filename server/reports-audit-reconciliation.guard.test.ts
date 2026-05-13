import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { redactSensitive } from "./_core/redact";
import {
  buildDailyGstReport,
  buildH1CompletenessReport,
  buildPaymentConsistencyReport,
  buildStockReconciliationReport,
  buildSupplierOutstandingReport,
  redactReportPayload,
} from "./services/reconciliationReports";

function scanUnsafeAuditReferencePatterns(source: string): string[] {
  const patterns = [
    /entityId:\s*0/g,
    /Number\(uuid\)/g,
    /Number\(line\.id\)/g,
    /Number\(saleId\)/g,
    /entityId:\s*Number\([^)]*uuid[^)]*\)/g,
    /entityId:\s*Number\([^)]*line\.id[^)]*\)/g,
  ];
  return patterns.flatMap(pattern =>
    [...source.matchAll(pattern)].map(match => match[0])
  );
}

describe("reports and reconciliation read-model guards", () => {
  it("stock reconciliation report uses canonical availability/read-model inputs and mismatch counts", () => {
    const report = buildStockReconciliationReport([
      {
        productId: 1,
        storeId: 10,
        productName: "Medicine",
        ledgerOnHand: 20,
        ledgerReserved: 2,
        activeReservationQty: 3,
        ledgerQuarantined: 1,
        ledgerExpired: 4,
        storeSkuStock: 20,
        storeSkuSoftLocked: 3,
        movementProjectedOnHand: 20,
        canonicalAvailable: 10,
        batchCount: 2,
      },
    ]);

    expect(report.rows[0].expectedCanonicalAvailable).toBe(10);
    expect(report.rows[0].canonicalAvailable).toBe(10);
    expect(report.mismatchCount).toBe(0);
    expect(report.csvData).toBe(report.rows);
  });

  it("H1 completeness report flags missing fields while tolerating current-main field names", () => {
    const report = buildH1CompletenessReport([
      {
        id: 1,
        storeId: 10,
        billNo: "",
        patientName: "Patient",
        patientPhone: null,
        drugName: "Schedule H1 Drug",
        batchNo: undefined,
        qty: 1,
        pharmacistId: 7,
        prescriptionRef: null,
        saleId: 22,
        prescribingDoctor: "Doctor",
      },
    ]);

    expect(report.rows[0].saleRef).toBe(22);
    expect(report.rows[0].doctorName).toBe("Doctor");
    expect(report.rows[0].missingFlags).toEqual(
      expect.arrayContaining([
        "billNo",
        "patientPhone",
        "batchNo",
        "prescriptionRef",
        "saleLineRef",
      ])
    );
    expect(report.totals.incompleteCount).toBe(1);
  });

  it("payment/refund/invoice consistency report returns rows, totals, csvData, and mismatchCount", () => {
    const report = buildPaymentConsistencyReport([
      {
        orderId: 1,
        storeId: 10,
        status: "delivered",
        orderTotal: "100.00",
        paidAmountPaise: 10000,
        paymentRecordCount: 1,
        paidRecordCount: 1,
        invoiceKey: "invoices/bill.pdf",
        billNoCount: 1,
        distinctBillNoCount: 1,
      },
    ]);

    expect(report.rows).toHaveLength(1);
    expect(report.totals.orderTotal).toBe(100);
    expect(report.csvData).toBe(report.rows);
    expect(report.mismatchCount).toBe(0);
  });

  it("supplier outstanding report returns current payable totals", () => {
    const report = buildSupplierOutstandingReport([
      {
        supplierId: 1,
        supplierName: "Supplier",
        storeId: 10,
        invoiceTotal: "500.00",
        paymentTotal: "125.00",
        returnCreditTotal: "25.00",
        committedInvoiceCount: 2,
      },
    ]);

    expect(report.rows[0].outstandingAmount).toBe(350);
    expect(report.totals.outstandingAmount).toBe(350);
    expect(report.csvData).toBe(report.rows);
  });

  it("daily sale GST report returns rows, totals, and csvData", () => {
    const report = buildDailyGstReport([
      {
        date: "2026-05-07",
        storeId: 10,
        taxableValue: "90.00",
        gstAmount: "10.00",
        grossSales: "100.00",
        discounts: 0,
        refundsOrReturns: 0,
        invoiceCount: 1,
      },
    ]);

    expect(report.rows[0].grossSales).toBe(100);
    expect(report.totals.gstAmount).toBe(10);
    expect(report.csvData).toBe(report.rows);
  });

  it("report router reconciliation procedures are read-only for stock/payment/invoice state", () => {
    const source = fs.readFileSync("server/routers/reportsRouter.ts", "utf8");
    for (const procedure of [
      "stockReconciliation",
      "paymentInvoiceConsistency",
      "supplierOutstanding",
      "dailySaleGst",
    ]) {
      const start = source.indexOf(`${procedure}: protectedProcedure`);
      const next = source.indexOf(
        ": protectedProcedure",
        start + procedure.length
      );
      const block = source.slice(start, next === -1 ? undefined : next);
      expect(block).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
  });
});

describe("audit reference hygiene guards", () => {
  it("scanner catches Number(uuid), Number(line.id), Number(saleId), and entityId: 0 patterns", () => {
    const sample =
      "entityId: 0; entityId: Number(uuid); Number(line.id); Number(saleId);";
    expect(scanUnsafeAuditReferencePatterns(sample)).toEqual(
      expect.arrayContaining([
        "entityId: 0",
        "Number(uuid)",
        "Number(line.id)",
        "Number(saleId)",
      ])
    );
  });

  it("blocks unsafe audit reference casts in current H1/statutory report paths", () => {
    const files = [
      "server/services/complianceGate.ts",
      "server/routers/reportsRouter.ts",
    ];
    const findings = files.flatMap(file =>
      scanUnsafeAuditReferencePatterns(fs.readFileSync(file, "utf8")).map(
        match => `${file}: ${match}`
      )
    );
    expect(findings).toEqual([]);
  });
});

describe("sensitive report/audit payload redaction guard", () => {
  it("redacts prescription image data, OTPs, payment signatures/secrets, and auth cookies/tokens", () => {
    const raw =
      "otp=123456 signature=pay_sig secret=topsecret Authorization: Bearer abc.def.ghi Cookie: auth=token123 prescriptionImage=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    const redacted = redactSensitive(raw);
    expect(redacted).not.toContain("123456");
    expect(redacted).not.toContain("pay_sig");
    expect(redacted).not.toContain("topsecret");
    expect(redacted).not.toContain("abc.def.ghi");
    expect(redacted).not.toContain("auth=token123");
    expect(redacted).not.toContain("iVBORw0KGgo");
  });

  it("redacts report payload objects before audit/log exposure", () => {
    const redacted = redactReportPayload({
      otp: "123456",
      gatewaySignature: "sig_secret",
      cookie: "session=rawtoken",
      image: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD",
    });
    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("123456");
    expect(serialized).not.toContain("sig_secret");
    expect(serialized).not.toContain("rawtoken");
    expect(serialized).not.toContain("/9j/4AAQ");
  });
});
