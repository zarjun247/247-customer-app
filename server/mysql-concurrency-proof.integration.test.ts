import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DbTestContext } from "./testUtils/dbTestLifecycle";
import {
  applyTestMigrations,
  cleanupDbTestContext,
  closeDbTestContext,
  createDbTestContext,
  getTestDatabaseUrl,
  requireSafeTestDatabaseUrl,
  TEST_DB_ENV_VAR,
} from "./testUtils/dbTestLifecycle";
import {
  createDeterministicTestCustomer,
  createDeterministicTestProductSkuBatch,
  createDeterministicTestStaff,
  createDeterministicTestStore,
} from "./testUtils/dbSeedFactories";

const testDatabaseUrl = getTestDatabaseUrl();
const describeWithDb = testDatabaseUrl ? describe.sequential : describe.skip;

if (!testDatabaseUrl) {
  console.warn(
    `Skipping MySQL concurrency proof integration tests because ${TEST_DB_ENV_VAR} is not set.`
  );
}

type ProductSet = Awaited<
  ReturnType<typeof createDeterministicTestProductSkuBatch>
>;

type ProofFixture = {
  ctx: DbTestContext;
  store: Awaited<ReturnType<typeof createDeterministicTestStore>>;
  customer: Awaited<ReturnType<typeof createDeterministicTestCustomer>>;
  staff: Awaited<ReturnType<typeof createDeterministicTestStaff>>;
  productSet: ProductSet;
};

async function openProofConnection() {
  return mysql.createConnection(requireSafeTestDatabaseUrl(testDatabaseUrl));
}

function insertId(result: unknown): number {
  const packet = Array.isArray(result) ? result[0] : result;
  return Number((packet as { insertId?: number }).insertId);
}

function affectedRows(result: unknown): number {
  const packet = Array.isArray(result) ? result[0] : result;
  return Number((packet as { affectedRows?: number }).affectedRows ?? 0);
}

async function createProofFixture(
  runLabel: string,
  startingQty = 5
): Promise<ProofFixture> {
  const ctx = await createDbTestContext(
    `mysql_concurrency_${runLabel}_${Date.now()}_${process.pid}`
  );
  const store = await createDeterministicTestStore(ctx);
  const customer = await createDeterministicTestCustomer(ctx);
  const staff = await createDeterministicTestStaff(ctx, store.id);
  const productSet = await createDeterministicTestProductSkuBatch(
    ctx,
    store.id
  );
  await ctx.connection.execute(
    "UPDATE batches SET quantity = ?, qtyOnHand = ?, qtyReserved = 0 WHERE id = ?",
    [startingQty, startingQty, productSet.batch.id]
  );
  return { ctx, store, customer, staff, productSet };
}

async function disposeProofFixture(fixture: ProofFixture | undefined) {
  if (!fixture) return;
  const { ctx } = fixture;
  await ctx.connection.execute(
    "DELETE FROM stock_movements WHERE referenceType LIKE ? OR batchId IN (?)",
    [`proof:${ctx.runId}%`, ctx.created.batchIds]
  );
  await ctx.connection.execute(
    "DELETE FROM stock_reservations WHERE releaseReason LIKE ? OR batchId IN (?)",
    [`proof:${ctx.runId}%`, ctx.created.batchIds]
  );
  await ctx.connection.execute(
    "DELETE FROM h1_register WHERE saleRef LIKE ? OR saleLineRef LIKE ?",
    [`proof-${ctx.runId}%`, `proof-line-${ctx.runId}%`]
  );
  await ctx.connection.execute(
    "DELETE FROM refunds WHERE providerRefundId LIKE ?",
    [`proof-${ctx.runId}%`]
  );
  await ctx.connection.execute(
    "DELETE FROM payment_records WHERE gatewayOrderId LIKE ?",
    [`proof-${ctx.runId}%`]
  );
  await ctx.connection.execute(
    "DELETE FROM purchase_lines WHERE rawLineText LIKE ?",
    [`proof:${ctx.runId}%`]
  );
  await ctx.connection.execute(
    "DELETE FROM purchase_invoices WHERE invoiceNo LIKE ?",
    [`proof-${ctx.runId}%`]
  );
  await ctx.connection.execute(
    "DELETE FROM invoice_sequences WHERE store_id LIKE ?",
    [`proof-${ctx.runId}%`]
  );
  await cleanupDbTestContext(ctx);
  await closeDbTestContext(ctx);
}

