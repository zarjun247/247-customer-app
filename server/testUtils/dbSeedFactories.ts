import { eq } from "drizzle-orm";
import {
  batches,
  productVariants,
  products,
  stores,
  storeSkus,
  users,
} from "../../drizzle/schema";
import type { DbTestContext } from "./dbTestLifecycle";

function insertedId(result: unknown): number {
  const packet: unknown = Array.isArray(result) ? result[0] : result;
  const id = Number((packet as { insertId?: number }).insertId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error(
      `Expected MySQL insertId, received ${JSON.stringify(packet)}`
    );
  }
  return id;
}

export async function createDeterministicTestStore(
  ctx: DbTestContext,
  suffix = ctx.runId
) {
  const result = await ctx.db.insert(stores).values({
    name: `Test Store ${suffix}`,
    type: "in_building",
    address: `Test-only address ${suffix}`,
    pincode: "400001",
    phone: "+910000000000",
    isActive: true,
    slaMins: 20,
    serviceRadius: 3000,
    priority: 1,
    isPrimary: false,
  });
  const id = insertedId(result);
  ctx.created.storeIds.push(id);
  return (
    await ctx.db.select().from(stores).where(eq(stores.id, id)).limit(1)
  )[0];
}

export async function createDeterministicTestCustomer(
  ctx: DbTestContext,
  suffix = ctx.runId
) {
  const result = await ctx.db.insert(users).values({
    openId: `test-customer-${suffix}`,
    name: "Test Customer",
    email: `customer-${suffix}@example.test`,
    phone: "+910000000001",
    loginMethod: "test",
    role: "customer",
    onboardingComplete: true,
    userAddress: `Test-only customer address ${suffix}`,
  });
  const id = insertedId(result);
  ctx.created.userIds.push(id);
  return (
    await ctx.db.select().from(users).where(eq(users.id, id)).limit(1)
  )[0];
}

export async function createDeterministicTestStaff(
  ctx: DbTestContext,
  storeId: number,
  suffix = ctx.runId
) {
  const result = await ctx.db.insert(users).values({
    openId: `test-staff-${suffix}`,
    name: "Test Pharmacist",
    email: `pharmacist-${suffix}@example.test`,
    phone: "+910000000002",
    loginMethod: "test",
    role: "pharmacist",
    onboardingComplete: true,
    staffStoreId: storeId,
  });
  const id = insertedId(result);
  ctx.created.userIds.push(id);
  return (
    await ctx.db.select().from(users).where(eq(users.id, id)).limit(1)
  )[0];
}

export async function createDeterministicTestProductSkuBatch(
  ctx: DbTestContext,
  storeId: number,
  suffix = ctx.runId
) {
  const productResult = await ctx.db.insert(products).values({
    name: `Test Product ${suffix}`,
    brand: "Test Brand",
    genericName: "test-only generic",
    form: "tablet",
    strength: "10mg",
    packSize: "10 tablets",
    schedule: "OTC",
    requiresPrescription: false,
    isChronicMedication: false,
    category: "medicine",
    companyName: "Test Manufacturer",
    hsnCode: "300490",
    barcode: `TEST-BARCODE-${suffix}`,
    gstRate: "12.00",
    searchableTokens: `test product ${suffix}`,
    canonicalName: `test product ${suffix}`,
  });
  const productId = insertedId(productResult);
  ctx.created.productIds.push(productId);

  const variantResult = await ctx.db.insert(productVariants).values({
    productId,
    strength: "10mg",
    packSize: "10 tablets",
    form: "tablet",
    unit: "strip",
    displayLabel: "10mg strip",
    isActive: true,
  });
  const variantId = insertedId(variantResult);
  ctx.created.variantIds.push(variantId);

  const skuResult = await ctx.db.insert(storeSkus).values({
    storeId,
    productId,
    variantId,
    mrp: "100.00",
    sellingPrice: "95.00",
    isActive: true,
    stockQty: 5,
    softLockedQty: 0,
  });
  const storeSkuId = insertedId(skuResult);
  ctx.created.storeSkuIds.push(storeSkuId);

  const batchResult = await ctx.db.insert(batches).values({
    storeId,
    productId,
    variantId,
    batchNumber: `TEST-BATCH-${suffix}`,
    expiryDate: new Date("2035-12-31T00:00:00.000Z"),
    mrp: "100.00",
    purchaseRate: "70.00",
    saleRate: "95.00",
    landingCost: "72.00",
    margin: "23.00",
    quantity: 5,
    qtyOnHand: 5,
    qtyReserved: 0,
    qtyQuarantined: 0,
    qtyExpired: 0,
    internalBarcode: `TEST-INTERNAL-${suffix}`,
    status: "active",
    unitCost: "70.00",
  });
  const batchId = insertedId(batchResult);
  ctx.created.batchIds.push(batchId);

  return {
    product: (
      await ctx.db
        .select()
        .from(products)
        .where(eq(products.id, productId))
        .limit(1)
    )[0],
    variant: (
      await ctx.db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .limit(1)
    )[0],
    storeSku: (
      await ctx.db
        .select()
        .from(storeSkus)
        .where(eq(storeSkus.id, storeSkuId))
        .limit(1)
    )[0],
    batch: (
      await ctx.db
        .select()
        .from(batches)
        .where(eq(batches.id, batchId))
        .limit(1)
    )[0],
  };
}
