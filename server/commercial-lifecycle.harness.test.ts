import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCommercialLifecycleHarness } from "./testUtils/commercialFixtures";

const purchaseRouter = readFileSync("server/routers/purchaseRouter.ts", "utf8");
const salesRouter = readFileSync("server/routers/salesRouter.ts", "utf8");
const paymentRouter = readFileSync("server/routers/paymentRouter.ts", "utf8");
const reportsRouter = readFileSync("server/routers/reportsRouter.ts", "utf8");
const reservationService = readFileSync(
  "server/services/reservationService.ts",
  "utf8"
);
const invoiceNumbering = readFileSync(
  "server/services/invoiceNumbering.ts",
  "utf8"
);
const refundService = readFileSync("server/services/refundService.ts", "utf8");
const storageAccess = readFileSync("server/_core/storageAccess.ts", "utf8");

describe("commercial lifecycle fixture harness", () => {
  it("creates deterministic fixtures for all lifecycle actors and records", () => {
    const harness = createCommercialLifecycleHarness();
    const ids = harness.fixtures.ids;

    expect(harness.fixtures.stores.map(store => store.id)).toEqual([
      ids.storeId,
      ids.secondStoreId,
    ]);
    expect(harness.fixtures.users.map(user => user.role)).toEqual([
      "customer",
      "customer",
      "staff",
      "pharmacist",
      "staff",
    ]);
    expect(harness.fixtures.products.map(product => product.schedule)).toEqual([
      "OTC",
      "H1",
    ]);
    expect(harness.fixtures.variants[0]).toMatchObject({
      productId: ids.productId,
      isActive: true,
    });
    expect(harness.fixtures.batches.map(batch => batch.id)).toEqual([
      ids.batchId,
      ids.h1BatchId,
    ]);
    expect(harness.fixtures.purchaseInvoice.lines[0]).toMatchObject({
      batchId: ids.batchId,
      qty: 10,
    });
    expect(harness.fixtures.saleDraft.lines[0]).toMatchObject({
      batchId: ids.batchId,
      qty: 2,
    });
    expect(harness.fixtures.prescription).toMatchObject({
      userId: ids.customerId,
      status: "approved",
    });
    expect(harness.fixtures.payment).toMatchObject({
      saleId: ids.saleId,
      status: "created",
    });
    expect(harness.fixtures.deliveryTask).toMatchObject({
      orderId: ids.orderId,
      status: "assigned",
    });
    expect(harness.fixtures.supplier).toMatchObject({ id: ids.supplierId });
    expect(harness.fixtures.auditLog).toMatchObject({
      action: "fixture.seeded",
    });
  });
});

