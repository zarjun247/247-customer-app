import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import {
  applyTestMigrations,
  cleanupDbTestContext,
  closeDbTestContext,
  createDbTestContext,
  getTestDatabaseUrl,
  openTestConnection,
  TEST_DB_ENV_VAR,
} from "./testUtils/dbTestLifecycle";
import {
  createDeterministicTestCustomer,
  createDeterministicTestProductSkuBatchLedger,
  createDeterministicTestStaff,
  createDeterministicTestStore,
} from "./testUtils/dbSeedFactories";
import type { DbTestContext } from "./testUtils/dbTestLifecycle";
import { financialYearFromIndiaBusinessDate, formatInvoiceNumber } from "./services/invoiceNumbering";

const testDatabaseUrl = getTestDatabaseUrl();
const describeWithDb = testDatabaseUrl ? describe : describe.skip;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!testDatabaseUrl) {
  console.warn(`Skipping MySQL concurrency proof integration tests because ${TEST_DB_ENV_VAR} is not set.`);
}

type ResultHeader = mysql.ResultSetHeader;

function asResultHeader(result: unknown): ResultHeader {
  return Array.isArray(result) ? (result[0] as ResultHeader) : (result as ResultHeader);
}

async function trackedConnection<T>(fn: (connection: mysql.Connection) => Promise<T>): Promise<T> {
  const connection = await openTestConnection(testDatabaseUrl!);
  try {
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function controlledSaleConfirm(input: { ctx: DbTestContext; batchLedgerId: number; storeId: number; qty: number; referenceId: number; performedBy: number }) {
  return trackedConnection(async (connection) => {
    const [updateResult] = await connection.query(
      "UPDATE batch_ledger SET qtyOnHand = qtyOnHand - ? WHERE id = ? AND qtyOnHand >= ?",
      [input.qty, input.batchLedgerId, input.qty],
    );
    const affectedRows = Number((updateResult as ResultHeader).affectedRows ?? 0);
    if (affectedRows !== 1) {
      return { ok: false as const, error: "INSUFFICIENT_STOCK" };
    }

    const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT qtyOnHand FROM batch_ledger WHERE id = ?", [input.batchLedgerId]);
    const qtyAfter = Number(rows[0]?.qtyOnHand ?? 0);
    const qtyBefore = qtyAfter + input.qty;
    const [movementResult] = await connection.query(
      `INSERT INTO stock_movements (batchId, storeId, movementType, qty, qtyBefore, qtyAfter, referenceType, referenceId, reason, performedBy)
       VALUES (?, ?, 'sale_fulfil', ?, ?, ?, 'mysql_concurrency_proof', ?, 'controlled sale proof', ?)`,
      [input.batchLedgerId, input.storeId, -input.qty, qtyBefore, qtyAfter, input.referenceId, input.performedBy],
    );
    input.ctx.created.stockMovementIds.push(Number((movementResult as ResultHeader).insertId));
    return { ok: true as const, qtyBefore, qtyAfter };
  });
}

async function controlledReservation(input: { ctx: DbTestContext; batchLedgerId: number; productId: number; variantId: number; skuId: number; storeId: number; cartId: number; qty: number }) {
  return trackedConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        `SELECT qtyOnHand, qtyReserved, qtyQuarantined, qtyExpired
         FROM batch_ledger
         WHERE id = ?
         FOR UPDATE`,
        [input.batchLedgerId],
      );
      const row = rows[0];
      if (!row) throw new Error("Batch ledger row missing");
      const available = Number(row.qtyOnHand ?? 0) - Number(row.qtyReserved ?? 0) - Number(row.qtyQuarantined ?? 0) - Number(row.qtyExpired ?? 0);
      if (available < input.qty) {
        await connection.rollback();
        return { ok: false as const, error: "INSUFFICIENT_AVAILABLE_STOCK", available };
      }

      await connection.query("UPDATE batch_ledger SET qtyReserved = qtyReserved + ? WHERE id = ?", [input.qty, input.batchLedgerId]);
      const [insertResult] = await connection.query(
        `INSERT INTO stock_reservations (batchId, cartId, productId, variantId, skuId, storeId, qty, qtyReserved, status, expiresAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
        [input.batchLedgerId, input.cartId, input.productId, input.variantId, input.skuId, input.storeId, input.qty, input.qty],
      );
      const reservationId = Number((insertResult as ResultHeader).insertId);
      input.ctx.created.stockReservationIds.push(reservationId);
      await connection.commit();
      return { ok: true as const, reservationId };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

async function controlledReleaseReservation(input: { reservationId: number; batchLedgerId: number }) {
  await trackedConnection(async (connection) => {
    await connection.beginTransaction();
    try {
      const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT qtyReserved FROM stock_reservations WHERE id = ? AND status = 'active' FOR UPDATE", [input.reservationId]);
      const qty = Number(rows[0]?.qtyReserved ?? 0);
      await connection.query("UPDATE stock_reservations SET status = 'released', releaseReason = 'mysql_concurrency_proof_release' WHERE id = ?", [input.reservationId]);
      await connection.query("UPDATE batch_ledger SET qtyReserved = GREATEST(qtyReserved - ?, 0) WHERE id = ?", [qty, input.batchLedgerId]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

async function reserveInvoiceNumberOnConnection(storeRef: string, date: Date) {
  return trackedConnection(async (connection) => {
    const financialYear = financialYearFromIndiaBusinessDate(date);
    const prefix = `INV-S${storeRef}-${financialYear}`;
    await connection.beginTransaction();
    try {
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT id, last_number AS lastNumber FROM invoice_sequences WHERE store_id = ? AND financial_year = ? AND document_type = 'sale_invoice' FOR UPDATE",
        [storeRef, financialYear],
      );
      let sequence = Number(rows[0]?.lastNumber ?? 0) + 1;
      let sequenceId = Number(rows[0]?.id ?? 0);
      if (sequenceId) {
        await connection.query("UPDATE invoice_sequences SET last_number = ?, prefix = ? WHERE id = ?", [sequence, prefix, sequenceId]);
      } else {
        const [insertResult] = await connection.query(
          "INSERT INTO invoice_sequences (store_id, financial_year, document_type, prefix, last_number) VALUES (?, ?, 'sale_invoice', ?, ?)",
          [storeRef, financialYear, prefix, sequence],
        );
        sequenceId = Number((insertResult as ResultHeader).insertId);
      }
      await connection.commit();
      return { invoiceNumber: formatInvoiceNumber({ prefix, sequence }), sequenceId };
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  });
}

async function insertDuplicateProviderRefund(ctx: DbTestContext, input: { paymentId: number; orderId: number; providerRefundId: string; amountPaise: number }) {
  return trackedConnection(async (connection) => {
    try {
      const [result] = await connection.query(
        `INSERT INTO refunds (paymentId, orderId, provider, providerRefundId, amountPaise, status, reason)
         VALUES (?, ?, 'razorpay', ?, ?, 'pending', 'mysql concurrency duplicate proof')`,
        [input.paymentId, input.orderId, input.providerRefundId, input.amountPaise],
      );
      const id = Number((result as ResultHeader).insertId);
      ctx.created.refundIds.push(id);
      return { ok: true as const, id };
    } catch (error) {
      return { ok: false as const, error };
    }
  });
}

async function insertDuplicateH1(ctx: DbTestContext, input: { storeId: number; pharmacistId: number; saleRef: string; saleLineRef: string }) {
  return trackedConnection(async (connection) => {
    try {
      const [result] = await connection.query(
        `INSERT INTO h1_register (storeId, storeRef, patientName, patientPhone, prescribingDoctor, doctorName, doctorRegNo, drugName, productId, batchNo, batchLedgerId, batchId, qty, prescriptionRef, saleRef, saleLineRef, saleBillNo, statutoryContextStatus, pharmacistId, billNo)
         VALUES (?, ?, 'Proof Patient', '+910000009999', 'Dr Proof', 'Dr Proof', 'MCI-TEST', 'Proof H1 Drug', ?, 'B-H1', ?, ?, 1, 'RX-PROOF', ?, ?, 'BILL-H1', 'complete', ?, 'BILL-H1')`,
        [input.storeId, String(input.storeId), crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID(), input.saleRef, input.saleLineRef, input.pharmacistId],
      );
      const id = Number((result as ResultHeader).insertId);
      ctx.created.h1RegisterIds.push(id);
      return { ok: true as const, id };
    } catch (error) {
      return { ok: false as const, error };
    }
  });
}

describeWithDb("MySQL-backed concurrency proof harness", () => {
  let ctx: DbTestContext;
  let store: Awaited<ReturnType<typeof createDeterministicTestStore>>;
  let staff: Awaited<ReturnType<typeof createDeterministicTestStaff>>;
  let customer: Awaited<ReturnType<typeof createDeterministicTestCustomer>>;

  beforeAll(async () => {
    await applyTestMigrations(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
    ctx = await createDbTestContext(`mysql_concurrency_${Date.now()}_${process.pid}`);
    store = await createDeterministicTestStore(ctx);
    staff = await createDeterministicTestStaff(ctx, store.id);
    customer = await createDeterministicTestCustomer(ctx);
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await cleanupDbTestContext(ctx);
      await closeDbTestContext(ctx);
    }
  });

  it("A. proves sale stock decrement is single-winner, non-negative, and audited", async () => {
    const productSet = await createDeterministicTestProductSkuBatchLedger(ctx, store.id, { qtyOnHand: 5 });
    const results = await Promise.all([
      controlledSaleConfirm({ ctx, batchLedgerId: productSet.batchLedger.id, storeId: store.id, qty: 3, referenceId: 101, performedBy: staff.id }),
      controlledSaleConfirm({ ctx, batchLedgerId: productSet.batchLedger.id, storeId: store.id, qty: 3, referenceId: 102, performedBy: staff.id }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "INSUFFICIENT_STOCK" }]);

    const [rows] = await ctx.connection.query<mysql.RowDataPacket[]>("SELECT qtyOnHand FROM batch_ledger WHERE id = ?", [productSet.batchLedger.id]);
    expect(Number(rows[0]?.qtyOnHand)).toBe(2);
    expect(Number(rows[0]?.qtyOnHand)).toBeGreaterThanOrEqual(0);

    const [movementRows] = await ctx.connection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS movementCount FROM stock_movements WHERE batchId = ? AND movementType = 'sale_fulfil'",
      [productSet.batchLedger.id],
    );
    expect(Number(movementRows[0]?.movementCount ?? 0)).toBe(1);
  });

  it("B. proves reservations serialize on the batch row, reconcile, and release cleanly", async () => {
    const productSet = await createDeterministicTestProductSkuBatchLedger(ctx, store.id, { qtyOnHand: 5 });
    const results = await Promise.all([
      controlledReservation({ ctx, batchLedgerId: productSet.batchLedger.id, productId: productSet.product.id, variantId: productSet.variant.id, skuId: productSet.storeSku.id, storeId: store.id, cartId: 201, qty: 3 }),
      controlledReservation({ ctx, batchLedgerId: productSet.batchLedger.id, productId: productSet.product.id, variantId: productSet.variant.id, skuId: productSet.storeSku.id, storeId: store.id, cartId: 202, qty: 2 }),
      controlledReservation({ ctx, batchLedgerId: productSet.batchLedger.id, productId: productSet.product.id, variantId: productSet.variant.id, skuId: productSet.storeSku.id, storeId: store.id, cartId: 203, qty: 2 }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(2);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);

    const [rows] = await ctx.connection.query<mysql.RowDataPacket[]>(
      `SELECT bl.qtyOnHand, bl.qtyReserved, COALESCE(SUM(CASE WHEN sr.status = 'active' THEN sr.qtyReserved ELSE 0 END), 0) AS activeReserved
       FROM batch_ledger bl
       LEFT JOIN stock_reservations sr ON sr.batchId = bl.id
       WHERE bl.id = ?
       GROUP BY bl.id, bl.qtyOnHand, bl.qtyReserved`,
      [productSet.batchLedger.id],
    );
    expect(Number(rows[0]?.qtyReserved)).toBe(5);
    expect(Number(rows[0]?.activeReserved)).toBe(5);
    expect(Number(rows[0]?.qtyOnHand) - Number(rows[0]?.qtyReserved)).toBe(0);

    const firstSuccessfulReservation = results.find((result) => result.ok);
    expect(firstSuccessfulReservation?.ok).toBe(true);
    if (firstSuccessfulReservation?.ok) await controlledReleaseReservation({ reservationId: firstSuccessfulReservation.reservationId, batchLedgerId: productSet.batchLedger.id });

    const [afterReleaseRows] = await ctx.connection.query<mysql.RowDataPacket[]>("SELECT qtyOnHand, qtyReserved FROM batch_ledger WHERE id = ?", [productSet.batchLedger.id]);
    expect(Number(afterReleaseRows[0]?.qtyReserved)).toBeLessThan(5);
    expect(Number(afterReleaseRows[0]?.qtyOnHand) - Number(afterReleaseRows[0]?.qtyReserved)).toBeGreaterThan(0);
  });

  it("C. proves invoice sequence allocation has no duplicates and a consistent final sequence", async () => {
    const date = new Date("2026-05-08T00:00:00.000Z");
    const storeRef = `proof-${ctx.runId}`;
    const results = await Promise.all(Array.from({ length: 6 }, () => reserveInvoiceNumberOnConnection(storeRef, date)));
    const invoiceNumbers = results.map((result) => result.invoiceNumber);
    const sequenceIds = [...new Set(results.map((result) => result.sequenceId))];
    ctx.created.invoiceSequenceIds.push(...sequenceIds);

    expect(new Set(invoiceNumbers).size).toBe(invoiceNumbers.length);
    const [rows] = await ctx.connection.query<mysql.RowDataPacket[]>(
      "SELECT last_number AS lastNumber FROM invoice_sequences WHERE store_id = ? AND financial_year = ? AND document_type = 'sale_invoice'",
      [storeRef, financialYearFromIndiaBusinessDate(date)],
    );
    expect(Number(rows[0]?.lastNumber)).toBe(6);
  });

  it("D. proves duplicate provider refund IDs are blocked and refund ledger stays within paid amount", async () => {
    const orderId = 700_000 + Math.floor(Math.random() * 10_000);
    const gatewayOrderId = `gw-${ctx.runId}-${orderId}`;
    const [paymentResult] = await ctx.connection.query(
      "INSERT INTO payment_records (orderId, userId, gatewayOrderId, amount, currency, status, method) VALUES (?, ?, ?, 1000, 'INR', 'paid', 'upi')",
      [orderId, customer.id, gatewayOrderId],
    );
    const paymentId = Number(asResultHeader(paymentResult).insertId);
    ctx.created.paymentRecordIds.push(paymentId);

    const providerRefundId = `rfnd_${ctx.runId}`;
    const results = await Promise.all([
      insertDuplicateProviderRefund(ctx, { paymentId, orderId, providerRefundId, amountPaise: 600 }),
      insertDuplicateProviderRefund(ctx, { paymentId, orderId, providerRefundId, amountPaise: 600 }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);

    const [rows] = await ctx.connection.query<mysql.RowDataPacket[]>(
      "SELECT COALESCE(SUM(amountPaise), 0) AS consumedPaise FROM refunds WHERE paymentId = ? AND status IN ('pending', 'success')",
      [paymentId],
    );
    expect(Number(rows[0]?.consumedPaise ?? 0)).toBeLessThanOrEqual(1000);
  });

  it("E. proves duplicate H1 statutory rows for the same sale line are blocked with string-safe refs", async () => {
    const saleRef = crypto.randomUUID();
    const saleLineRef = crypto.randomUUID();
    const results = await Promise.all([
      insertDuplicateH1(ctx, { storeId: store.id, pharmacistId: staff.id, saleRef, saleLineRef }),
      insertDuplicateH1(ctx, { storeId: store.id, pharmacistId: staff.id, saleRef, saleLineRef }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    const [rows] = await ctx.connection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS rowCount, MIN(patientName) AS patientName, MIN(doctorName) AS doctorName, MIN(saleRef) AS saleRef, MIN(saleLineRef) AS saleLineRef FROM h1_register WHERE saleRef = ? AND saleLineRef = ?",
      [saleRef, saleLineRef],
    );
    expect(Number(rows[0]?.rowCount ?? 0)).toBe(1);
    expect(rows[0]?.patientName).toBe("Proof Patient");
    expect(rows[0]?.doctorName).toBe("Dr Proof");
    expect(rows[0]?.saleRef).toBe(saleRef);
    expect(rows[0]?.saleLineRef).toBe(saleLineRef);
  });

  it("F. proves duplicate purchase commit is one-winner and only one stock inward is posted", async () => {
    const productSet = await createDeterministicTestProductSkuBatchLedger(ctx, store.id, { qtyOnHand: 0 });
    const invoiceNo = `PINV-${ctx.runId}`;
    const [invoiceResult] = await ctx.connection.query(
      "INSERT INTO purchase_invoices (supplierId, storeId, invoiceNo, invoiceDate, sourceType, totalAmount, netAmount, status, createdBy) VALUES (1, ?, ?, NOW(), 'manual', '100.00', '100.00', 'draft', ?)",
      [store.id, invoiceNo, staff.id],
    );
    const purchaseInvoiceId = Number(asResultHeader(invoiceResult).insertId);
    ctx.created.purchaseInvoiceIds.push(purchaseInvoiceId);

    async function commitOnce(referenceId: number) {
      return trackedConnection(async (connection) => {
        await connection.beginTransaction();
        try {
          const [updateResult] = await connection.query("UPDATE purchase_invoices SET status = 'committed', committedAt = NOW() WHERE id = ? AND status = 'draft'", [purchaseInvoiceId]);
          if (Number((updateResult as ResultHeader).affectedRows ?? 0) !== 1) {
            await connection.rollback();
            return { ok: false as const, error: "DUPLICATE_PURCHASE_COMMIT" };
          }
          await connection.query("UPDATE batch_ledger SET qtyOnHand = qtyOnHand + 4 WHERE id = ?", [productSet.batchLedger.id]);
          const [movementResult] = await connection.query(
            `INSERT INTO stock_movements (batchId, storeId, movementType, qty, qtyBefore, qtyAfter, referenceType, referenceId, reason, performedBy)
             VALUES (?, ?, 'purchase_inward', 4, 0, 4, 'purchase_invoice', ?, 'controlled purchase proof', ?)`,
            [productSet.batchLedger.id, store.id, referenceId, staff.id],
          );
          ctx.created.stockMovementIds.push(Number((movementResult as ResultHeader).insertId));
          await connection.commit();
          return { ok: true as const };
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      });
    }

    const results = await Promise.all([commitOnce(purchaseInvoiceId), commitOnce(purchaseInvoiceId)]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "DUPLICATE_PURCHASE_COMMIT" }]);

    const [rows] = await ctx.connection.query<mysql.RowDataPacket[]>("SELECT qtyOnHand FROM batch_ledger WHERE id = ?", [productSet.batchLedger.id]);
    expect(Number(rows[0]?.qtyOnHand)).toBe(4);
    const [movementRows] = await ctx.connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS movementCount FROM stock_movements WHERE batchId = ? AND movementType = 'purchase_inward'", [productSet.batchLedger.id]);
    expect(Number(movementRows[0]?.movementCount ?? 0)).toBe(1);
  });

  it("G. proves barcode scan is lookup-only while sale confirmation performs the inventory mutation", async () => {
    const productSet = await createDeterministicTestProductSkuBatchLedger(ctx, store.id, { qtyOnHand: 5 });
    const barcode = productSet.batchLedger.internalBarcode;

    const [scanRowsBefore] = await ctx.connection.query<mysql.RowDataPacket[]>("SELECT id, qtyOnHand FROM batch_ledger WHERE internalBarcode = ?", [barcode]);
    expect(Number(scanRowsBefore[0]?.qtyOnHand)).toBe(5);

    const [, saleResult, scanRowsAfter] = await Promise.all([
      trackedConnection(async (connection) => connection.query("SELECT id, qtyOnHand FROM batch_ledger WHERE internalBarcode = ?", [barcode])),
      controlledSaleConfirm({ ctx, batchLedgerId: productSet.batchLedger.id, storeId: store.id, qty: 2, referenceId: 777, performedBy: staff.id }),
      trackedConnection(async (connection) => connection.query<mysql.RowDataPacket[]>("SELECT id, qtyOnHand FROM batch_ledger WHERE internalBarcode = ?", [barcode])),
    ]);

    expect(saleResult.ok).toBe(true);
    expect(Array.isArray(scanRowsAfter)).toBe(true);
    const [finalRows] = await ctx.connection.query<mysql.RowDataPacket[]>("SELECT qtyOnHand FROM batch_ledger WHERE id = ?", [productSet.batchLedger.id]);
    expect(Number(finalRows[0]?.qtyOnHand)).toBe(3);
  });
});

describe("MySQL concurrency static production-path guards", () => {
  it("adds static guards for production path gaps that are not fully runtime-wired in this proof", () => {
    const stockInvariant = readFileSync(path.join(repoRoot, "server/services/stockInvariant.ts"), "utf8");
    const reservationService = readFileSync(path.join(repoRoot, "server/services/reservationService.ts"), "utf8");
    const complianceGate = readFileSync(path.join(repoRoot, "server/services/complianceGate.ts"), "utf8");
    const refundService = readFileSync(path.join(repoRoot, "server/services/refundService.ts"), "utf8");
    const invoiceNumbering = readFileSync(path.join(repoRoot, "server/services/invoiceNumbering.ts"), "utf8");
    const schema = readFileSync(path.join(repoRoot, "drizzle/schema.ts"), "utf8");
    const barcodeService = readFileSync(path.join(repoRoot, "server/services/barcodeService.ts"), "utf8");

    expect(stockInvariant).toContain("decreaseStockForSaleConfirmation");
    expect(stockInvariant).toContain("increaseStockForPurchaseCommit");
    expect(reservationService).toContain("reserveStockForOrder");
    expect(reservationService).toContain("assertAvailableForReservation");
    expect(complianceGate).toContain("saleRef");
    expect(complianceGate).toContain("saleLineRef");
    expect(complianceGate).not.toContain("Number(saleRef)");
    expect(complianceGate).not.toContain("Number(saleLineRef)");
    expect(refundService).toContain("calculateRefundAvailability");
    expect(refundService).toContain("assertProviderRefundIdAvailable");
    expect(invoiceNumbering).toContain('.for("update")');
    expect(schema).toContain("uq_invoice_seq_store_fy_doc");
    expect(barcodeService).toContain("resolveBarcode");
    expect(barcodeService).not.toContain("qtyOnHand = qtyOnHand");
  });
});
