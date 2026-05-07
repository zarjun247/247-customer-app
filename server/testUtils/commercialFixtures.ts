/**
 * Deterministic commercial lifecycle fixtures for integration-style tests.
 *
 * These utilities intentionally live under server/testUtils and do not import or
 * mutate production domain services. They model the canonical commercial tables
 * closely enough for DB-backed harnesses to seed the same records when a real
 * test database becomes available, while providing a strong in-memory harness
 * for this repository's current Vitest setup.
 */
export type CommercialFixtureSeed = {
  storeId?: number;
  secondStoreId?: number;
  staffUserId?: number;
  pharmacistUserId?: number;
  otherStaffUserId?: number;
  customerId?: number;
  otherCustomerId?: number;
  supplierId?: number;
  productId?: number;
  h1ProductId?: number;
  variantId?: number;
  batchId?: number;
  h1BatchId?: number;
  purchaseInvoiceId?: number;
  purchaseReturnId?: number;
  saleId?: string;
  saleLineId?: string;
  saleReturnId?: string;
  orderId?: number;
  paymentId?: number;
  prescriptionId?: number;
  stockReservationId?: number;
  deliveryTaskId?: number;
  auditLogId?: number;
};

export function fixtureDefaults(
  seed: CommercialFixtureSeed = {}
): Required<CommercialFixtureSeed> {
  return {
    storeId: seed.storeId ?? 1001,
    secondStoreId: seed.secondStoreId ?? 1002,
    staffUserId: seed.staffUserId ?? 2001,
    pharmacistUserId: seed.pharmacistUserId ?? 2002,
    otherStaffUserId: seed.otherStaffUserId ?? 2003,
    customerId: seed.customerId ?? 3001,
    otherCustomerId: seed.otherCustomerId ?? 3002,
    supplierId: seed.supplierId ?? 4001,
    productId: seed.productId ?? 5001,
    h1ProductId: seed.h1ProductId ?? 5002,
    variantId: seed.variantId ?? 5101,
    batchId: seed.batchId ?? 6001,
    h1BatchId: seed.h1BatchId ?? 6002,
    purchaseInvoiceId: seed.purchaseInvoiceId ?? 7001,
    purchaseReturnId: seed.purchaseReturnId ?? 7101,
    saleId: seed.saleId ?? "sale-8001",
    saleLineId: seed.saleLineId ?? "sale-line-8001",
    saleReturnId: seed.saleReturnId ?? "sale-return-8001",
    orderId: seed.orderId ?? 8101,
    paymentId: seed.paymentId ?? 9001,
    prescriptionId: seed.prescriptionId ?? 10001,
    stockReservationId: seed.stockReservationId ?? 11001,
    deliveryTaskId: seed.deliveryTaskId ?? 12001,
    auditLogId: seed.auditLogId ?? 13001,
  };
}

export type StoreFixture = {
  id: number;
  name: string;
  type: "in_building" | "cluster_hub";
  isActive: boolean;
};

export type UserFixture = {
  id: number;
  name: string;
  role: "customer" | "staff" | "pharmacist";
  assignedStoreId?: number;
};

export type ProductFixture = {
  id: number;
  name: string;
  schedule: "OTC" | "H" | "H1" | "X";
  requiresPrescription: boolean;
  gstRate: number;
};

export type ProductVariantFixture = {
  id: number;
  productId: number;
  displayLabel: string;
  isActive: boolean;
};

export type BatchLedgerFixture = {
  id: number;
  productId: number;
  variantId: number;
  storeId: number;
  supplierId: number;
  batchNo: string;
  expiryDate: string;
  mrp: number;
  purchaseRate: number;
  saleRate: number;
  qtyOnHand: number;
  qtyReserved: number;
  qtyQuarantined: number;
  qtyExpired: number;
  status: "active" | "depleted" | "returned_to_supplier";
  purchaseInvoiceId?: number;
};