async function confirmSaleOnce(
  batchId: number,
  storeId: number,
  staffId: number,
  qty: number,
  referenceType: string
) {
  const connection = await openProofConnection();
  try {
    await connection.beginTransaction();
    const [beforeRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT qtyOnHand FROM batches WHERE id = ? FOR UPDATE",
      [batchId]
    );
    const qtyBefore = Number(beforeRows[0]?.qtyOnHand ?? 0);
    const [updateResult] = await connection.execute(
      "UPDATE batches SET qtyOnHand = qtyOnHand - ?, quantity = quantity - ?, status = IF(qtyOnHand - ? = 0, 'depleted', status) WHERE id = ? AND qtyOnHand >= ? AND qtyOnHand - COALESCE(qtyReserved, 0) >= ?",
      [qty, qty, qty, batchId, qty, qty]
    );
    if (affectedRows(updateResult) !== 1) {
      await connection.rollback();
      throw new Error("CONTROLLED_STOCK_UNAVAILABLE");
    }
    await connection.execute(
      "INSERT INTO stock_movements (batchId, storeId, movementType, qty, qtyBefore, qtyAfter, referenceType, referenceId, reason, performedBy) VALUES (?, ?, 'sale_fulfil', ?, ?, ?, ?, ?, ?, ?)",
      [
        batchId,
        storeId,
        -qty,
        qtyBefore,
        qtyBefore - qty,
        referenceType,
        batchId,
        "proof sale confirmation",
        staffId,
      ]
    );
    await connection.commit();
    return { ok: true as const };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // transaction may already be rolled back
    }
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await connection.end();
  }
}

async function reserveOnce(fixture: ProofFixture, cartId: number, qty: number) {
  const connection = await openProofConnection();
  try {
    await connection.beginTransaction();
    const [updateResult] = await connection.execute(
      "UPDATE batches SET qtyReserved = COALESCE(qtyReserved, 0) + ? WHERE id = ? AND qtyOnHand - COALESCE(qtyReserved, 0) >= ?",
      [qty, fixture.productSet.batch.id, qty]
    );
    if (affectedRows(updateResult) !== 1) {
      await connection.rollback();
      throw new Error("CONTROLLED_RESERVATION_UNAVAILABLE");
    }
    const [result] = await connection.execute(
      "INSERT INTO stock_reservations (batchId, cartId, productId, variantId, skuId, storeId, qty, qtyReserved, status, releaseReason, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))",
      [
        fixture.productSet.batch.id,
        cartId,
        fixture.productSet.product.id,
        fixture.productSet.variant.id,
        fixture.productSet.storeSku.id,
        fixture.store.id,
        qty,
        qty,
        `proof:${fixture.ctx.runId}:active`,
      ]
    );
    await connection.commit();
    return { ok: true as const, reservationId: insertId(result) };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // transaction may already be rolled back
    }
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await connection.end();
  }
}

async function nextInvoiceNumber(
  storeRef: string,
  financialYear: string,
  prefix: string
) {
  const connection = await openProofConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      "INSERT IGNORE INTO invoice_sequences (store_id, financial_year, document_type, prefix, last_number) VALUES (?, ?, 'sale_invoice', ?, 0)",
      [storeRef, financialYear, prefix]
    );
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id, last_number AS lastNumber FROM invoice_sequences WHERE store_id = ? AND financial_year = ? AND document_type = 'sale_invoice' FOR UPDATE",
      [storeRef, financialYear]
    );
    const next = Number(rows[0]?.lastNumber ?? 0) + 1;
    await connection.execute(
      "UPDATE invoice_sequences SET last_number = ? WHERE id = ?",
      [next, rows[0]?.id]
    );
    await connection.commit();
    return `${prefix}${String(next).padStart(6, "0")}`;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // transaction may already be rolled back
    }
    throw error;
  } finally {
    await connection.end();
  }
}

