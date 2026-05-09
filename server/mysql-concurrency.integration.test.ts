import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { eq } from "drizzle-orm";
import { batches, h1Register, invoiceSequences, stockReservations } from "../drizzle/schema";
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
  const store = await createDeterministicTestStore(ctx);
  const customerA = await createDeterministicTestCustomer(ctx);
  const staff = await createDeterministicTestStaff(ctx, store.id);
  const productSet = await createDeterministicTestProductSkuBatch(ctx, store.id);
  await ctx.connection.execute("UPDATE batches SET qtyOnHand = 1, quantity = 1, qtyReserved = 0 WHERE id = ?", [productSet.batch.id]);
  await ctx.connection.execute("UPDATE store_skus SET stockQty = 1, softLockedQty = 0 WHERE id = ?", [productSet.storeSku.id]);

  const customerB = await insertId(
    ctx.connection,
    "INSERT INTO users (openId, name, email, phone, loginMethod, role, onboardingComplete) VALUES (?, ?, ?, ?, 'test', 'customer', 1)",
    [`test-customer-b-${ctx.runId}-${suffix}`, "Test Customer B", `customer-b-${ctx.runId}-${suffix}@example.test`, "+910000000003"],
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
  await ctx.connection.execute("DELETE FROM h1_register WHERE saleRef LIKE ? OR saleLineRef LIKE ? OR prescriptionRef LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM provider_webhook_events WHERE idempotencyKey LIKE ? OR providerEventId LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM refunds WHERE providerRefundId LIKE ?", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM counter_payments WHERE id LIKE ? OR sale_id LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM invoice_snapshots WHERE bill_no LIKE ? OR sale_id LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM sale_lines WHERE id LIKE ? OR sale_id LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM sales WHERE id LIKE ? OR bill_no LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM stock_reservations WHERE releaseReason LIKE ?", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM order_items WHERE orderId IN (SELECT id FROM orders WHERE statusReason LIKE ?)", [`%${ctx.runId}%`]);
  await ctx.connection.execute("DELETE FROM orders WHERE statusReason LIKE ? OR deliveryAddress LIKE ?", [`%${ctx.runId}%`, `%${ctx.runId}%`]);
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

describeWithDb("MySQL-backed concurrency proof harness", () => {
  let ctx: DbTestContext;

  beforeAll(async () => {
    await applyTestMigrations(testDatabaseUrl);
    ctx = await createDbTestContext(`mysql_concurrency_${Date.now()}_${process.pid}`);
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await cleanupConcurrencyRows(ctx);
      await cleanupDbTestContext(ctx);
      await closeDbTestContext(ctx);
    }
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
    const storeRef = `store-${ctx.runId}`;
    const invoices = await Promise.all(Array.from({ length: 12 }, () => reserveInvoiceNumber(ctx.db, storeRef, "sale_invoice", new Date("2026-05-09T00:00:00.000Z"))));

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
    const saleRef = `sale-${ctx.runId}`;
    const saleLineRef = `sale-line-${ctx.runId}`;
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

  it.skip("purchase commit double-submit remains unproven: purchase commit has no exported DB-backed idempotent test seam and purchase_invoices has no idempotency key/unique constraint to assert without changing production behavior");
  it.skip("sale confirmation double-submit remains unproven: sale confirmation path is router/session coupled and there is no safe exported DB-backed idempotent confirmation seam for this harness");
  it.skip("full payment state-transition replay remains unproven: provider webhook lifecycle needs a seeded payment/order graph plus signed raw-body seam; this harness only proves the provider event uniqueness gate");
  it.skip("over-refund prevention remains partially unproven: refund provider id replay is constrained, but aggregate over-refund requires the production refund service with a seeded payment graph");
  it.skip("reservation expiry during payment remains unproven: expiry/retry recovery has no exported deterministic service seam that can be exercised without altering runtime behavior");
});
