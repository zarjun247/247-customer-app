import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { batches, products, stores, users } from "../drizzle/schema";
import {
  applyTestMigrations,
  cleanupDbTestContext,
  closeDbTestContext,
  createDbTestContext,
  getTestDatabaseUrl,
  TEST_DB_ENV_VAR,
} from "./testUtils/dbTestLifecycle";
import {
  createDeterministicTestCustomer,
  createDeterministicTestProductSkuBatch,
  createDeterministicTestStaff,
  createDeterministicTestStore,
} from "./testUtils/dbSeedFactories";
import type { DbTestContext } from "./testUtils/dbTestLifecycle";

const testDatabaseUrl = getTestDatabaseUrl();
const describeWithDb = testDatabaseUrl ? describe : describe.skip;

if (!testDatabaseUrl) {
  console.warn(`Skipping MySQL DB lifecycle integration smoke test because ${TEST_DB_ENV_VAR} is not set.`);
}

describeWithDb("MySQL-backed test database lifecycle", () => {
  let ctx: DbTestContext;

  beforeAll(async () => {
    await applyTestMigrations(testDatabaseUrl);
    ctx = await createDbTestContext();
  }, 120_000);

  afterAll(async () => {
    if (ctx) {
      await cleanupDbTestContext(ctx);
      await closeDbTestContext(ctx);
    }
  });

  it("connects, verifies migrations, seeds rows, reads rows, and cleans up deterministically", async () => {
    const [migrationRows] = await ctx.connection.query("SELECT COUNT(*) AS migrationCount FROM __drizzle_migrations");
    expect(Number((migrationRows as Array<{ migrationCount: number }>)[0]?.migrationCount ?? 0)).toBeGreaterThan(0);

    const store = await createDeterministicTestStore(ctx);
    const customer = await createDeterministicTestCustomer(ctx);
    const staff = await createDeterministicTestStaff(ctx, store.id);
    const productSet = await createDeterministicTestProductSkuBatch(ctx, store.id);

    expect((await ctx.db.select().from(stores).where(eq(stores.id, store.id)).limit(1))[0]?.name).toBe(store.name);
    expect((await ctx.db.select().from(users).where(eq(users.id, customer.id)).limit(1))[0]?.role).toBe("customer");
    expect((await ctx.db.select().from(users).where(eq(users.id, staff.id)).limit(1))[0]?.role).toBe("pharmacist");
    expect((await ctx.db.select().from(products).where(eq(products.id, productSet.product.id)).limit(1))[0]?.name).toBe(productSet.product.name);
    expect((await ctx.db.select().from(batches).where(eq(batches.id, productSet.batch.id)).limit(1))[0]?.quantity).toBe(5);

    const createdIds = {
      batchIds: [...ctx.created.batchIds],
      productIds: [...ctx.created.productIds],
      userIds: [...ctx.created.userIds],
      storeIds: [...ctx.created.storeIds],
    };

    await cleanupDbTestContext(ctx);

    for (const id of createdIds.batchIds) {
      expect((await ctx.db.select().from(batches).where(eq(batches.id, id)).limit(1))).toHaveLength(0);
    }
    for (const id of createdIds.productIds) {
      expect((await ctx.db.select().from(products).where(eq(products.id, id)).limit(1))).toHaveLength(0);
    }
    for (const id of createdIds.userIds) {
      expect((await ctx.db.select().from(users).where(eq(users.id, id)).limit(1))).toHaveLength(0);
    }
    for (const id of createdIds.storeIds) {
      expect((await ctx.db.select().from(stores).where(eq(stores.id, id)).limit(1))).toHaveLength(0);
    }
  });
});