async function initiateRefund(
  paymentId: number,
  amountPaise: number,
  providerRefundId: string
) {
  const connection = await openProofConnection();
  try {
    await connection.beginTransaction();
    const [paymentRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT amount FROM payment_records WHERE id = ? FOR UPDATE",
      [paymentId]
    );
    const refundable = Number(paymentRows[0]?.amount ?? 0);
    const [refundRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COALESCE(SUM(amountPaise), 0) AS consumed FROM refunds WHERE paymentId = ? AND status IN ('pending', 'success') FOR UPDATE",
      [paymentId]
    );
    const consumed = Number(refundRows[0]?.consumed ?? 0);
    if (consumed + amountPaise > refundable) {
      await connection.rollback();
      throw new Error("CONTROLLED_REFUND_EXCEEDS_REFUNDABLE_AMOUNT");
    }
    await connection.execute(
      "INSERT INTO refunds (paymentId, orderId, provider, providerRefundId, amountPaise, status, reason, initiatedBy) VALUES (?, 0, 'proof-provider', ?, ?, 'pending', 'proof refund idempotency race', 0)",
      [paymentId, providerRefundId, amountPaise]
    );
    await connection.commit();
    return { ok: true as const };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // transaction may already be rolled back
    }
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await connection.end();
  }
}

async function insertH1Entry(
  fixture: ProofFixture,
  saleRef: string,
  saleLineRef: string
) {
  const connection = await openProofConnection();
  try {
    await connection.execute(
      "INSERT INTO h1_register (storeId, storeRef, patientName, patientPhone, prescribingDoctor, doctorName, doctorRegNo, drugName, productId, batchNo, batchLedgerId, batchId, qty, saleRef, saleLineRef, saleBillNo, statutoryContextStatus, pharmacistId, billNo) VALUES (?, ?, 'Proof Patient', '+910000000099', 'Dr Proof', 'Dr Proof', 'REG-PROOF', 'Proof H1 Drug', ?, ?, ?, ?, 1, ?, ?, ?, 'complete', ?, ?)",
      [
        fixture.store.id,
        String(fixture.store.id),
        String(fixture.productSet.product.id),
        fixture.productSet.batch.batchNumber,
        String(fixture.productSet.batch.id),
        String(fixture.productSet.batch.id),
        saleRef,
        saleLineRef,
        `BILL-${fixture.ctx.runId}`,
        fixture.staff.id,
        `BILL-${fixture.ctx.runId}`,
      ]
    );
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await connection.end();
  }
}

async function commitPurchaseOnce(
  fixture: ProofFixture,
  purchaseInvoiceId: number,
  qty: number
) {
  const connection = await openProofConnection();
  try {
    await connection.beginTransaction();
    const [invoiceRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT status FROM purchase_invoices WHERE id = ? FOR UPDATE",
      [purchaseInvoiceId]
    );
    if (invoiceRows[0]?.status !== "draft") {
      await connection.rollback();
      throw new Error("CONTROLLED_PURCHASE_ALREADY_COMMITTED");
    }
    const [beforeRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT qtyOnHand FROM batches WHERE id = ? FOR UPDATE",
      [fixture.productSet.batch.id]
    );
    const qtyBefore = Number(beforeRows[0]?.qtyOnHand ?? 0);
    await connection.execute(
      "UPDATE batches SET qtyOnHand = qtyOnHand + ?, quantity = quantity + ?, status = 'active' WHERE id = ?",
      [qty, qty, fixture.productSet.batch.id]
    );
    await connection.execute(
      "INSERT INTO stock_movements (batchId, storeId, movementType, qty, qtyBefore, qtyAfter, referenceType, referenceId, reason, performedBy) VALUES (?, ?, 'purchase_inward', ?, ?, ?, ?, ?, 'proof purchase duplicate commit race', ?)",
      [
        fixture.productSet.batch.id,
        fixture.store.id,
        qty,
        qtyBefore,
        qtyBefore + qty,
        `proof:${fixture.ctx.runId}:purchase`,
        purchaseInvoiceId,
        fixture.staff.id,
      ]
    );
    await connection.execute(
      "UPDATE purchase_invoices SET status = 'committed', approvedBy = ?, approvedAt = NOW(), committedAt = NOW() WHERE id = ?",
      [fixture.staff.id, purchaseInvoiceId]
    );
    await connection.commit();
    return { ok: true as const };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // transaction may already be rolled back
    }
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await connection.end();
  }
}

