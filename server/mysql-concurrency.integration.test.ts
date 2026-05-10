import { afterAll, beforeAll, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { batchLedger, batches, counterPayments, idempotencyKeys, paymentRecords, providerWebhookEvents, purchaseInvoices, purchaseLines, refunds, saleLines, sales, stockMovements, h1Register, invoiceSequences, stockReservations } from "../drizzle/schema";
import * as schema from "../drizzle/schema";
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
  createDeterministicTestProductSkuBatch,
  createDeterministicTestStaff,
  createDeterministicTestStore,
} from "./testUtils/dbSeedFactories";
import { reserveInvoiceNumber } from "./services/invoiceNumbering";
import { commitPurchaseInvoiceExactlyOnce, confirmSaleExactlyOnce, settleProviderRefundExactlyOnce } from "./services/commercialTruthSeams";
import { handleRazorpayWebhook } from "./services/paymentWebhookLifecycle";
import { claimReservationTerminalState } from "./services/reservationService";
import type { DbTestContext } from "./testUtils/dbTestLifecycle";

const testDatabaseUrl = getTestDatabaseUrl();
const describeWithDb = testDatabaseUrl ? describe : describe.skip;

if (!testDatabaseUrl) {
  console.warn(`Skipping MySQL concurrency integration proof because ${TEST_DB_ENV_VAR} is not set. DB-backed race proof is not claimed.`);
}

type Seed = Awaited<ReturnType<typeof seedConcurrencyFixture>>;

type SqlResult = mysql.ResultSetHeader;

async function insertId(connection: mysql.Connection, sql: string, values: unknown[]): Promise<number> {
  const [result] = await connection.execute<SqlResult>(sql, values);
  expect(result.insertId).toBeGreaterThan(0);
  return result.insertId;
}

async function seedConcurrencyFixture(ctx: DbTestContext, suffix: string) {
  const fixtureRunId = `${ctx.runId.slice(-12)}-${suffix.slice(0, 10)}`;
  const store = await createDeterministicTestStore(ctx, fixtureRunId);
  const customerA = await createDeterministicTestCustomer(ctx, fixtureRunId);
  const staff = await createDeterministicTestStaff(ctx, store.id, fixtureRunId);
  const productSet = await createDeterministicTestProductSkuBatch(ctx, store.id, fixtureRunId);
  await ctx.connection.execute("UPDATE batches SET qtyOnHand = 1, quantity = 1, qtyReserved = 0 WHERE id = ?", [productSet.batch.id]);
  await ctx.connection.execute("UPDATE store_skus SET stockQty = 1, softLockedQty = 0 WHERE id = ?", [productSet.storeSku.id]);

  const customerB = await insertId(
    ctx.connection,
    "INSERT INTO users (openId, name, email, phone, loginMethod, role, onboardingComplete) VALUES (?, ?, ?, ?, 'test', 'customer', 1)",
    [`test-customer-b-${fixtureRunId}`, "Test Customer B", `customer-b-${fixtureRunId}@example.test`, "+910000000003"],
  );
  ctx.created.userIds.push(customerB);

  const orderA = await insertId(
    ctx.connection,
    "INSERT INTO orders (userId, storeId, status, subtotal, total, source) VALUES (?, ?, 'draft', '95.00', '95.00', 'app')",
    [customerA.id, store.id],
  );
  const orderB = await insertId(
    ctx.connection,
    "INSERT INTO orders (userId, storeId, status, subtotal, total, source) VALUES (?, ?, 'draft', '95.00', '95.00', 'app')",
    [customerB, store.id],
  );

  return { store, customerA, customerB, staff, productSet, orderA, orderB };
}