export type PurchaseInvoiceFixture = {
  id: number;
  supplierId: number;
  storeId: number;
  invoiceNo: string;
  status: "draft" | "committed" | "partially_returned";
  totalAmount: number;
  paymentStatus: "unpaid" | "partially_paid" | "paid";
  idempotencyKey: string;
  lines: Array<{
    productId: number;
    variantId: number;
    batchId: number;
    qty: number;
    purchaseRate: number;
  }>;
};

export type PurchaseReturnFixture = {
  id: number;
  purchaseInvoiceId: number;
  supplierId: number;
  storeId: number;
  status: "approved";
  totalAmount: number;
  lines: Array<{ batchId: number; qty: number; amount: number }>;
};

export type SaleFixture = {
  id: string;
  storeId: number;
  customerId: number;
  status: "draft" | "confirmed" | "returned";
  paymentStatus: "pending" | "paid" | "refunded";
  total: number;
  gstAmount: number;
  prescriptionId?: number;
  lines: Array<{
    id: string;
    productId: number;
    batchId: number;
    qty: number;
    unitPrice: number;
    gstRate: number;
    rxCleared: boolean;
  }>;
};

export type PrescriptionFixture = {
  id: number;
  userId: number;
  storeId: number;
  status: "pending_pharmacist" | "approved";
  patientName: string;
  doctorName?: string;
  doctorReg?: string;
  linkedSaleId?: string;
};

export type PaymentRecordFixture = {
  id: number;
  orderId: number;
  saleId: string;
  userId: number;
  status: "created" | "paid" | "failed" | "refunded";
  gatewayOrderId: string;
  gatewayPaymentId?: string;
  amountPaise: number;
};

export type DeliveryTaskFixture = {
  id: number;
  orderId: number;
  storeId: number;
  riderId: number;
  status: "assigned" | "delivered" | "returned";
  deliveredAt?: string;
};

export type SupplierFixture = {
  id: number;
  supplierName: string;
  gstin: string;
};

export type AuditLogFixture = {
  id: number;
  actorId: number;
  action: string;
  entityType: string;
  entityId: number | string;
  afterJson: Record<string, unknown>;
};

export type StockReservationFixture = {
  id: number;
  orderId: number;
  storeId: number;
  batchId: number;
  productId: number;
  customerId: number;
  qty: number;
  status: "active" | "released" | "expired" | "consumed";
  expiresAt: string;
};

export type CommercialFixtures = {
  ids: Required<CommercialFixtureSeed>;
  stores: StoreFixture[];
  users: UserFixture[];
  products: ProductFixture[];
  variants: ProductVariantFixture[];
  batches: BatchLedgerFixture[];
  supplier: SupplierFixture;
  purchaseInvoice: PurchaseInvoiceFixture;
  purchaseReturn: PurchaseReturnFixture;
  saleDraft: SaleFixture;
  prescription: PrescriptionFixture;
  payment: PaymentRecordFixture;
  deliveryTask: DeliveryTaskFixture;
  reservation: StockReservationFixture;
  auditLog: AuditLogFixture;
};