describeWithDb("MySQL concurrency proof harness", () => {
  beforeAll(async () => {
    await applyTestMigrations(testDatabaseUrl);
  }, 120_000);

  describe("safety guard", () => {
    it("refuses missing, non-test, and runtime-mirrored database URLs", () => {
      expect(() => requireSafeTestDatabaseUrl(undefined)).toThrow(
        TEST_DB_ENV_VAR
      );
      expect(() =>
        requireSafeTestDatabaseUrl(
          "mysql://user:pass@127.0.0.1:3306/pharmacy_prod"
        )
      ).toThrow(/database name must include "test"/);
      const originalDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = testDatabaseUrl;
      try {
        expect(() => requireSafeTestDatabaseUrl(testDatabaseUrl)).toThrow(
          /separate from DATABASE_URL/
        );
      } finally {
        if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = originalDatabaseUrl;
      }
    });
  });

  it("A. allows only one concurrent sale stock decrement and writes one movement", async () => {
    let fixture: ProofFixture | undefined;
    try {
      fixture = await createProofFixture("sale", 1);
      const referenceType = `proof:${fixture.ctx.runId}:sale`;
      const results = await Promise.all([
        confirmSaleOnce(
          fixture.productSet.batch.id,
          fixture.store.id,
          fixture.staff.id,
          1,
          referenceType
        ),
        confirmSaleOnce(
          fixture.productSet.batch.id,
          fixture.store.id,
          fixture.staff.id,
          1,
          referenceType
        ),
      ]);
      expect(results.filter(result => result.ok)).toHaveLength(1);
      expect(
        results.filter(result => !result.ok).map(result => result.error)
      ).toContain("CONTROLLED_STOCK_UNAVAILABLE");
      const [batchRows] = await fixture.ctx.connection.query<
        mysql.RowDataPacket[]
      >("SELECT qtyOnHand, quantity FROM batches WHERE id = ?", [
        fixture.productSet.batch.id,
      ]);
      expect(Number(batchRows[0]?.qtyOnHand)).toBe(0);
      expect(Number(batchRows[0]?.quantity)).toBe(0);
      const [movementRows] = await fixture.ctx.connection.query<
        mysql.RowDataPacket[]
      >(
        "SELECT COUNT(*) AS count, MIN(qtyAfter) AS minAfter FROM stock_movements WHERE batchId = ? AND referenceType = ?",
        [fixture.productSet.batch.id, referenceType]
      );
      expect(Number(movementRows[0]?.count)).toBe(1);
      expect(Number(movementRows[0]?.minAfter)).toBe(0);
    } finally {
      await disposeProofFixture(fixture);
    }
  });

  it("B. caps concurrent reservations at available stock and releases expired reservations", async () => {
    let fixture: ProofFixture | undefined;
    try {
      fixture = await createProofFixture("reservation", 2);
      const results = await Promise.all([
        reserveOnce(fixture, 101, 1),
        reserveOnce(fixture, 102, 1),
        reserveOnce(fixture, 103, 1),
      ]);
      const successfulReservations = results.filter(result => result.ok);
      expect(successfulReservations).toHaveLength(2);
      expect(
        results.filter(result => !result.ok).map(result => result.error)
      ).toContain("CONTROLLED_RESERVATION_UNAVAILABLE");
      const [activeRows] = await fixture.ctx.connection.query<
        mysql.RowDataPacket[]
      >(
        "SELECT COALESCE(SUM(qtyReserved), 0) AS reserved FROM stock_reservations WHERE batchId = ? AND status = 'active'",
        [fixture.productSet.batch.id]
      );
      expect(Number(activeRows[0]?.reserved)).toBe(2);
      const reservationToRelease = successfulReservations[0]?.reservationId;
      await fixture.ctx.connection.beginTransaction();
      await fixture.ctx.connection.execute(
        "UPDATE stock_reservations SET status = 'expired', releaseReason = ?, qtyReserved = 0 WHERE id = ? AND status = 'active'",
        [`proof:${fixture.ctx.runId}:expired`, reservationToRelease]
      );
      await fixture.ctx.connection.execute(
        "UPDATE batches SET qtyReserved = qtyReserved - 1 WHERE id = ? AND qtyReserved >= 1",
        [fixture.productSet.batch.id]
      );
      await fixture.ctx.connection.commit();
      const [batchRows] = await fixture.ctx.connection.query<
        mysql.RowDataPacket[]
      >(
        "SELECT qtyOnHand, qtyReserved, qtyOnHand - qtyReserved AS available FROM batches WHERE id = ?",
        [fixture.productSet.batch.id]
      );
      expect(Number(batchRows[0]?.qtyOnHand)).toBe(2);
      expect(Number(batchRows[0]?.qtyReserved)).toBe(1);
      expect(Number(batchRows[0]?.available)).toBe(1);
    } finally {
      await disposeProofFixture(fixture);
    }
  });

  it("C. serializes concurrent invoice sequence generation for one store/day/series", async () => {
    const storeRef = `proof-${Date.now()}-${process.pid}`;
    const prefix = "P24/";
    const connection = await openProofConnection();
    try {
      const numbers = await Promise.all(
        Array.from({ length: 12 }, () =>
          nextInvoiceNumber(storeRef, "2026-27", prefix)
        )
      );
      expect(new Set(numbers).size).toBe(numbers.length);
      expect(numbers).toEqual(
        Array.from(
          { length: 12 },
          (_, index) => `${prefix}${String(index + 1).padStart(6, "0")}`
        )
      );
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT last_number AS lastNumber FROM invoice_sequences WHERE store_id = ? AND financial_year = '2026-27' AND document_type = 'sale_invoice'",
        [storeRef]
      );
      expect(Number(rows[0]?.lastNumber)).toBe(12);
    } finally {
      await connection.execute(
        "DELETE FROM invoice_sequences WHERE store_id = ?",
        [storeRef]
      );
      await connection.end();
    }
  });

  it("D. prevents concurrent over-refund and duplicate provider refund IDs", async () => {
    let fixture: ProofFixture | undefined;
    try {
      fixture = await createProofFixture("refund", 1);
      const [paymentResult] = await fixture.ctx.connection.execute(
        "INSERT INTO payment_records (orderId, userId, gatewayOrderId, gatewayPaymentId, amount, currency, status, method, paidAt) VALUES (0, ?, ?, ?, 1000, 'INR', 'paid', 'upi', NOW())",
        [
          fixture.customer.id,
          `proof-${fixture.ctx.runId}-order`,
          `proof-${fixture.ctx.runId}-payment`,
        ]
      );
      const paymentId = insertId(paymentResult);
      const refundResults = await Promise.all([
        initiateRefund(paymentId, 700, `proof-${fixture.ctx.runId}-refund-a`),
        initiateRefund(paymentId, 700, `proof-${fixture.ctx.runId}-refund-b`),
      ]);
      expect(refundResults.filter(result => result.ok)).toHaveLength(1);
      expect(
        refundResults.filter(result => !result.ok).map(result => result.error)
      ).toContain("CONTROLLED_REFUND_EXCEEDS_REFUNDABLE_AMOUNT");
      const duplicateResults = await Promise.all([
        initiateRefund(paymentId, 100, `proof-${fixture.ctx.runId}-dupe`),
        initiateRefund(paymentId, 100, `proof-${fixture.ctx.runId}-dupe`),
      ]);
      expect(duplicateResults.filter(result => result.ok)).toHaveLength(1);
      expect(duplicateResults.filter(result => !result.ok)[0]?.error).toMatch(
        /Duplicate entry|ER_DUP_ENTRY/i
      );
      const [rows] = await fixture.ctx.connection.query<mysql.RowDataPacket[]>(
        "SELECT COALESCE(SUM(amountPaise), 0) AS refunded FROM refunds WHERE paymentId = ? AND status IN ('pending', 'success')",
        [paymentId]
      );
      expect(Number(rows[0]?.refunded)).toBeLessThanOrEqual(1000);
    } finally {
      await disposeProofFixture(fixture);
    }
  });

  it("E. blocks duplicate H1 register rows for the same string sale line references", async () => {
    let fixture: ProofFixture | undefined;
    try {
      fixture = await createProofFixture("h1", 1);
      const saleRef = `proof-${fixture.ctx.runId}-sale-ref`;
      const saleLineRef = `proof-line-${fixture.ctx.runId}-sale-line-ref`;
      const results = await Promise.all([
        insertH1Entry(fixture, saleRef, saleLineRef),
        insertH1Entry(fixture, saleRef, saleLineRef),
      ]);
      expect(results.filter(result => result.ok)).toHaveLength(1);
      expect(results.filter(result => !result.ok)[0]?.error).toMatch(
        /Duplicate entry|ER_DUP_ENTRY/i
      );
      const [rows] = await fixture.ctx.connection.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS count, MIN(patientName) AS patientName, MIN(doctorName) AS doctorName, MIN(saleRef) AS saleRef, MIN(saleLineRef) AS saleLineRef FROM h1_register WHERE saleRef = ? AND saleLineRef = ?",
        [saleRef, saleLineRef]
      );
      expect(Number(rows[0]?.count)).toBe(1);
      expect(rows[0]?.patientName).toBe("Proof Patient");
      expect(rows[0]?.doctorName).toBe("Dr Proof");
      expect(rows[0]?.saleRef).toBe(saleRef);
      expect(rows[0]?.saleLineRef).toBe(saleLineRef);
    } finally {
      await disposeProofFixture(fixture);
    }
  });

  it("F. makes duplicate purchase commit mutate stock only once", async () => {
    let fixture: ProofFixture | undefined;
    try {
      fixture = await createProofFixture("purchase", 0);
      const [invoiceResult] = await fixture.ctx.connection.execute(
        "INSERT INTO purchase_invoices (supplierId, storeId, invoiceNo, invoiceDate, sourceType, status, totalAmount, netAmount, createdBy, notes) VALUES (0, ?, ?, NOW(), 'manual', 'draft', '100.00', '100.00', ?, ?)",
        [
          fixture.store.id,
          `proof-${fixture.ctx.runId}-invoice`,
          fixture.staff.id,
          `proof:${fixture.ctx.runId}:purchase invoice`,
        ]
      );
      const purchaseInvoiceId = insertId(invoiceResult);
      await fixture.ctx.connection.execute(
        "INSERT INTO purchase_lines (purchaseInvoiceId, productId, batchNo, expiryDate, mrp, purchaseRate, saleRate, qty, rawLineText, batchId) VALUES (?, ?, ?, DATE('2035-12-31'), '100.00', '70.00', '95.00', 10, ?, ?)",
        [
          purchaseInvoiceId,
          fixture.productSet.product.id,
          fixture.productSet.batch.batchNumber,
          `proof:${fixture.ctx.runId}:purchase line`,
          fixture.productSet.batch.id,
        ]
      );
      const results = await Promise.all([
        commitPurchaseOnce(fixture, purchaseInvoiceId, 10),
        commitPurchaseOnce(fixture, purchaseInvoiceId, 10),
      ]);
      expect(results.filter(result => result.ok)).toHaveLength(1);
      expect(
        results.filter(result => !result.ok).map(result => result.error)
      ).toContain("CONTROLLED_PURCHASE_ALREADY_COMMITTED");
      const [batchRows] = await fixture.ctx.connection.query<
        mysql.RowDataPacket[]
      >("SELECT qtyOnHand, quantity FROM batches WHERE id = ?", [
        fixture.productSet.batch.id,
      ]);
      expect(Number(batchRows[0]?.qtyOnHand)).toBe(10);
      expect(Number(batchRows[0]?.quantity)).toBe(10);
      const [movementRows] = await fixture.ctx.connection.query<
        mysql.RowDataPacket[]
      >(
        "SELECT COUNT(*) AS count FROM stock_movements WHERE referenceType = ? AND referenceId = ?",
        [`proof:${fixture.ctx.runId}:purchase`, purchaseInvoiceId]
      );
      expect(Number(movementRows[0]?.count)).toBe(1);
    } finally {
      await disposeProofFixture(fixture);
    }
  });

  it("G. keeps barcode scans lookup-only while sale confirmation mutates through stock path", async () => {
    let fixture: ProofFixture | undefined;
    try {
      fixture = await createProofFixture("barcode", 1);
      const barcode = fixture.productSet.product.barcode;
      const scans = Promise.all(
        Array.from({ length: 8 }, async () => {
          const connection = await openProofConnection();
          try {
            const [rows] = await connection.query<mysql.RowDataPacket[]>(
              "SELECT p.id AS productId, b.id AS batchId, b.qtyOnHand FROM products p JOIN batches b ON b.productId = p.id WHERE p.barcode = ? AND b.id = ?",
              [barcode, fixture?.productSet.batch.id]
            );
            return Number(rows[0]?.qtyOnHand ?? -1);
          } finally {
            await connection.end();
          }
        })
      );
      const sale = confirmSaleOnce(
        fixture.productSet.batch.id,
        fixture.store.id,
        fixture.staff.id,
        1,
        `proof:${fixture.ctx.runId}:barcode-sale`
      );
      const [scanQuantities, saleResult] = await Promise.all([scans, sale]);
      expect(scanQuantities.every(qty => qty === 0 || qty === 1)).toBe(true);
      expect(saleResult.ok).toBe(true);
      const [batchRows] = await fixture.ctx.connection.query<
        mysql.RowDataPacket[]
      >("SELECT qtyOnHand FROM batches WHERE id = ?", [
        fixture.productSet.batch.id,
      ]);
      expect(Number(batchRows[0]?.qtyOnHand)).toBe(0);
      const [movementRows] = await fixture.ctx.connection.query<
        mysql.RowDataPacket[]
      >(
        "SELECT COUNT(*) AS count FROM stock_movements WHERE batchId = ? AND referenceType = ?",
        [fixture.productSet.batch.id, `proof:${fixture.ctx.runId}:barcode-sale`]
      );
      expect(Number(movementRows[0]?.count)).toBe(1);
    } finally {
      await disposeProofFixture(fixture);
    }
  });
});

