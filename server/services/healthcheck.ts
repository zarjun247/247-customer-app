import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { evaluateProviderStatus, type ProviderStatusReport } from "./providerContract";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "not_configured" | "disabled" | "unknown";
export type ProviderHealthStatus = "configured" | "provider_unconfigured" | "disabled" | "demo_skipped" | "unknown";

type DbLike = { execute: (query: unknown) => Promise<unknown> };

export type HealthComponent = {
  status: HealthStatus;
  message?: string;
  details?: Record<string, unknown>;
};

export type LivenessHealth = {
  status: "healthy";
  timestamp: string;
  service: string;
  version: string;
};

export type ReadinessHealth = {
  status: HealthStatus;
  timestamp: string;
  service: string;
  version: string;
  components: {
    app: HealthComponent;
    database: HealthComponent;
    migrations: HealthComponent;
    objectStorage: HealthComponent;
    payments: HealthComponent;
    messaging: HealthComponent;
    ocr: HealthComponent;
    workerQueue: HealthComponent;
    stock: HealthComponent;
    reservations: HealthComponent;
  };
};

const SERVICE_NAME = process.env.SERVICE_NAME || process.env.npm_package_name || "247-customer-app";
const SERVICE_VERSION = process.env.SERVICE_VERSION || process.env.npm_package_version || "1.0.0";
const ALLOWED_STATUSES: HealthStatus[] = ["healthy", "degraded", "unhealthy", "not_configured", "disabled", "unknown"];

export function normalizeHealthStatus(status: string | undefined): HealthStatus {
  return ALLOWED_STATUSES.includes(status as HealthStatus) ? status as HealthStatus : "unknown";
}

export function getLivenessHealth(now = new Date()): LivenessHealth {
  return { status: "healthy", timestamp: now.toISOString(), service: SERVICE_NAME, version: SERVICE_VERSION };
}

function withTimeout<T>(promise: Promise<T>, fallback: T, timeoutMs = 1500): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), timeoutMs)),
  ]);
}

function extractRows(result: unknown): unknown[] {
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) return result[0] as unknown[];
    return result;
  }
  if (result && typeof result === "object" && "rows" in result && Array.isArray((result as { rows: unknown[] }).rows)) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}