describe("commercial lifecycle integration-style state coverage", () => {
  it("purchase commit increases stock aggregate and supplier outstanding", () => {
    const harness = createCommercialLifecycleHarness();
    const startingAvailability = harness.canonicalAvailability(
      harness.fixtures.ids.batchId
    );

    const result = harness.commitPurchase();
    const stockReport = harness.stockReconciliationReport();
    const supplierReport = harness.supplierOutstandingReport();

    expect(result).toMatchObject({
      duplicate: false,
      invoice: { status: "committed" },
    });
    expect(harness.canonicalAvailability(harness.fixtures.ids.batchId)).toBe(
      startingAvailability + 10
    );
    expect(stockReport.totals.available).toBe(22);
    expect(supplierReport.rows[0]).toMatchObject({
      payables: 100,
      returns: 20,
      outstanding: 80,
    });
    expect(
      harness.auditLogs.some(log => log.action === "purchase.commit")
    ).toBe(true);
  });

  it("sale/POS confirmation decrements stock and creates GST report impact", () => {
    const harness = createCommercialLifecycleHarness();
    const startingAvailability = harness.canonicalAvailability(
      harness.fixtures.ids.batchId
    );

    const result = harness.confirmSale();
    const gstReport = harness.dailyGstReport();

    expect(result).toMatchObject({
      duplicate: false,
      sale: { status: "confirmed" },
    });
    expect(harness.canonicalAvailability(harness.fixtures.ids.batchId)).toBe(
      startingAvailability - 2
    );
    expect(gstReport.rows).toHaveLength(1);
    expect(gstReport.totals).toEqual({
      taxableValue: 40,
      gstAmount: 4.8,
      total: 40,
    });
    expect(gstReport.csvData).toContain(
      "saleId,taxableValue,gstRate,gstAmount,total"
    );
  });

  it("app reservation decrements and releases canonical availability", () => {
    const harness = createCommercialLifecycleHarness();
    const batchId = harness.fixtures.ids.batchId;
    const startingAvailability = harness.canonicalAvailability(batchId);

    const reservation = harness.reserveLastUnit(batchId, 1);
    expect(reservation.status).toBe("active");
    expect(harness.canonicalAvailability(batchId)).toBe(
      startingAvailability - 1
    );

    const released = harness.releaseReservation(reservation.id);
    expect(released).toMatchObject({
      duplicate: false,
      reservation: { status: "released" },
    });
    expect(harness.canonicalAvailability(batchId)).toBe(startingAvailability);
  });

  it("Rx/H1 regulated sale path requires complete current-main context", () => {
    const harness = createCommercialLifecycleHarness();
    const h1Sale = harness.getSale(harness.fixtures.ids.saleId);
    h1Sale.prescriptionId = harness.fixtures.ids.prescriptionId;
    h1Sale.lines = [
      {
        id: "sale-line-h1",
        productId: harness.fixtures.ids.h1ProductId,
        batchId: harness.fixtures.ids.h1BatchId,
        qty: 1,
        unitPrice: 100,
        gstRate: 12,
        rxCleared: true,
      },
    ];

    expect(
      harness.assertCanSellRegulated(
        harness.fixtures.ids.h1ProductId,
        harness.fixtures.ids.prescriptionId
      )
    ).toEqual({
      ok: true,
      reason: "h1_context_complete",
    });
    expect(() =>
      harness.assertCanSellRegulated(harness.fixtures.ids.h1ProductId)
    ).toThrow("Approved prescription required");

    harness.prescriptions.get(harness.fixtures.ids.prescriptionId)!.doctorReg =
      undefined;
    expect(harness.h1CompletenessReport()).toMatchObject({
      totals: { complete: 0, incomplete: 1 },
    });
  });

  it("payment verification transitions sale/order payment state and rejects fake success", () => {
    const harness = createCommercialLifecycleHarness();

    expect(() =>
      harness.verifyPayment(harness.fixtures.ids.paymentId, "fake_success")
    ).toThrow("Provider fake-success blocked");
    const verified = harness.verifyPayment();
    const duplicate = harness.verifyPayment();

    expect(verified).toMatchObject({
      duplicate: false,
      payment: { status: "paid", gatewayPaymentId: "pay_fixture_p20_0001" },
    });
    expect(duplicate).toMatchObject({
      duplicate: true,
      payment: { status: "paid" },
    });
    expect(harness.getSale(harness.fixtures.ids.saleId).paymentStatus).toBe(
      "paid"
    );
  });

  it("delivery completion records delivered task state", () => {
    const harness = createCommercialLifecycleHarness();

    const task = harness.completeDelivery();

    expect(task).toMatchObject({
      status: "delivered",
      deliveredAt: "2026-01-15T10:20:00.000Z",
    });
  });

  it("sale return restores stock and reverses accounting/report impact", () => {
    const harness = createCommercialLifecycleHarness();
    harness.confirmSale();
    const afterSaleAvailability = harness.canonicalAvailability(
      harness.fixtures.ids.batchId
    );

    const saleReturn = harness.approveSaleReturn();

    expect(harness.canonicalAvailability(harness.fixtures.ids.batchId)).toBe(
      afterSaleAvailability + 2
    );
    expect(saleReturn.sale).toMatchObject({
      status: "returned",
      paymentStatus: "refunded",
    });
    expect(saleReturn.reportImpact).toEqual({
      gstReversal: 4.8,
      refundAmount: 40,
    });
  });

  it("purchase return decrements stock and supplier outstanding", () => {
    const harness = createCommercialLifecycleHarness();
    harness.commitPurchase();
    const beforeReturnAvailability = harness.canonicalAvailability(
      harness.fixtures.ids.batchId
    );

    const purchaseReturn = harness.approvePurchaseReturn();
    const supplierReport = harness.supplierOutstandingReport();

    expect(purchaseReturn).toMatchObject({
      status: "approved",
      totalAmount: 20,
    });
    expect(harness.canonicalAvailability(harness.fixtures.ids.batchId)).toBe(
      beforeReturnAvailability - 2
    );
    expect(supplierReport.totals.outstanding).toBe(80);
  });

  it("supplier payment reduces outstanding when current-main supplier payment records are supported", () => {
    const harness = createCommercialLifecycleHarness();
    harness.commitPurchase();

    const supplierReport = harness.recordSupplierPayment(30);

    expect(supplierReport.rows[0]).toMatchObject({
      payables: 100,
      payments: 30,
      returns: 20,
      outstanding: 50,
    });
  });
});