export function createCommercialFixtures(
  seed: CommercialFixtureSeed = {}
): CommercialFixtures {
  const ids = fixtureDefaults(seed);
  const canonicalNow = "2026-01-15T10:00:00.000Z";

  return {
    ids,
    stores: [
      {
        id: ids.storeId,
        name: "P20 Primary Pharmacy",
        type: "in_building",
        isActive: true,
      },
      {
        id: ids.secondStoreId,
        name: "P21 Secondary Pharmacy",
        type: "cluster_hub",
        isActive: true,
      },
    ],
    users: [
      {
        id: ids.customerId,
        name: "Deterministic Customer",
        role: "customer",
        assignedStoreId: ids.storeId,
      },
      {
        id: ids.otherCustomerId,
        name: "Other Customer",
        role: "customer",
        assignedStoreId: ids.secondStoreId,
      },
      {
        id: ids.staffUserId,
        name: "Store Staff",
        role: "staff",
        assignedStoreId: ids.storeId,
      },
      {
        id: ids.pharmacistUserId,
        name: "Registered Pharmacist",
        role: "pharmacist",
        assignedStoreId: ids.storeId,
      },
      {
        id: ids.otherStaffUserId,
        name: "Other Store Staff",
        role: "staff",
        assignedStoreId: ids.secondStoreId,
      },
    ],
    products: [
      {
        id: ids.productId,
        name: "Paracetamol 500mg",
        schedule: "OTC",
        requiresPrescription: false,
        gstRate: 12,
      },
      {
        id: ids.h1ProductId,
        name: "H1 Regulated Tablet",
        schedule: "H1",
        requiresPrescription: true,
        gstRate: 12,
      },
    ],
    variants: [
      {
        id: ids.variantId,
        productId: ids.productId,
        displayLabel: "10 tablets",
        isActive: true,
      },
    ],
    batches: [
      {
        id: ids.batchId,
        productId: ids.productId,
        variantId: ids.variantId,
        storeId: ids.storeId,
        supplierId: ids.supplierId,
        batchNo: "BATCH-P20-001",
        expiryDate: "2027-12-31",
        mrp: 25,
        purchaseRate: 10,
        saleRate: 20,
        qtyOnHand: 10,
        qtyReserved: 0,
        qtyQuarantined: 0,
        qtyExpired: 0,
        status: "active",
        purchaseInvoiceId: ids.purchaseInvoiceId,
      },
      {
        id: ids.h1BatchId,
        productId: ids.h1ProductId,
        variantId: ids.variantId,
        storeId: ids.storeId,
        supplierId: ids.supplierId,
        batchNo: "H1-P20-001",
        expiryDate: "2027-12-31",
        mrp: 110,
        purchaseRate: 60,
        saleRate: 100,
        qtyOnHand: 2,
        qtyReserved: 0,
        qtyQuarantined: 0,
        qtyExpired: 0,
        status: "active",
      },
    ],
    supplier: {
      id: ids.supplierId,
      supplierName: "Deterministic Pharma Distributor",
      gstin: "27ABCDE1234F1Z5",
    },
    purchaseInvoice: {
      id: ids.purchaseInvoiceId,
      supplierId: ids.supplierId,
      storeId: ids.storeId,
      invoiceNo: "PINV-P20-0001",
      status: "draft",
      totalAmount: 100,
      paymentStatus: "unpaid",
      idempotencyKey: "purchase-commit-PINV-P20-0001",
      lines: [
        {
          productId: ids.productId,
          variantId: ids.variantId,
          batchId: ids.batchId,
          qty: 10,
          purchaseRate: 10,
        },
      ],
    },
    purchaseReturn: {
      id: ids.purchaseReturnId,
      purchaseInvoiceId: ids.purchaseInvoiceId,
      supplierId: ids.supplierId,
      storeId: ids.storeId,
      status: "approved",
      totalAmount: 20,
      lines: [{ batchId: ids.batchId, qty: 2, amount: 20 }],
    },
    saleDraft: {
      id: ids.saleId,
      storeId: ids.storeId,
      customerId: ids.customerId,
      status: "draft",
      paymentStatus: "pending",
      total: 40,
      gstAmount: 4.8,
      lines: [
        {
          id: ids.saleLineId,
          productId: ids.productId,
          batchId: ids.batchId,
          qty: 2,
          unitPrice: 20,
          gstRate: 12,
          rxCleared: false,
        },
      ],
    },
    prescription: {
      id: ids.prescriptionId,
      userId: ids.customerId,
      storeId: ids.storeId,
      status: "approved",
      patientName: "Deterministic Customer",
      doctorName: "Dr Fixture",
      doctorReg: "MH-12345",
      linkedSaleId: ids.saleId,
    },
    payment: {
      id: ids.paymentId,
      orderId: ids.orderId,
      saleId: ids.saleId,
      userId: ids.customerId,
      status: "created",
      gatewayOrderId: "order_fixture_p20_0001",
      amountPaise: 4000,
    },
    deliveryTask: {
      id: ids.deliveryTaskId,
      orderId: ids.orderId,
      storeId: ids.storeId,
      riderId: ids.staffUserId,
      status: "assigned",
    },
    reservation: {
      id: ids.stockReservationId,
      orderId: ids.orderId,
      storeId: ids.storeId,
      batchId: ids.batchId,
      productId: ids.productId,
      customerId: ids.customerId,
      qty: 1,
      status: "active",
      expiresAt: canonicalNow,
    },
    auditLog: {
      id: ids.auditLogId,
      actorId: ids.staffUserId,
      action: "fixture.seeded",
      entityType: "commercial_fixture",
      entityId: ids.storeId,
      afterJson: { seededAt: canonicalNow },
    },
  };
}