function extractCount(result: unknown): number | undefined {
  const rows = extractRows(result);
  const first = rows[0] as Record<string, unknown> | undefined;
  if (!first) return undefined;
  const raw = first.count ?? first.c ?? first["COUNT(*)"] ?? Object.values(first)[0];
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

async function safeCount(db: DbLike, query: unknown): Promise<number | undefined> {
  try {
    return extractCount(await db.execute(query));
  } catch {
    return undefined;
  }
}

export async function checkDatabase(dbFactory: () => Promise<DbLike | null> = getDb as () => Promise<DbLike | null>): Promise<HealthComponent> {
  const probe = (async (): Promise<HealthComponent> => {
    try {
      const db = await dbFactory();
      if (!db) return { status: "not_configured", message: "Database connection is not configured or unavailable." };
      await db.execute(sql`select 1 as ok`);
      return { status: "healthy", message: "Read-only database probe succeeded." };
    } catch {
      return { status: "degraded", message: "Database read-only probe failed." };
    }
  })();
  return withTimeout<HealthComponent>(probe, { status: "degraded", message: "Database probe timed out." });
}

export async function checkMigrations(dbFactory: () => Promise<DbLike | null> = getDb as () => Promise<DbLike | null>): Promise<HealthComponent> {
  const db = await dbFactory();
  if (!db) return { status: "unknown", message: "Database unavailable; migration table cannot be inspected." };
  try {
    const count = await safeCount(db, sql`select count(*) as count from information_schema.tables where table_schema = database() and table_name in ('__drizzle_migrations', 'drizzle_migrations')`);
    if (count === undefined) return { status: "unknown", message: "Migration metadata table could not be safely introspected." };
    return count > 0
      ? { status: "healthy", message: "Migration metadata table is visible." }
      : { status: "unknown", message: "Migration metadata table not found; migrations were not run by healthcheck." };
  } catch {
    return { status: "unknown", message: "Migration smoke check failed without running migrations." };
  }
}

function summarizeProvider(reports: ProviderStatusReport[], names: string[]): HealthComponent {
  const selected = reports.filter(report => names.includes(report.providerName));
  if (!selected.length) return { status: "unknown", message: "No provider contract found." };
  const statuses = selected.map(report => {
    const status: ProviderHealthStatus = ["configured", "provider_unconfigured", "disabled", "demo_skipped"].includes(report.status) ? report.status as ProviderHealthStatus : "unknown";
    return { providerName: report.providerName, status, configured: report.configured, enabled: report.enabled };
  });
  const anyConfigured = statuses.some(report => report.status === "configured");
  const allDisabled = statuses.every(report => report.status === "disabled");
  const allUnconfigured = statuses.every(report => report.status === "provider_unconfigured" || report.status === "demo_skipped");
  return {
    status: anyConfigured ? "healthy" : allDisabled ? "disabled" : allUnconfigured ? "not_configured" : "unknown",
    details: { providers: statuses },
  };
}

export function checkProviders(env: NodeJS.ProcessEnv = process.env) {
  const reports = evaluateProviderStatus(env, env.NODE_ENV);
  return {
    objectStorage: summarizeProvider(reports, ["object_storage"]),
    payments: summarizeProvider(reports, ["razorpay_payment"]),
    messaging: summarizeProvider(reports, ["whatsapp", "sms", "email"]),
    ocr: summarizeProvider(reports, ["ocr"]),
  };
}

export async function checkWorkerQueue(dbFactory: () => Promise<DbLike | null> = getDb as () => Promise<DbLike | null>): Promise<HealthComponent> {
  const db = await dbFactory();
  if (!db) return { status: "unknown", message: "Database unavailable; OCR queue visibility unknown." };
  const exists = await safeCount(db, sql`select count(*) as count from information_schema.tables where table_schema = database() and table_name = 'ocr_jobs'`);
  if (!exists) return { status: "unknown", message: "ocr_jobs table is not safely introspectable." };
  const queued = await safeCount(db, sql`select count(*) as count from ocr_jobs where status = 'queued'`);
  const processing = await safeCount(db, sql`select count(*) as count from ocr_jobs where status = 'processing'`);
  const failed = await safeCount(db, sql`select count(*) as count from ocr_jobs where status = 'failed'`);
  return { status: "healthy", details: { queued: queued ?? 0, processing: processing ?? 0, failed: failed ?? 0 } };
}

export async function checkStockSanity(dbFactory: () => Promise<DbLike | null> = getDb as () => Promise<DbLike | null>): Promise<HealthComponent> {
  const db = await dbFactory();
  if (!db) return { status: "unknown", message: "Database unavailable; stock sanity unknown." };
  const negativeStockCount = await safeCount(db, sql`select count(*) as count from store_skus where stockQty < 0 or softLockedQty < 0`);
  const negativeBatchLedgerCount = await safeCount(db, sql`select count(*) as count from batch_ledger where qtyOnHand < 0 or qtyReserved < 0`);
  const reservationGreaterThanAvailableCount = await safeCount(db, sql`
    select count(*) as count
    from stock_reservations sr
    left join store_skus ss on ss.id = sr.skuId
    where sr.status = 'active' and ss.id is not null and sr.qtyReserved > ss.stockQty
  `);
  if ([negativeStockCount, negativeBatchLedgerCount, reservationGreaterThanAvailableCount].some(v => v === undefined)) {
    return { status: "unknown", message: "One or more stock sanity queries were not safely introspectable." };
  }
  const anomalyCount = negativeStockCount! + negativeBatchLedgerCount! + reservationGreaterThanAvailableCount!;
  return { status: anomalyCount > 0 ? "degraded" : "healthy", details: { negativeStockCount, negativeBatchLedgerCount, reservationGreaterThanAvailableCount } };
}

export async function checkReservationSanity(dbFactory: () => Promise<DbLike | null> = getDb as () => Promise<DbLike | null>): Promise<HealthComponent> {
  const db = await dbFactory();
  if (!db) return { status: "unknown", message: "Database unavailable; reservation sanity unknown." };
  const expiredActiveReservationsCount = await safeCount(db, sql`select count(*) as count from stock_reservations where status = 'active' and expiresAt is not null and expiresAt < now()`);
  const activeReservationsWithMissingRefsCount = await safeCount(db, sql`
    select count(*) as count
    from stock_reservations sr
    left join stores st on st.id = sr.storeId
    left join products p on p.id = sr.productId
    left join orders o on o.id = sr.orderId
    where sr.status = 'active' and (st.id is null or p.id is null or (sr.orderId is not null and o.id is null))
  `);
  if (expiredActiveReservationsCount === undefined || activeReservationsWithMissingRefsCount === undefined) {
    return { status: "unknown", message: "Reservation queries were not safely introspectable." };
  }
  const anomalyCount = expiredActiveReservationsCount + activeReservationsWithMissingRefsCount;
  return { status: anomalyCount > 0 ? "degraded" : "healthy", details: { expiredActiveReservationsCount, activeReservationsWithMissingRefsCount } };
}

function rollup(components: ReadinessHealth["components"]): HealthStatus {
  const statuses = Object.values(components).map(component => normalizeHealthStatus(component.status));
  if (statuses.includes("unhealthy")) return "unhealthy";
  if (statuses.some(status => ["degraded", "unknown", "not_configured"].includes(status))) return "degraded";
  if (statuses.every(status => status === "disabled" || status === "healthy")) return "healthy";
  return "unknown";
}

export async function getReadinessHealth(options: { dbFactory?: () => Promise<DbLike | null>; env?: NodeJS.ProcessEnv } = {}): Promise<ReadinessHealth> {
  const dbFactory = options.dbFactory ?? getDb as () => Promise<DbLike | null>;
  const provider = checkProviders(options.env ?? process.env);
  const components: ReadinessHealth["components"] = {
    app: { status: "healthy", message: "Application process is running." },
    database: await checkDatabase(dbFactory),
    migrations: await checkMigrations(dbFactory),
    objectStorage: provider.objectStorage,
    payments: provider.payments,
    messaging: provider.messaging,
    ocr: provider.ocr,
    workerQueue: await checkWorkerQueue(dbFactory),
    stock: await checkStockSanity(dbFactory),
    reservations: await checkReservationSanity(dbFactory),
  };
  return { status: rollup(components), timestamp: new Date().toISOString(), service: SERVICE_NAME, version: SERVICE_VERSION, components };
}