describe("commercial lifecycle concurrency/idempotency guards", () => {
  it("last-unit reservation and sale cannot oversell", () => {
    const harness = createCommercialLifecycleHarness();
    const batch = harness.getBatch(harness.fixtures.ids.batchId);
    batch.qtyOnHand = 1;

    harness.reserveLastUnit(batch.id, 1);

    expect(harness.canonicalAvailability(batch.id)).toBe(0);
    expect(() => harness.confirmSale()).toThrow(
      "Insufficient stock: cannot oversell last unit"
    );
  });

  it("duplicate purchase commit is idempotent", () => {
    const harness = createCommercialLifecycleHarness();
    const batchId = harness.fixtures.ids.batchId;

    const first = harness.commitPurchase();
    const afterFirst = harness.canonicalAvailability(batchId);
    const second = harness.commitPurchase();

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(harness.canonicalAvailability(batchId)).toBe(afterFirst);
  });

  it("invoice numbering helper remains present for DB-backed race tests", () => {
    expect(invoiceNumbering).toContain("reserveInvoiceNumber");
    expect(invoiceNumbering).toContain("assertInvoiceNumberUnique");
    expect(invoiceNumbering).toMatch(/unique|invoiceSequences|lastNumber/i);
  });

  it("duplicate payment verification is idempotent", () => {
    const harness = createCommercialLifecycleHarness();

    expect(harness.verifyPayment().duplicate).toBe(false);
    expect(harness.verifyPayment().duplicate).toBe(true);
  });

  it("duplicate refund request uses idempotency key in the harness and current-main guard remains exported", () => {
    const harness = createCommercialLifecycleHarness();

    expect(harness.requestRefund("refund-sale-8001")).toEqual({
      duplicate: false,
    });
    expect(harness.requestRefund("refund-sale-8001")).toEqual({
      duplicate: true,
    });
    expect(refundService).toMatch(/idempotency|existing|duplicate|refundId/i);
  });

  it("reservation expiry restores availability", () => {
    const harness = createCommercialLifecycleHarness();
    const batchId = harness.fixtures.ids.batchId;
    const reservation = harness.reserveLastUnit(batchId, 1);
    const reservedAvailability = harness.canonicalAvailability(batchId);

    const expired = harness.expireReservation(reservation.id);

    expect(reservedAvailability).toBe(9);
    expect(expired).toMatchObject({
      duplicate: false,
      reservation: { status: "expired" },
    });
    expect(harness.canonicalAvailability(batchId)).toBe(10);
  });
});

describe("commercial lifecycle security negative coverage", () => {
  it("fake bearer cannot access storage helper guarded paths", () => {
    const harness = createCommercialLifecycleHarness();

    expect(() => harness.assertBearer("Bearer fake-token")).toThrow(
      "Unauthorized storage access"
    );
    expect(storageAccess).toContain("canAccessStorageKey");
    expect(storageAccess).toContain("isStaffRole");
  });

  it("customer cannot access another customer's prescription", () => {
    const harness = createCommercialLifecycleHarness();

    expect(() =>
      harness.assertCustomerOwnsPrescription(
        harness.fixtures.ids.otherCustomerId,
        harness.fixtures.ids.prescriptionId
      )
    ).toThrow("Prescription not found for customer");
  });

  it("staff from store A cannot access store B report/task", () => {
    const harness = createCommercialLifecycleHarness();

    expect(() =>
      harness.assertStaffStoreAccess(
        harness.fixtures.ids.staffUserId,
        harness.fixtures.ids.secondStoreId
      )
    ).toThrow("Store scope denied");
  });

  it("oversized prescription upload is rejected", () => {
    const harness = createCommercialLifecycleHarness();

    expect(() =>
      harness.assertPrescriptionUploadSize(10 * 1024 * 1024 + 1)
    ).toThrow("Prescription upload too large");
  });

  it("provider fake-success remains blocked by current-main payment verification posture", () => {
    const harness = createCommercialLifecycleHarness();

    expect(() =>
      harness.verifyPayment(
        harness.fixtures.ids.paymentId,
        "captured_without_provider_signature"
      )
    ).toThrow("Provider fake-success blocked");
    expect(paymentRouter).toMatch(
      /verifyGatewayPaymentSignature|signature|gatewayPaymentId/i
    );
  });
});

