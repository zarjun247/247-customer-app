import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import { batchLedger, batches, h1Register, invoiceSequences, paymentRecords, productVariants, products, purchaseInvoices, refunds, stockMovements, stockReservations, stores, storeSkus, users } from "../../drizzle/schema";

export const TEST_DB_ENV_VAR = "TEST_DATABASE_URL";
export const TEST_DB_NAME = "247_customer_app_test";
export const TEST_MYSQL_VERSION = "8.4";

export type TestDb = MySql2Database<typeof schema>;

export type DbTestContext = {
  db: TestDb;
  connection: mysql.Connection;
  runId: string;
  created: {
    batchIds: number[];
    batchLedgerIds: number[];
    stockMovementIds: number[];
    stockReservationIds: number[];
    refundIds: number[];
    paymentRecordIds: number[];
    h1RegisterIds: number[];
    invoiceSequenceIds: number[];
    purchaseInvoiceIds: number[];
    storeSkuIds: number[];
    variantIds: number[];
    productIds: number[];
    storeIds: number[];
    userIds: number[];
  };
};

export function getTestDatabaseUrl(): string | undefined {
  return process.env[TEST_DB_ENV_VAR];
}

export function requireSafeTestDatabaseUrl(rawUrl = getTestDatabaseUrl()): string {
  if (!rawUrl) {
    throw new Error(`${TEST_DB_ENV_VAR} is required for DB-backed tests. Use docker-compose.test.yml or the CI MySQL service.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${TEST_DB_ENV_VAR} must be a valid mysql:// connection URL.`);
  }

  if (!parsed.protocol.startsWith("mysql")) {
    throw new Error(`${TEST_DB_ENV_VAR} must use a mysql:// URL.`);
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  const safeHostAllowlist = (process.env.TEST_DATABASE_ALLOWLIST_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const hostLooksLocal = ["localhost", "127.0.0.1", "::1", "mysql", "db"].includes(parsed.hostname.toLowerCase());
  const databaseLooksTest = databaseName.toLowerCase().includes("test");
  const hostAllowlisted = safeHostAllowlist.includes(parsed.hostname.toLowerCase());

  if (!databaseLooksTest && !hostAllowlisted) {
    throw new Error(`${TEST_DB_ENV_VAR} database name must include "test" or host must be in TEST_DATABASE_ALLOWLIST_HOSTS; refusing to touch ${databaseName || "<empty>"} on ${parsed.hostname}.`);
  }

  if (!databaseLooksTest && hostLooksLocal === false && !hostAllowlisted) {
    throw new Error(`${TEST_DB_ENV_VAR} must point at a test database or explicitly allowlisted test host.`);
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL === rawUrl) {
    throw new Error(`${TEST_DB_ENV_VAR} must be separate from DATABASE_URL; refusing to run against the production/runtime URL.`);
  }

  return rawUrl;
}

export async function assertConnectedToSafeTestDatabase(connection: mysql.Connection): Promise<void> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS databaseName, @@hostname AS hostName");
  const databaseName = String(rows[0]?.databaseName ?? "");
  const hostName = String(rows[0]?.hostName ?? "").toLowerCase();
  const safeHostAllowlist = (process.env.TEST_DATABASE_ALLOWLIST_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  if (!databaseName.toLowerCase().includes("test") && !safeHostAllowlist.includes(hostName)) {
    await connection.end();
    throw new Error(`${TEST_DB_ENV_VAR} connected to ${databaseName || "<empty>"} on ${hostName}; refusing because it is not test-named or host-allowlisted.`);
  }
}

export async function openTestConnection(rawUrl = requireSafeTestDatabaseUrl()): Promise<mysql.Connection> {
  const connection = await mysql.createConnection(rawUrl);
  await connection.ping();
  await assertConnectedToSafeTestDatabase(connection);
  return connection;
}

async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

export async function applyTestMigrations(rawUrl = requireSafeTestDatabaseUrl()): Promise<void> {
  const connection = await openTestConnection(rawUrl).catch((error) => {
    throw new Error(`Unable to connect to ${TEST_DB_ENV_VAR}. Start the MySQL ${TEST_MYSQL_VERSION} test container/service first. ${error}`);
  });

  try {
    await runCommand("pnpm", ["exec", "drizzle-kit", "migrate", "--config=drizzle.config.ts"], {
      ...process.env,
      DATABASE_URL: rawUrl,
      TEST_DATABASE_URL: rawUrl,
    });

    const [migrationRows] = await connection.query<mysql.RowDataPacket[]>("SELECT COUNT(*) AS migrationCount FROM __drizzle_migrations");
    const migrationCount = Number(migrationRows[0]?.migrationCount ?? 0);
    if (migrationCount <= 0) {
      throw new Error("Drizzle migration verification failed: __drizzle_migrations is empty.");
    }
  } finally {
    await connection.end();
  }
}

export async function createDbTestContext(runId = `mysql_lifecycle_${Date.now()}_${process.pid}`): Promise<DbTestContext> {
  const rawUrl = requireSafeTestDatabaseUrl();
  const connection = await openTestConnection(rawUrl);
  const db = drizzle(connection, { schema, mode: "default" });

  return {
    db,
    connection,
    runId,
    created: {
      batchIds: [],
      batchLedgerIds: [],
      stockMovementIds: [],
      stockReservationIds: [],
      refundIds: [],
      paymentRecordIds: [],
      h1RegisterIds: [],
      invoiceSequenceIds: [],
      purchaseInvoiceIds: [],
      storeSkuIds: [],
      variantIds: [],
      productIds: [],
      storeIds: [],
      userIds: [],
    },
  };
}

export async function cleanupDbTestContext(ctx: DbTestContext): Promise<void> {
  for (const id of ctx.created.stockMovementIds.reverse()) {
    await ctx.db.delete(stockMovements).where(eq(stockMovements.id, id));
  }
  for (const id of ctx.created.stockReservationIds.reverse()) {
    await ctx.db.delete(stockReservations).where(eq(stockReservations.id, id));
  }
  for (const id of ctx.created.refundIds.reverse()) {
    await ctx.db.delete(refunds).where(eq(refunds.id, id));
  }
  for (const id of ctx.created.paymentRecordIds.reverse()) {
    await ctx.db.delete(paymentRecords).where(eq(paymentRecords.id, id));
  }
  for (const id of ctx.created.h1RegisterIds.reverse()) {
    await ctx.db.delete(h1Register).where(eq(h1Register.id, id));
  }
  for (const id of ctx.created.invoiceSequenceIds.reverse()) {
    await ctx.db.delete(invoiceSequences).where(eq(invoiceSequences.id, id));
  }
  for (const id of ctx.created.purchaseInvoiceIds.reverse()) {
    await ctx.db.delete(purchaseInvoices).where(eq(purchaseInvoices.id, id));
  }
  for (const id of ctx.created.batchLedgerIds.reverse()) {
    await ctx.db.delete(batchLedger).where(eq(batchLedger.id, id));
  }
  for (const id of ctx.created.batchIds.reverse()) {
    await ctx.db.delete(batches).where(eq(batches.id, id));
  }
  for (const id of ctx.created.storeSkuIds.reverse()) {
    await ctx.db.delete(storeSkus).where(eq(storeSkus.id, id));
  }
  for (const id of ctx.created.variantIds.reverse()) {
    await ctx.db.delete(productVariants).where(eq(productVariants.id, id));
  }
  for (const id of ctx.created.productIds.reverse()) {
    await ctx.db.delete(products).where(eq(products.id, id));
  }
  for (const id of ctx.created.userIds.reverse()) {
    await ctx.db.delete(users).where(eq(users.id, id));
  }
  for (const id of ctx.created.storeIds.reverse()) {
    await ctx.db.delete(stores).where(eq(stores.id, id));
  }
}

export async function closeDbTestContext(ctx: DbTestContext): Promise<void> {
  await ctx.connection.end();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  applyTestMigrations()
    .then(() => {
      console.log(`Applied and verified migrations for ${TEST_DB_ENV_VAR}.`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