async function cleanupConcurrencyRows(ctx: DbTestContext) {
  await ctx.connection.execute("DELETE FROM idempotency_keys WHERE `key` LIKE ? OR entityId LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM stock_movements WHERE reason LIKE ?", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM h1_register WHERE saleRef LIKE ? OR saleLineRef LIKE ? OR prescriptionRef LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM provider_webhook_events WHERE idempotencyKey LIKE ? OR providerEventId LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM payment_records WHERE gatewayOrderId LIKE ? OR gatewayPaymentId LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM refunds WHERE providerRefundId LIKE ?", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM counter_payments WHERE id LIKE ? OR sale_id LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM invoice_snapshots WHERE bill_no LIKE ? OR sale_id LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM sale_lines WHERE id LIKE ? OR sale_id LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM sales WHERE id LIKE ? OR bill_no LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM stock_reservations WHERE releaseReason LIKE ?", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM order_items WHERE orderId IN (SELECT id FROM orders WHERE statusReason LIKE ?)", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM orders WHERE statusReason LIKE ? OR deliveryAddress LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM purchase_lines WHERE batchNo LIKE ?", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM purchase_invoices WHERE invoiceNo LIKE ?", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM batch_ledger WHERE batchNo LIKE ?", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM invoice_sequences WHERE store_id LIKE ?", [`%${ctx.runId}%`]);
}

async function reserveOneUnit(seed: Seed, runId: string, orderId: number) {
  const connection = await openTestConnection(testDatabaseUrl);
  try {
    await connection.beginTransaction();
    const [update] = await connection.execute<SqlResult>(
      "UPDATE batches SET qtyReserved = COALESCE(qtyReserved, 0) + 1 WHERE id = ? AND COALESCE(qtyOnHand, quantity, 0) - COALESCE(qtyReserved, 0) >= 1",
      [seed.productSet.batch.id],
    );
    if (update.affectedRows === 1) {
      await connection.execute(
        "INSERT INTO stock_reservations (batchId, orderId, productId, variantId, skuId, storeId, qty, qtyReserved, status, releaseReason, expiresAt) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'active', ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))",
        [seed.productSet.batch.id, orderId, seed.productSet.product.id, seed.productSet.variant.id, seed.productSet.storeSku.id, seed.store.id, `mysql-concurrency-${runId}`],
      );
    }
    await connection.commit();
    return update.affectedRows === 1;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

async function consumeOneUnitAtPos(seed: Seed) {
  const connection = await openTestConnection(testDatabaseUrl);
  try {
    await connection.beginTransaction();
    const [update] = await connection.execute<SqlResult>(
      "UPDATE batches SET qtyOnHand = COALESCE(qtyOnHand, quantity, 0) - 1, quantity = quantity - 1 WHERE id = ? AND COALESCE(qtyOnHand, quantity, 0) - COALESCE(qtyReserved, 0) >= 1",
      [seed.productSet.batch.id],
    );
    await connection.commit();
    return update.affectedRows === 1;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
}

async function createPurchaseCommitFixture(ctx: DbTestContext, seed: Seed) {
  const invoiceId = await insertId(
    ctx.connection,
    "INSERT INTO purchase_invoices (supplierId, storeId, invoiceNo, invoiceDate, netAmount, createdBy, status) VALUES (1, ?, ?, NOW(), '100.00', ?, 'draft')",
    [seed.store.id, `PINV-${ctx.runId}`, seed.staff.id],
  );
  await ctx.connection.execute(
    "INSERT INTO purchase_lines (purchaseInvoiceId, productId, batchNo, expiryDate, mrp, purchaseRate, saleRate, qty, freeQty, gstRate) VALUES (?, ?, ?, '2035-12-31', '100.00', '70.00', '95.00', 3, 0, '12.00')",
    [invoiceId, seed.productSet.product.id, `PL-${ctx.runId}`],
  );
  return invoiceId;
}

async function createSaleConfirmFixture(ctx: DbTestContext, seed: Seed) {
  const ledgerId = await insertId(
    ctx.connection,
    "INSERT INTO batch_ledger (productId, storeId, batchNo, expiryDate, mrp, purchaseRate, saleRate, qtyOnHand, qtyReserved, qtyQuarantined, qtyExpired, status, createdBy) VALUES (?, ?, ?, '2035-12-31', '100.00', '70.00', '95.00', 1, 0, 0, 0, 'active', ?)",
    [seed.productSet.product.id, seed.store.id, `SL-${ctx.runId}`, seed.staff.id],
  );
  const saleId = `1${String(Date.now()).slice(-6)}`;
  await ctx.connection.execute(
    "INSERT INTO sales (id, bill_no, sale_type, store_id, subtotal, discount_amount, gst_amount, total, payment_mode, status, bill_printed, whatsapp_sent, email_sent, created_by, created_at, updated_at) VALUES (?, ?, 'counter', ?, '95.00', '0.00', '0.00', '95.00', 'cash', 'draft', 0, 0, 0, ?, ?, ?)",
    [saleId, `DRF-${ctx.runId}`, String(seed.store.id), String(seed.staff.id), Date.now(), Date.now()],
  );
  await ctx.connection.execute(
    "INSERT INTO sale_lines (id, sale_id, product_id, batch_ledger_id, batch_no, expiry_date, mrp, sale_rate, qty, discount_pct, discount_amount, gst_rate, gst_amount, line_total, requires_prescription, rx_cleared, created_at) VALUES (?, ?, ?, ?, ?, '2035-12-31', '100.00', '95.00', 1, '0.00', '0.00', '0.00', '0.00', '95.00', 0, 1, ?)",
    [`ln-${ctx.runId.slice(-12)}`, saleId, String(seed.productSet.product.id), String(ledgerId), `SL-${ctx.runId}`, Date.now()],
  );
  return { saleId, ledgerId };
}

function webhookSignature(rawBody: string) {
  return crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET ?? "mysql-concurrency-secret").update(rawBody).digest("hex");
}

describeWithDb("MySQL-backed concurrency proof harness", () => {
  let ctx: DbTestContext;
  let previousDatabaseUrl: string | undefined;
  let previousWebhookEnabled: string | undefined;
  let previousWebhookSecret: string | undefined;

  beforeAll(async () => {
    previousDatabaseUrl = process.env.DATABASE_URL;
    previousWebhookEnabled = process.env.PAYMENT_WEBHOOK_ENABLED;
    previousWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    process.env.PAYMENT_WEBHOOK_ENABLED = "true";
    process.env.RAZORPAY_WEBHOOK_SECRET = "mysql-concurrency-secret";
    await applyTestMigrations(testDatabaseUrl);
    ctx = await createDbTestContext(`mysql_concurrency_${Date.now()}_${process.pid}`);
    process.env.DATABASE_URL = testDatabaseUrl;
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await cleanupConcurrencyRows(ctx);
      await cleanupDbTestContext(ctx);
      await closeDbTestContext(ctx);
    }
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousWebhookEnabled === undefined) delete process.env.PAYMENT_WEBHOOK_ENABLED; else process.env.PAYMENT_WEBHOOK_ENABLED = previousWebhookEnabled;
    if (previousWebhookSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET; else process.env.RAZORPAY_WEBHOOK_SECRET = previousWebhookSecret;
  });

  it("proves the last-unit reservation race is protected by an atomic DB predicate", async () => {
    const seed = await seedConcurrencyFixture(ctx, "last-unit");
    await ctx.connection.execute("UPDATE orders SET statusReason = ?, deliveryAddress = ? WHERE id IN (?, ?)", [ctx.runId, ctx.runId, seed.orderA, seed.orderB]);

    const outcomes = await Promise.all([reserveOneUnit(seed, ctx.runId, seed.orderA), reserveOneUnit(seed, ctx.runId, seed.orderB)]);

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const [batch] = await ctx.db.select().from(batches).where(eq(batches.id, seed.productSet.batch.id)).limit(1);
    expect(batch.qtyReserved).toBe(1);
    expect(batch.qtyOnHand).toBe(1);
    expect((batch.qtyOnHand ?? 0) - (batch.qtyReserved ?? 0)).toBe(0);
    const reservations = await ctx.db.select().from(stockReservations).where(eq(stockReservations.batchId, seed.productSet.batch.id));
    expect(reservations).toHaveLength(1);
  });

  it("proves a POS sale and app reservation cannot both consume the same last SKU/batch unit", async () => {
    const seed = await seedConcurrencyFixture(ctx, "pos-app");
    await ctx.connection.execute("UPDATE orders SET statusReason = ?, deliveryAddress = ? WHERE id IN (?, ?)", [ctx.runId, ctx.runId, seed.orderA, seed.orderB]);

    const outcomes = await Promise.all([reserveOneUnit(seed, ctx.runId, seed.orderA), consumeOneUnitAtPos(seed)]);

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const [batch] = await ctx.db.select().from(batches).where(eq(batches.id, seed.productSet.batch.id)).limit(1);
    expect(batch.qtyOnHand ?? 0).toBeGreaterThanOrEqual(0);
    expect(batch.qtyReserved ?? 0).toBeGreaterThanOrEqual(0);
    expect((batch.qtyOnHand ?? 0) - (batch.qtyReserved ?? 0)).toBeGreaterThanOrEqual(0);
  });

  it("proves concurrent invoice number reservations remain unique through the existing invoiceNumbering service", async () => {
    const storeRef = `s-${ctx.runId.slice(-18)}`;
    const reserveWithIsolatedConnection = async () => {
      const connection = await openTestConnection(testDatabaseUrl);
      try {
        return await reserveInvoiceNumber(drizzle(connection, { schema, mode: "default" }), storeRef, "sale_invoice", new Date("2026-05-09T00:00:00.000Z"));
      } finally {
        await connection.end();
      }
    };
    const invoices = await Promise.all(Array.from({ length: 12 }, () => reserveWithIsolatedConnection()));

    expect(new Set(invoices).size).toBe(invoices.length);
    const rows = await ctx.db.select().from(invoiceSequences).where(eq(invoiceSequences.storeId, storeRef));
    expect(rows).toHaveLength(1);
    expect(rows[0].lastNumber).toBe(invoices.length);
  });

  it("proves provider webhook replay is rejected by real MySQL uniqueness constraints", async () => {
    const providerEventId = `evt_${ctx.runId}`;
    const idempotencyKey = `webhook:${ctx.runId}`;
    const payloadHash = "a".repeat(64);
    const insert = async () => {
      const connection = await openTestConnection(testDatabaseUrl);
      try {
        await connection.execute(
          "INSERT INTO provider_webhook_events (provider, providerEventId, eventType, rawPayloadHash, payloadJson, signatureVerified, processingStatus, idempotencyKey) VALUES ('razorpay', ?, 'payment.captured', ?, JSON_OBJECT('testRun', ?), 1, 'processed', ?)",
          [providerEventId, payloadHash, ctx.runId, idempotencyKey],
        );
        return true;
      } catch (error) {
        if ((error as mysql.QueryError).code === "ER_DUP_ENTRY") return false;
        throw error;
      } finally {
        await connection.end();
      }
    };

    const outcomes = await Promise.all([insert(), insert()]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it("proves refund replay with the same provider refund id is rejected by real MySQL uniqueness constraints", async () => {
    const providerRefundId = `rfnd_${ctx.runId}`;
    const insert = async () => {
      const connection = await openTestConnection(testDatabaseUrl);
      try {
        await connection.execute(
          "INSERT INTO refunds (paymentId, orderId, provider, providerRefundId, amountPaise, status, reason) VALUES (1, NULL, 'razorpay', ?, 100, 'success', 'mysql concurrency replay proof')",
          [providerRefundId],
        );
        return true;
      } catch (error) {
        if ((error as mysql.QueryError).code === "ER_DUP_ENTRY") return false;
        throw error;
      } finally {
        await connection.end();
      }
    };

    const outcomes = await Promise.all([insert(), insert()]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
  });

  it("proves duplicate H1 sale-line registration is rejected by the H1 register unique key", async () => {
    const h1Ref = ctx.runId.slice(-24);
    const saleRef = `sale-${h1Ref}`;
    const saleLineRef = `line-${h1Ref}`;
    const insert = async () => {
      const connection = await openTestConnection(testDatabaseUrl);
      try {
        await connection.execute(
          "INSERT INTO h1_register (storeId, patientName, drugName, qty, pharmacistId, saleRef, saleLineRef, prescriptionRef, statutoryContextStatus) VALUES (1, 'Test Patient', 'Test H1 Drug', 1, 1, ?, ?, ?, 'complete')",
          [saleRef, saleLineRef, `rx-${ctx.runId}`],
        );
        return true;
      } catch (error) {
        if ((error as mysql.QueryError).code === "ER_DUP_ENTRY") return false;
        throw error;
      } finally {
        await connection.end();
      }
    };

    const outcomes = await Promise.all([insert(), insert()]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const rows = await ctx.db.select().from(h1Register).where(eq(h1Register.saleRef, saleRef));
    expect(rows).toHaveLength(1);
  });

  it("proves purchase commit double-submit through the exported idempotent service seam", async () => {
    const seed = await seedConcurrencyFixture(ctx, "purchase-commit");
    const invoiceId = await createPurchaseCommitFixture(ctx, seed);
    const outcomes = await Promise.allSettled([
      commitPurchaseInvoiceExactlyOnce({ invoiceId, idempotencyKey: `purchase:${ctx.runId}`, actorId: seed.staff.id, actorRole: seed.staff.role }),
      commitPurchaseInvoiceExactlyOnce({ invoiceId, idempotencyKey: `purchase:${ctx.runId}`, actorId: seed.staff.id, actorRole: seed.staff.role }),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
    const [invoice] = await ctx.db.select().from(purchaseInvoices).where(eq(purchaseInvoices.id, invoiceId)).limit(1);
    expect(invoice.status).toBe("committed");
    const movements = await ctx.db.select().from(stockMovements).where(eq(stockMovements.referenceId, invoiceId));
    expect(movements).toHaveLength(1);
    expect(movements[0].qty).toBe(3);
    const idemRows = await ctx.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, `purchase:${ctx.runId}`));
    expect(idemRows).toHaveLength(1);
  });

  it("proves sale confirmation double-submit through the exported idempotent service seam", async () => {
    const seed = await seedConcurrencyFixture(ctx, "sale-confirm");
    const { saleId, ledgerId } = await createSaleConfirmFixture(ctx, seed);
    const outcomes = await Promise.allSettled([
      confirmSaleExactlyOnce({ saleId, idempotencyKey: `sale:${ctx.runId}`, actorId: seed.staff.id, actorRole: seed.staff.role, paymentMode: "cash" }),
      confirmSaleExactlyOnce({ saleId, idempotencyKey: `sale:${ctx.runId}`, actorId: seed.staff.id, actorRole: seed.staff.role, paymentMode: "cash" }),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
    const [sale] = await ctx.db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
    expect(sale.status).toBe("confirmed");
    expect(sale.billNo.startsWith("INV-")).toBe(true);
    const [ledger] = await ctx.db.select().from(batchLedger).where(eq(batchLedger.id, ledgerId)).limit(1);
    expect(ledger.qtyOnHand).toBe(0);
    const payments = await ctx.db.select().from(counterPayments).where(eq(counterPayments.saleId, saleId));
    expect(payments).toHaveLength(1);
  });

  it("proves full payment state-transition replay settles payment/order once through the webhook seam", async () => {
    const seed = await seedConcurrencyFixture(ctx, "payment-webhook");
    await ctx.connection.execute("UPDATE orders SET statusReason = ?, deliveryAddress = ? WHERE id = ?", [ctx.runId, ctx.runId, seed.orderA]);
    const gatewayOrderId = `order_${ctx.runId}`;
    await ctx.connection.execute("INSERT INTO payment_records (orderId, userId, gatewayOrderId, amount, currency, status) VALUES (?, ?, ?, 9500, 'INR', 'pending')", [seed.orderA, seed.customerA.id, gatewayOrderId]);
    const rawBody = JSON.stringify({ event: "payment.captured", id: `evt_pay_${ctx.runId}`, payload: { payment: { entity: { id: `pay_${ctx.runId}`, order_id: gatewayOrderId, notes: { orderId: String(seed.orderA) } } } } });
    const outcomes = await Promise.allSettled([
      handleRazorpayWebhook({ rawBody, signature: webhookSignature(rawBody) }),
      handleRazorpayWebhook({ rawBody, signature: webhookSignature(rawBody) }),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(2);
    const [payment] = await ctx.db.select().from(paymentRecords).where(eq(paymentRecords.gatewayOrderId, gatewayOrderId)).limit(1);
    expect(payment.status).toBe("paid");
    expect(payment.gatewayPaymentId).toBe(`pay_${ctx.runId}`);
    const events = await ctx.db.select().from(providerWebhookEvents).where(eq(providerWebhookEvents.providerEventId, `evt_pay_${ctx.runId}`));
    expect(events).toHaveLength(1);
  });

  it("proves concurrent refund settlement cannot exceed paid amount and provider refund replay is harmless", async () => {
    const seed = await seedConcurrencyFixture(ctx, "refund-overage");
    const gatewayOrderId = `order_refund_${ctx.runId}`;
    await ctx.connection.execute("INSERT INTO payment_records (orderId, userId, gatewayOrderId, gatewayPaymentId, amount, currency, status, paidAt) VALUES (?, ?, ?, ?, 1000, 'INR', 'paid', NOW())", [seed.orderA, seed.customerA.id, gatewayOrderId, `pay_refund_${ctx.runId}`]);
    const outcomes = await Promise.allSettled([
      settleProviderRefundExactlyOnce({ gatewayOrderId, providerRefundId: `rfnd_a_${ctx.runId}`, amountPaise: 700, idempotencyKey: `refund:a:${ctx.runId}`, actorId: seed.staff.id }),
      settleProviderRefundExactlyOnce({ gatewayOrderId, providerRefundId: `rfnd_b_${ctx.runId}`, amountPaise: 700, idempotencyKey: `refund:b:${ctx.runId}`, actorId: seed.staff.id }),
    ]);

    expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(1);
    const [payment] = await ctx.db.select().from(paymentRecords).where(eq(paymentRecords.gatewayOrderId, gatewayOrderId)).limit(1);
    const allRefunds = await ctx.db.select().from(refunds).where(eq(refunds.paymentId, payment.id));
    expect(allRefunds).toHaveLength(1);
    const winningProviderRefundId = allRefunds[0].providerRefundId;
    const duplicate = await settleProviderRefundExactlyOnce({ gatewayOrderId, providerRefundId: winningProviderRefundId, amountPaise: 700, idempotencyKey: `refund:replay:${ctx.runId}`, actorId: seed.staff.id });
    expect(duplicate.idempotent).toBe(true);
    expect(allRefunds.reduce((sum, row) => sum + Number(row.amountPaise), 0)).toBeLessThanOrEqual(1000);
  });

  it("proves reservation expiry during payment has one deterministic terminal winner", async () => {
    const seed = await seedConcurrencyFixture(ctx, "reservation-terminal");
    const ledgerId = await insertId(
      ctx.connection,
      "INSERT INTO batch_ledger (productId, storeId, batchNo, expiryDate, mrp, purchaseRate, saleRate, qtyOnHand, qtyReserved, qtyQuarantined, qtyExpired, status, createdBy) VALUES (?, ?, ?, '2035-12-31', '100.00', '70.00', '95.00', 1, 1, 0, 0, 'active', ?)",
      [seed.productSet.product.id, seed.store.id, `RS-${ctx.runId}`, seed.staff.id],
    );
    const reservationId = await insertId(
      ctx.connection,
      "INSERT INTO stock_reservations (batchId, orderId, productId, variantId, skuId, storeId, qty, qtyReserved, status, releaseReason, expiresAt) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 'active', ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))",
      [ledgerId, seed.orderA, seed.productSet.product.id, seed.productSet.variant.id, seed.productSet.storeSku.id, seed.store.id, `terminal_${ctx.runId}`],
    );
    const outcomes = await Promise.all([
      claimReservationTerminalState({ id: reservationId, terminalStatus: "consumed", releaseReason: `payment_claim_${ctx.runId}` }),
      claimReservationTerminalState({ id: reservationId, terminalStatus: "expired", releaseReason: `expiry_claim_${ctx.runId}` }),
    ]);

    expect(outcomes.filter((outcome) => outcome.won)).toHaveLength(1);
    const [current] = await ctx.db.select().from(stockReservations).where(eq(stockReservations.id, reservationId)).limit(1);
    expect(["consumed", "expired"]).toContain(current.status);
    const [ledger] = await ctx.db.select().from(batchLedger).where(eq(batchLedger.id, ledgerId)).limit(1);
    expect(ledger.qtyOnHand ?? 0).toBeGreaterThanOrEqual(0);
    expect(ledger.qtyReserved ?? 0).toBeGreaterThanOrEqual(0);
  });
});
