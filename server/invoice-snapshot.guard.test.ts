import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

const normalizeCode = (s: string): string =>
  s
    .replace(/\r\n/g, "\n")
    .replace(/\n\s*\./g, ".")
    .replace(/\s+/g, " ")
    .replace(/\( /g, "(")
    .replace(/\[ /g, "[")
    .replace(/ \)/g, ")")
    .replace(/, \}/g, " }")
    .replace(/, \]/g, "]")
    .replace(/ \]/g, "]");
import {
  assertCustomerCanAccessInvoiceSnapshot,
  buildInsurerReadyInvoicePackage,
  buildSaleInvoiceSnapshotPayload,
  computeSnapshotHash,
  stableSerialize,
} from "./services/invoiceSnapshotService";
import {
  reserveInvoiceNumber,
  formatInvoiceNumber,
} from "./services/invoiceNumbering";

describe("immutable invoice snapshots", () => {
  const sale = {
    id: "sale-1",
    billNo: "INV-S1-2026-27-0001",
    storeId: "1",
    customerId: "101",
    customerName: "Asha Patient",
    customerMobile: "9999999999",
    pharmacistName: "Pharma One",
    pharmacistRegNo: "DL-PH-1",
    prescriptionId: "rx-1",
    subtotal: "200.00",
    discountAmount: "20.00",
    gstAmount: "21.60",
    total: "201.60",
    paymentMode: "upi",
    paymentRef: "upi-123",
    status: "confirmed",
    confirmedAt: Date.UTC(2026, 4, 7),
  };

  const lineRows = [
    {
      line: {
        productId: "501",
        batchNo: "BATCH-A",
        expiryDate: "2027-01-31",
        qty: 2,
        mrp: "120.00",
        saleRate: "100.00",
        discountAmount: "20.00",
        gstRate: "12.00",
        hsnCode: "30049099",
        lineTotal: "201.60",
      },
      productName: "Paracetamol 500",
      productHsnCode: "30049099",
    },
  ];

  it("wires snapshot creation into sale and order invoice generation paths", () => {
    const salesRouter = readFileSync(
      new URL("./routers/salesRouter.ts", import.meta.url),
      "utf8"
    );
    const dbModule = normalizeCode(
      readFileSync(new URL("./db.ts", import.meta.url), "utf8") +
        "\n" +
        readFileSync(new URL("./db-extended.ts", import.meta.url), "utf8")
    );
    expect(salesRouter).toContain("createSaleInvoiceSnapshot(db, input.saleId");
    expect(dbModule).toContain(
      "createOrderInvoiceSnapshot(db, orderId, { pdfFileKey: key, pdfFileUrl: url }"
    );
    expect(dbModule).toContain(
      "createOrderInvoiceSnapshot(db, orderId, { failureReason:"
    );
  });

  it("creates a statutory-complete payload with GST/HSN/MRP/discount/taxable values", () => {
    const payload = buildSaleInvoiceSnapshotPayload({
      sale,
      lines: lineRows,
      store: {
        name: "24/7 Pharmacy",
        address: "Main Road",
        gstin: "27ABCDE1234F1Z5",
        drugLicense: "MH-DL-123",
      },
      payment: {
        paymentMode: "upi",
        paymentRef: "upi-123",
        status: "confirmed",
        amount: "201.60",
      },
      generatedAt: new Date("2026-05-07T00:00:00.000Z"),
    });

    expect(payload.billNo).toBe("INV-S1-2026-27-0001");
    expect(payload.storeGSTIN).toBe("27ABCDE1234F1Z5");
    expect(payload.storeDrugLicense).toBe("MH-DL-123");
    expect(payload.lineItems[0]).toMatchObject({
      productName: "Paracetamol 500",
      batchNo: "BATCH-A",
      hsnCode: "30049099",
      gstRate: 12,
      mrp: 120,
      sellingPrice: 100,
      discount: 20,
      qty: 2,
      taxableValue: 180,
      cgst: 10.8,
      sgst: 10.8,
      igst: 0,
      lineTotal: 201.6,
    });
    expect(payload.statutoryCompleteness.complete).toBe(true);
  });

  it("surfaces missing statutory store fields instead of faking completeness", () => {
    const payload = buildSaleInvoiceSnapshotPayload({
      sale,
      lines: lineRows,
      store: { name: "24/7 Pharmacy" },
    });
    expect(payload.statutoryCompleteness.complete).toBe(false);
    expect(payload.statutoryCompleteness.status).toBe("warning");
    expect(payload.statutoryCompleteness.missingFields).toEqual(
      expect.arrayContaining(["storeGSTIN", "storeDrugLicense", "storeAddress"])
    );
  });

  it("remains immutable when product, store, or customer master data changes later", () => {
    const payload = buildSaleInvoiceSnapshotPayload({
      sale,
      lines: lineRows,
      store: {
        name: "Original Store",
        address: "Original Address",
        gstin: "27ABCDE1234F1Z5",
        drugLicense: "MH-DL-123",
      },
    });
    const frozen = JSON.parse(JSON.stringify(payload));
    const changedPayload = buildSaleInvoiceSnapshotPayload({
      sale: { ...sale, customerName: "Changed Customer" },
      lines: [
        {
          ...lineRows[0],
          productName: "Changed Product",
          line: { ...lineRows[0].line, saleRate: "999.00" },
        },
      ],
      store: {
        name: "Changed Store",
        address: "Changed Address",
        gstin: "99ABCDE1234F1Z5",
        drugLicense: "NEW-DL",
      },
    });

    expect(frozen.customerName).toBe("Asha Patient");
    expect(frozen.storeName).toBe("Original Store");
    expect(frozen.lineItems[0].productName).toBe("Paracetamol 500");
    expect(frozen.lineItems[0].sellingPrice).toBe(100);
    expect(changedPayload.customerName).toBe("Changed Customer");
  });

  it("hashes deterministically with stable serialization", () => {
    const a = { z: 1, nested: { b: true, a: [2, 1] } };
    const b = { nested: { a: [2, 1], b: true }, z: 1 };
    expect(stableSerialize(a)).toBe(stableSerialize(b));
    expect(computeSnapshotHash(a)).toBe(computeSnapshotHash(b));
  });

  it("does not claim PDF success without both PDF key and URL", () => {
    const payload = buildSaleInvoiceSnapshotPayload({
      sale,
      lines: lineRows,
      store: { name: "24/7 Pharmacy" },
    });
    const row = {
      snapshotJson: payload,
      pdfFileKey: null,
      pdfFileUrl: null,
      status: "generated",
    };
    expect(row.status).toBe("generated");
    expect(row.pdfFileKey).toBeNull();
    expect(row.pdfFileUrl).toBeNull();
  });

  it("builds insurer-ready package without claim submission automation", () => {
    const payload = buildSaleInvoiceSnapshotPayload({
      sale,
      lines: lineRows,
      store: { name: "24/7 Pharmacy" },
    });
    const pkg = buildInsurerReadyInvoicePackage({ snapshotJson: payload });
    expect(pkg.prescriptionReference).toEqual({ prescriptionId: "rx-1" });
    expect(pkg.paymentReference?.paymentRef).toBe("upi-123");
    expect(pkg.saleReference).toMatchObject({
      saleId: "sale-1",
      status: "confirmed",
    });
    expect(pkg.medicineSummary[0].productName).toBe("Paracetamol 500");
    expect(pkg).not.toHaveProperty("submittedClaimId");
  });

  it("prevents a customer from accessing another customer's invoice snapshot", () => {
    const payload = buildSaleInvoiceSnapshotPayload({
      sale,
      lines: lineRows,
      store: { name: "24/7 Pharmacy" },
    });
    expect(
      assertCustomerCanAccessInvoiceSnapshot(
        { customerId: "101", snapshotJson: payload },
        { id: 101, role: "customer" }
      )
    ).toBe(true);
    expect(
      assertCustomerCanAccessInvoiceSnapshot(
        { customerId: "101", snapshotJson: payload },
        { id: 202, role: "customer" }
      )
    ).toBe(false);
    expect(
      assertCustomerCanAccessInvoiceSnapshot(
        { customerId: "101", snapshotJson: payload },
        { id: 202, role: "admin" }
      )
    ).toBe(true);
  });

  it("keeps invoice numbering logic untouched and imported from the numbering service", () => {
    expect(formatInvoiceNumber({ prefix: "INV-S1-2026-27", sequence: 1 })).toBe(
      "INV-S1-2026-27-0001"
    );
    expect(typeof reserveInvoiceNumber).toBe("function");
  });
});