export type StockReport = {
  rows: Array<{
    batchId: number;
    productId: number;
    available: number;
    onHand: number;
    reserved: number;
  }>;
  totals: { onHand: number; reserved: number; available: number };
  csvData: string;
};

export type GstReport = {
  rows: Array<{
    saleId: string;
    taxableValue: number;
    gstRate: number;
    gstAmount: number;
    total: number;
  }>;
  totals: { taxableValue: number; gstAmount: number; total: number };
  csvData: string;
};

export type H1CompletenessReport = {
  rows: Array<{ saleId: string; prescriptionId?: number; missing: string[] }>;
  totals: { complete: number; incomplete: number };
  csvData: string;
};

export type SupplierOutstandingReport = {
  rows: Array<{
    supplierId: number;
    payables: number;
    payments: number;
    returns: number;
    outstanding: number;
  }>;
  totals: {
    payables: number;
    payments: number;
    returns: number;
    outstanding: number;
  };
  csvData: string;
};

export class CommercialLifecycleHarness {
  readonly fixtures: CommercialFixtures;
  readonly stores = new Map<number, StoreFixture>();
  readonly users = new Map<number, UserFixture>();
  readonly products = new Map<number, ProductFixture>();
  readonly batches = new Map<number, BatchLedgerFixture>();
  readonly purchaseInvoices = new Map<number, PurchaseInvoiceFixture>();
  readonly purchaseReturns = new Map<number, PurchaseReturnFixture>();
  readonly sales = new Map<string, SaleFixture>();
  readonly prescriptions = new Map<number, PrescriptionFixture>();
  readonly payments = new Map<number, PaymentRecordFixture>();
  readonly reservations = new Map<number, StockReservationFixture>();
  readonly deliveryTasks = new Map<number, DeliveryTaskFixture>();
  readonly auditLogs: AuditLogFixture[] = [];
  readonly idempotencyKeys = new Set<string>();
  readonly refundKeys = new Set<string>();
  supplierPaymentTotal = 0;

  constructor(fixtures = createCommercialFixtures()) {
    this.fixtures = fixtures;
    fixtures.stores.forEach(store =>
      this.stores.set(store.id, structuredClone(store))
    );
    fixtures.users.forEach(user =>
      this.users.set(user.id, structuredClone(user))
    );
    fixtures.products.forEach(product =>
      this.products.set(product.id, structuredClone(product))
    );
    fixtures.batches.forEach(batch =>
      this.batches.set(batch.id, structuredClone(batch))
    );
    this.purchaseInvoices.set(
      fixtures.purchaseInvoice.id,
      structuredClone(fixtures.purchaseInvoice)
    );
    this.purchaseReturns.set(
      fixtures.purchaseReturn.id,
      structuredClone(fixtures.purchaseReturn)
    );
    this.sales.set(fixtures.saleDraft.id, structuredClone(fixtures.saleDraft));
    this.prescriptions.set(
      fixtures.prescription.id,
      structuredClone(fixtures.prescription)
    );
    this.payments.set(fixtures.payment.id, structuredClone(fixtures.payment));
    this.reservations.set(
      fixtures.reservation.id,
      structuredClone(fixtures.reservation)
    );
    this.deliveryTasks.set(
      fixtures.deliveryTask.id,
      structuredClone(fixtures.deliveryTask)
    );
    this.auditLogs.push(structuredClone(fixtures.auditLog));
  }

  getBatch(batchId: number) {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error(`Batch ${batchId} not found`);
    return batch;
  }

  getSale(saleId: string) {
    const sale = this.sales.get(saleId);
    if (!sale) throw new Error(`Sale ${saleId} not found`);
    return sale;
  }

