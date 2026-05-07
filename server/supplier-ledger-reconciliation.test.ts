import { describe, expect, it } from "vitest";
import { buildSupplierReconciliationReport } from "./services/supplierLedger";

const asOfDate = new Date("2026-05-01T00:00:00Z");

describe("supplier ageing and reconciliation", () => {
  it("allocates one payment partially across multiple invoices and reduces outstanding", () => {
    const report = buildSupplierReconciliationReport({
      asOfDate,
      invoices: [
        { id: 101, supplierId: 1, supplierName: "Acme", storeId: 10, invoiceNo: "A-1", invoiceDate: "2026-04-20", netAmount: "100.00", status: "committed" },
        { id: 102, supplierId: 1, supplierName: "Acme", storeId: 10, invoiceNo: "A-2", invoiceDate: "2026-04-10", netAmount: "200.00", status: "committed" },
      ],
      allocations: [
        { supplierPaymentId: 900, purchaseInvoiceId: 101, amount: "100.00", allocationType: "invoice_payment" },
        { supplierPaymentId: 900, purchaseInvoiceId: 102, amount: "50.00", allocationType: "invoice_payment" },
      ],
    });

    expect(report.rows).toMatchObject([
      { purchaseInvoiceId: 101, invoiceAmount: 100, paidAmount: 100, outstandingAmount: 0, reconciliationStatus: "internal_settled" },
      { purchaseInvoiceId: 102, invoiceAmount: 200, paidAmount: 50, outstandingAmount: 150, reconciliationStatus: "internal_open" },
    ]);
    expect(report.totals).toMatchObject({ invoiceAmount: 300, paidAmount: 150, allocatedAmount: 150, outstandingAmount: 150 });
  });

  it("reduces outstanding by debit notes and committed purchase returns", () => {
    const report = buildSupplierReconciliationReport({
      asOfDate,
      invoices: [
        { id: 201, supplierId: 2, supplierName: "Beta", storeId: 20, invoiceNo: "B-1", invoiceDate: "2026-03-15", netAmount: "500.00", status: "partially_returned" },
      ],
      allocations: [
        { supplierPaymentId: 901, purchaseInvoiceId: 201, amount: "75.00", allocationType: "debit_note" },
      ],
      purchaseReturns: [
        { id: 301, purchaseInvoiceId: 201, supplierId: 2, storeId: 20, totalAmount: "125.00", status: "committed" },
        { id: 302, purchaseInvoiceId: 201, supplierId: 2, storeId: 20, totalAmount: "999.00", status: "draft" },
      ],
    });

    expect(report.rows[0]).toMatchObject({ invoiceAmount: 500, debitNotes: 75, purchaseReturns: 125, allocatedAmount: 200, outstandingAmount: 300 });
    expect(report.totals.outstandingAmount).toBe(300);
  });

  it("places outstanding invoices in ageing buckets using due date when present", () => {
    const report = buildSupplierReconciliationReport({
      asOfDate,
      invoices: [
        { id: 1, supplierId: 1, supplierName: "Acme", storeId: 10, invoiceDate: "2026-04-15", netAmount: "10.00", status: "committed" },
        { id: 2, supplierId: 1, supplierName: "Acme", storeId: 10, invoiceDate: "2026-02-01", dueDate: "2026-03-20", netAmount: "20.00", status: "committed" },
        { id: 3, supplierId: 1, supplierName: "Acme", storeId: 10, invoiceDate: "2026-02-01", netAmount: "30.00", status: "committed" },
        { id: 4, supplierId: 1, supplierName: "Acme", storeId: 10, invoiceDate: "2026-01-15", netAmount: "40.00", status: "committed" },
      ],
    });

    expect(report.ageing[0]).toMatchObject({
      supplierId: 1,
      totalOutstanding: 100,
      bucket0To30: 10,
      bucket31To60: 20,
      bucket61To90: 30,
      bucket90Plus: 40,
      invoiceCount: 4,
    });
  });

  it("keeps store balances isolated when caller filters invoice inputs", () => {
    const report = buildSupplierReconciliationReport({
      asOfDate,
      invoices: [
        { id: 401, supplierId: 4, supplierName: "Delta", storeId: 40, invoiceDate: "2026-04-01", netAmount: "80.00", status: "committed" },
      ],
      allocations: [
        { supplierPaymentId: 902, purchaseInvoiceId: 401, amount: "30.00", allocationType: "invoice_payment" },
        { supplierPaymentId: 903, purchaseInvoiceId: 999, amount: "500.00", allocationType: "invoice_payment" },
      ],
    });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toMatchObject({ storeId: 40, outstandingAmount: 50 });
    expect(report.totals.outstandingAmount).toBe(50);
  });

  it("reconciles invoice minus allocations and credits without fake external statuses", () => {
    const report = buildSupplierReconciliationReport({
      asOfDate,
      invoices: [
        { id: 501, supplierId: 5, supplierName: "Echo", storeId: 50, invoiceDate: "2026-04-01", netAmount: "1000.00", status: "committed" },
      ],
      allocations: [
        { supplierPaymentId: 904, purchaseInvoiceId: 501, amount: "250.00", allocationType: "invoice_payment" },
        { supplierPaymentId: 905, purchaseInvoiceId: 501, amount: "50.00", allocationType: "debit_note" },
      ],
      purchaseReturns: [{ id: 601, purchaseInvoiceId: 501, supplierId: 5, storeId: 50, totalAmount: "100.00", status: "committed" }],
      advances: [{ id: 701, supplierId: 5, storeId: 50, amount: "75.00", allocatedAmount: "25.00", paymentMode: "advance" }],
    });

    expect(report.totals.outstandingAmount).toBe(600);
    expect(report.rows[0].outstandingAmount).toBe(report.rows[0].invoiceAmount - report.rows[0].allocatedAmount);
    expect(report.rows[0].advances).toBe(50);
    expect(["internal_open", "internal_settled"]).toContain(report.rows[0].reconciliationStatus);
    expect(report.csvData).not.toMatch(/synced|reconciled/i);
  });
});
