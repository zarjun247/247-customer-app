import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import * as schema from "../../drizzle/schema";
import {
  batches,
  productVariants,
  products,
  stores,
  storeSkus,
  users,
} from "../../drizzle/schema";

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

export function requireSafeTestDatabaseUrl(
  rawUrl = getTestDatabaseUrl()
): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${TEST_DB_ENV_VAR} DB-backed tests refuse to run when NODE_ENV=production.`
    );
  }

  if (!rawUrl) {
    throw new Error(
      `${TEST_DB_ENV_VAR} is required for DB-backed tests. Use docker-compose.test.yml or the CI MySQL service.`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      `${TEST_DB_ENV_VAR} must be a valid mysql:// connection URL.`
    );
  }

  if (!parsed.protocol.startsWith("mysql")) {
    throw new Error(`${TEST_DB_ENV_VAR} must use a mysql:// URL.`);
  }

  const databaseName = parsed.pathname.replace(/^\//, "");
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      `${TEST_DB_ENV_VAR} database name must include "test"; refusing to touch ${databaseName || "<empty>"}.`
    );
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL === rawUrl) {
    throw new Error(
      `${TEST_DB_ENV_VAR} must be separate from DATABASE_URL; refusing to run against the production/runtime URL.`
    );
  }

  return rawUrl;
}

export async function openTestConnection(
  rawUrl = requireSafeTestDatabaseUrl()
): Promise<mysql.Connection> {
  const connection = await mysql.createConnection(rawUrl);
  await connection.ping();
  return connection;
}

async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", reject);
    child.on("exit", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`
          )
        );
      }
    });
  });
}

export async function applyTestMigrations(
  rawUrl = requireSafeTestDatabaseUrl()
): Promise<void> {
  const connection = await openTestConnection(rawUrl).catch(error => {
    throw new Error(
      `Unable to connect to ${TEST_DB_ENV_VAR}. Start the MySQL ${TEST_MYSQL_VERSION} test container/service first. ${error}`
    );
  });

  try {
    await runCommand("pnpm", ["exec", "node", "scripts/apply-migrations.mjs"], {
      ...process.env,
      DATABASE_URL: rawUrl,
      TEST_DATABASE_URL: rawUrl,
    });

    const [migrationRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT COUNT(*) AS migrationCount FROM _app_migrations"
    );
    const migrationCount = Number(migrationRows[0]?.migrationCount ?? 0);
    if (migrationCount <= 0) {
      throw new Error(
        "Migration verification failed: _app_migrations is empty."
      );
    }
  } finally {
    await connection.end();
  }
}

export async function createDbTestContext(
  runId = `mysql_lifecycle_${Date.now()}_${process.pid}`
): Promise<DbTestContext> {
  const rawUrl = requireSafeTestDatabaseUrl();
  const connection = await openTestConnection(rawUrl);
  const db = drizzle(connection, { schema, mode: "default" });

  return {
    db,
    connection,
    runId,
    created: {
      batchIds: [],
      storeSkuIds: [],
      variantIds: [],
      productIds: [],
      storeIds: [],
      userIds: [],
    },
  };
}

export async function cleanupDbTestContext(ctx: DbTestContext): Promise<void> {
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
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