  canonicalAvailability(batchId: number) {
    const batch = this.getBatch(batchId);
    return (
      batch.qtyOnHand -
      batch.qtyReserved -
      batch.qtyQuarantined -
      batch.qtyExpired
    );
  }

  commitPurchase(invoiceId = this.fixtures.purchaseInvoice.id) {
    const invoice = this.purchaseInvoices.get(invoiceId);
    if (!invoice) throw new Error(`Purchase invoice ${invoiceId} not found`);
    if (this.idempotencyKeys.has(invoice.idempotencyKey))
      return { duplicate: true, invoice };

    if (invoice.status !== "draft")
      throw new Error("Purchase invoice already committed");
    for (const line of invoice.lines) {
      const batch = this.getBatch(line.batchId);
      batch.qtyOnHand += line.qty;
    }
    invoice.status = "committed";
    this.idempotencyKeys.add(invoice.idempotencyKey);
    this.auditLogs.push({
      id: this.fixtures.ids.auditLogId + this.auditLogs.length,
      actorId: this.fixtures.ids.staffUserId,
      action: "purchase.commit",
      entityType: "purchase_invoice",
      entityId: invoice.id,
      afterJson: { status: invoice.status, totalAmount: invoice.totalAmount },
    });
    return { duplicate: false, invoice };
  }

  confirmSale(saleId = this.fixtures.saleDraft.id) {
    const sale = this.getSale(saleId);
    if (sale.status !== "draft") return { duplicate: true, sale };

    for (const line of sale.lines) {
      if (this.canonicalAvailability(line.batchId) < line.qty)
        throw new Error("Insufficient stock: cannot oversell last unit");
    }
    for (const line of sale.lines) {
      this.getBatch(line.batchId).qtyOnHand -= line.qty;
    }
    sale.status = "confirmed";
    this.auditLogs.push({
      id: this.fixtures.ids.auditLogId + this.auditLogs.length,
      actorId: this.fixtures.ids.staffUserId,
      action: "sale.confirm",
      entityType: "sale",
      entityId: sale.id,
      afterJson: { status: sale.status, total: sale.total },
    });
    return { duplicate: false, sale };
  }

  reserveLastUnit(
    batchId: number,
    qty: number,
    reservationId = this.fixtures.ids.stockReservationId
  ) {
    const batch = this.getBatch(batchId);
    if (this.canonicalAvailability(batchId) < qty)
      throw new Error("Insufficient availability for reservation");
    batch.qtyReserved += qty;
    const reservation: StockReservationFixture = {
      ...structuredClone(this.fixtures.reservation),
      id: reservationId,
      batchId,
      productId: batch.productId,
      qty,
      status: "active",
    };
    this.reservations.set(reservation.id, reservation);
    return reservation;
  }