describe("MySQL concurrency static proof guards", () => {
  const schemaSource = readFileSync("drizzle/schema.ts", "utf8");
  const prescriptionGovSource = readFileSync(
    "server/routers/prescriptionGovRouter.ts",
    "utf8"
  );

  it("documents DB uniqueness for invoice, refund, H1, and sale bill concurrency choke points", () => {
    expect(schemaSource).toContain("uq_invoice_seq_store_fy_doc");
    expect(schemaSource).toContain("refunds_provider_refund_id_uq");
    expect(schemaSource).toContain("uq_h1_register_sale_line_ref");
    expect(schemaSource).toContain("uq_sales_bill_no");
  });

  it("keeps H1 statutory sale references string-safe rather than Number(uuid)", () => {
    expect(schemaSource).toContain(
      'saleRef: varchar("saleRef", { length: 36 })'
    );
    expect(schemaSource).toContain(
      'saleLineRef: varchar("saleLineRef", { length: 36 })'
    );
    expect(prescriptionGovSource).not.toMatch(
      /Number\([^)]*(saleRef|saleLineRef|batchLedgerId|batchId)[^)]*\)/
    );
  });

  it("keeps barcode scan source paths lookup-oriented and free of stock mutation SQL", () => {
    const barcodeSources = [
      readFileSync("server/services/barcodeService.ts", "utf8"),
      readFileSync(
        "client/src/components/barcode/BarcodeScannerInput.tsx",
        "utf8"
      ),
    ].join("\n");
    expect(barcodeSources).not.toMatch(
      /UPDATE\s+(batches|batch_ledger|store_skus)|INSERT\s+INTO\s+stock_movements/i
    );
  });
});