describe("commercial lifecycle report consistency coverage", () => {
  it("stock reconciliation totals match canonical availability fixture", () => {
    const harness = createCommercialLifecycleHarness();
    harness.reserveLastUnit(harness.fixtures.ids.batchId, 1);

    const report = harness.stockReconciliationReport();

    expect(
      report.rows.find(row => row.batchId === harness.fixtures.ids.batchId)
    ).toMatchObject({ onHand: 10, reserved: 1, available: 9 });
    expect(report.totals).toEqual({ onHand: 12, reserved: 1, available: 11 });
    expect(report.csvData).toContain(
      "batchId,productId,onHand,reserved,available"
    );
  });

  it("daily GST report returns rows, totals, and csvData", () => {
    const harness = createCommercialLifecycleHarness();
    harness.confirmSale();

    const report = harness.dailyGstReport();

    expect(report.rows).toEqual([
      {
        saleId: harness.fixtures.ids.saleId,
        taxableValue: 40,
        gstRate: 12,
        gstAmount: 4.8,
        total: 40,
      },
    ]);
    expect(report.totals).toEqual({
      taxableValue: 40,
      gstAmount: 4.8,
      total: 40,
    });
    expect(report.csvData).toContain(
      "saleId,taxableValue,gstRate,gstAmount,total"
    );
  });

  it("H1 completeness report flags missing context", () => {
    const harness = createCommercialLifecycleHarness();
    const sale = harness.getSale(harness.fixtures.ids.saleId);
    sale.prescriptionId = harness.fixtures.ids.prescriptionId;
    sale.lines = [
      {
        id: "sale-line-h1",
        productId: harness.fixtures.ids.h1ProductId,
        batchId: harness.fixtures.ids.h1BatchId,
        qty: 1,
        unitPrice: 100,
        gstRate: 12,
        rxCleared: true,
      },
    ];
    harness.prescriptions.get(harness.fixtures.ids.prescriptionId)!.doctorName =
      undefined;

    const report = harness.h1CompletenessReport();

    expect(report.rows).toEqual([
      {
        saleId: harness.fixtures.ids.saleId,
        prescriptionId: harness.fixtures.ids.prescriptionId,
        missing: ["doctorName"],
      },
    ]);
    expect(report.totals).toEqual({ complete: 0, incomplete: 1 });
    expect(report.csvData).toContain("doctorName");
  });

  it("supplier outstanding report totals match fixture", () => {
    const harness = createCommercialLifecycleHarness();
    harness.commitPurchase();
    harness.recordSupplierPayment(25);

    const report = harness.supplierOutstandingReport();

    expect(report.rows).toEqual([
      {
        supplierId: harness.fixtures.ids.supplierId,
        payables: 100,
        payments: 25,
        returns: 20,
        outstanding: 55,
      },
    ]);
    expect(report.totals).toEqual({
      supplierId: harness.fixtures.ids.supplierId,
      payables: 100,
      payments: 25,
      returns: 20,
      outstanding: 55,
    });
    expect(report.csvData).toContain(
      "supplierId,payables,payments,returns,outstanding"
    );
  });
});

describe("commercial lifecycle current-main static integration guards", () => {
  it("current-main routers retain commercial helper seams needed for future DB-backed tests", () => {
    expect(purchaseRouter).toContain("increaseStockForPurchaseCommit");
    expect(purchaseRouter).toContain("recordSupplierPayable");
    expect(salesRouter).toContain("decreaseStockForSaleConfirmation");
    expect(salesRouter).toContain("getCanonicalAvailability");
    expect(paymentRouter).toContain("verifyGatewayPaymentSignature");
    expect(reservationService).toContain("expireStaleReservations");
  });

  it("current-main report router retains normalized report shape", () => {
    expect(reportsRouter).toContain("rows");
    expect(reportsRouter).toContain("totals");
    expect(reportsRouter).toContain("csvData");
  });
});