  releaseReservation(reservationId = this.fixtures.ids.stockReservationId) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) throw new Error(`Reservation ${reservationId} not found`);
    if (reservation.status !== "active")
      return { duplicate: true, reservation };
    this.getBatch(reservation.batchId).qtyReserved -= reservation.qty;
    reservation.status = "released";
    return { duplicate: false, reservation };
  }

  expireReservation(reservationId = this.fixtures.ids.stockReservationId) {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) throw new Error(`Reservation ${reservationId} not found`);
    if (reservation.status !== "active")
      return { duplicate: true, reservation };
    this.getBatch(reservation.batchId).qtyReserved -= reservation.qty;
    reservation.status = "expired";
    return { duplicate: false, reservation };
  }

  assertCanSellRegulated(
    productId: number,
    prescriptionId?: number,
    pharmacistId = this.fixtures.ids.pharmacistUserId
  ) {
    const product = this.products.get(productId);
    if (!product) throw new Error(`Product ${productId} not found`);
    if (!product.requiresPrescription) return { ok: true, reason: "otc" };
    const prescription = prescriptionId
      ? this.prescriptions.get(prescriptionId)
      : undefined;
    const pharmacist = this.users.get(pharmacistId);
    if (!prescription || prescription.status !== "approved")
      throw new Error("Approved prescription required");
    if (!pharmacist || pharmacist.role !== "pharmacist")
      throw new Error("Registered pharmacist required");
    if (!prescription.doctorName || !prescription.doctorReg)
      throw new Error("H1 doctor context required");
    return { ok: true, reason: "h1_context_complete" };
  }

  verifyPayment(
    paymentId = this.fixtures.payment.id,
    gatewayPaymentId = "pay_fixture_p20_0001"
  ) {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`Payment ${paymentId} not found`);
    if (payment.status === "paid") return { duplicate: true, payment };
    if (!gatewayPaymentId.startsWith("pay_"))
      throw new Error("Provider fake-success blocked");
    payment.status = "paid";
    payment.gatewayPaymentId = gatewayPaymentId;
    this.getSale(payment.saleId).paymentStatus = "paid";
    return { duplicate: false, payment };
  }

  completeDelivery(taskId = this.fixtures.deliveryTask.id) {
    const task = this.deliveryTasks.get(taskId);
    if (!task) throw new Error(`Delivery task ${taskId} not found`);
    task.status = "delivered";
    task.deliveredAt = "2026-01-15T10:20:00.000Z";
    return task;
  }

  approveSaleReturn(saleId = this.fixtures.saleDraft.id) {
    const sale = this.getSale(saleId);
    if (sale.status !== "confirmed")
      throw new Error("Only confirmed sale can be returned");
    for (const line of sale.lines)
      this.getBatch(line.batchId).qtyOnHand += line.qty;
    sale.status = "returned";
    sale.paymentStatus = "refunded";
    return {
      sale,
      reportImpact: { gstReversal: sale.gstAmount, refundAmount: sale.total },
    };
  }

  approvePurchaseReturn(returnId = this.fixtures.purchaseReturn.id) {
    const purchaseReturn = this.purchaseReturns.get(returnId);
    if (!purchaseReturn)
      throw new Error(`Purchase return ${returnId} not found`);
    for (const line of purchaseReturn.lines) {
      const batch = this.getBatch(line.batchId);
      if (this.canonicalAvailability(batch.id) < line.qty)
        throw new Error("Insufficient stock for purchase return");
      batch.qtyOnHand -= line.qty;
    }
    const invoice = this.purchaseInvoices.get(purchaseReturn.purchaseInvoiceId);
    if (invoice) invoice.status = "partially_returned";
    return purchaseReturn;
  }

  recordSupplierPayment(amount: number) {
    if (amount <= 0)
      throw new Error("Supplier payment amount must be positive");
    this.supplierPaymentTotal += amount;
    const invoice = this.fixtures.purchaseInvoice;
    if (this.supplierPaymentTotal >= invoice.totalAmount)
      invoice.paymentStatus = "paid";
    return this.supplierOutstandingReport();
  }

  requestRefund(idempotencyKey: string) {
    if (this.refundKeys.has(idempotencyKey)) return { duplicate: true };
    this.refundKeys.add(idempotencyKey);
    return { duplicate: false };
  }

  assertBearer(authHeader?: string) {
    if (!authHeader?.startsWith("Bearer test-valid-"))
      throw new Error("Unauthorized storage access");
    return { ok: true };
  }

  assertCustomerOwnsPrescription(customerId: number, prescriptionId: number) {
    const prescription = this.prescriptions.get(prescriptionId);
    if (!prescription || prescription.userId !== customerId)
      throw new Error("Prescription not found for customer");
    return prescription;
  }

  assertStaffStoreAccess(staffId: number, storeId: number) {
    const staff = this.users.get(staffId);
    if (!staff || staff.assignedStoreId !== storeId)
      throw new Error("Store scope denied");
    return { ok: true };
  }

  assertPrescriptionUploadSize(sizeBytes: number) {
    const maxBytes = 10 * 1024 * 1024;
    if (sizeBytes > maxBytes) throw new Error("Prescription upload too large");
    return { ok: true };
  }

  stockReconciliationReport(): StockReport {
    const rows = Array.from(this.batches.values()).map(batch => ({
      batchId: batch.id,
      productId: batch.productId,
      onHand: batch.qtyOnHand,
      reserved: batch.qtyReserved,
      available: this.canonicalAvailability(batch.id),
    }));
    const totals = rows.reduce(
      (acc, row) => ({
        onHand: acc.onHand + row.onHand,
        reserved: acc.reserved + row.reserved,
        available: acc.available + row.available,
      }),
      { onHand: 0, reserved: 0, available: 0 }
    );
    return {
      rows,
      totals,
      csvData: [
        "batchId,productId,onHand,reserved,available",
        ...rows.map(
          r =>
            `${r.batchId},${r.productId},${r.onHand},${r.reserved},${r.available}`
        ),
      ].join("\n"),
    };
  }

  dailyGstReport(): GstReport {
    const rows = Array.from(this.sales.values())
      .filter(sale => sale.status === "confirmed" || sale.status === "returned")
      .flatMap(sale =>
        sale.lines.map(line => ({
          saleId: sale.id,
          taxableValue: line.qty * line.unitPrice,
          gstRate: line.gstRate,
          gstAmount: (line.qty * line.unitPrice * line.gstRate) / 100,
          total: sale.total,
        }))
      );
    const totals = rows.reduce(
      (acc, row) => ({
        taxableValue: acc.taxableValue + row.taxableValue,
        gstAmount: acc.gstAmount + row.gstAmount,
        total: acc.total + row.total,
      }),
      { taxableValue: 0, gstAmount: 0, total: 0 }
    );
    return {
      rows,
      totals,
      csvData: [
        "saleId,taxableValue,gstRate,gstAmount,total",
        ...rows.map(
          r =>
            `${r.saleId},${r.taxableValue},${r.gstRate},${r.gstAmount},${r.total}`
        ),
      ].join("\n"),
    };
  }

  h1CompletenessReport(): H1CompletenessReport {
    const rows = Array.from(this.sales.values())
      .filter(sale =>
        sale.lines.some(
          line => this.products.get(line.productId)?.schedule === "H1"
        )
      )
      .map(sale => {
        const prescription = sale.prescriptionId
          ? this.prescriptions.get(sale.prescriptionId)
          : undefined;
        const missing = [
          !sale.prescriptionId ? "prescription" : undefined,
          !prescription?.doctorName ? "doctorName" : undefined,
          !prescription?.doctorReg ? "doctorReg" : undefined,
        ].filter((value): value is string => Boolean(value));
        return {
          saleId: sale.id,
          prescriptionId: sale.prescriptionId,
          missing,
        };
      });
    const totals = rows.reduce(
      (acc, row) => ({
        complete: acc.complete + (row.missing.length === 0 ? 1 : 0),
        incomplete: acc.incomplete + (row.missing.length > 0 ? 1 : 0),
      }),
      { complete: 0, incomplete: 0 }
    );
    return {
      rows,
      totals,
      csvData: [
        "saleId,prescriptionId,missing",
        ...rows.map(
          r => `${r.saleId},${r.prescriptionId ?? ""},${r.missing.join("|")}`
        ),
      ].join("\n"),
    };
  }

  supplierOutstandingReport(): SupplierOutstandingReport {
    const payables = Array.from(this.purchaseInvoices.values())
      .filter(
        invoice =>
          invoice.status === "committed" ||
          invoice.status === "partially_returned"
      )
      .reduce((sum, invoice) => sum + invoice.totalAmount, 0);
    const returns = Array.from(this.purchaseReturns.values()).reduce(
      (sum, purchaseReturn) => sum + purchaseReturn.totalAmount,
      0
    );
    const row = {
      supplierId: this.fixtures.ids.supplierId,
      payables,
      payments: this.supplierPaymentTotal,
      returns,
      outstanding: payables - returns - this.supplierPaymentTotal,
    };
    return {
      rows: [row],
      totals: { ...row },
      csvData: `supplierId,payables,payments,returns,outstanding\n${row.supplierId},${row.payables},${row.payments},${row.returns},${row.outstanding}`,
    };
  }
}

export function createCommercialLifecycleHarness(
  seed: CommercialFixtureSeed = {}
) {
  return new CommercialLifecycleHarness(createCommercialFixtures(seed));
}
