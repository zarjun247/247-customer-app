import { readdirSync } from "fs";
import { join } from "path";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { isProviderEnabled } from "../_core/env";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "not_configured" | "disabled" | "unknown";
export type HealthScope = "public" | "readiness" | "admin";

export type HealthComponent = {
  status: HealthStatus;
  message?: string;
  latencyMs?: number;
  configured?: boolean;
  enabled?: boolean;
  details?: Record<string, unknown>;
};

export type HealthReport = {
  status: HealthStatus;
  service: string;
  scope: HealthScope;
  timestamp: string;
  components: Record<string, HealthComponent>;
};

type DbLike = Awaited<ReturnType<typeof getDb>>;

type HealthDeps = {
  getDb?: () => Promise<DbLike>;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  migrationDir?: string;
};

const ALLOWED_STATUSES = new Set<HealthStatus>(["healthy", "degraded", "unhealthy", "not_configured", "disabled", "unknown"]);

function statusByRequiredConfig(env: NodeJS.ProcessEnv, flag: string, vars: string[], defaultEnabled = false): HealthComponent {
  const enabled = isEnabled(env[flag], defaultEnabled);
  if (!enabled) return { status: "disabled", enabled: false, configured: false, message: `${flag} disabled` };
  const missing = vars.filter(name => !safeEnv(env, name));
  if (missing.length) {
    return { status: "not_configured", enabled: true, configured: false, message: "required configuration missing", details: { missing } };
  }
  return { status: "degraded", enabled: true, configured: true, message: "configuration present; external ping not performed" };
}

function isEnabled(value: string | undefined, defaultEnabled = false): boolean {
  if (value === undefined) return defaultEnabled;
  return ["1", "true", "yes", "on", "enabled"].includes(value.toLowerCase());
}

function safeEnv(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] ?? "").trim();
}

function summarizeStatus(components: Record<string, HealthComponent>): HealthStatus {
  const statuses = Object.values(components).map(c => c.status).filter(status => ALLOWED_STATUSES.has(status));
  if (statuses.includes("unhealthy")) return "unhealthy";
  if (statuses.includes("degraded") || statuses.includes("unknown") || statuses.includes("not_configured")) return "degraded";
  return "healthy";
}

async function dbHealth(db: DbLike): Promise<HealthComponent> {
  if (!db) return { status: "unhealthy", message: "database unavailable" };
  const started = Date.now();
  try {
    await db.execute(sql`select 1 as ok`);
    return { status: "healthy", latencyMs: Date.now() - started, message: "database connectivity verified" };
  } catch {
    return { status: "unhealthy", latencyMs: Date.now() - started, message: "database connectivity check failed" };
  }
}

function latestMigrationFile(migrationDir: string): string | null {
  try {
    const files = readdirSync(migrationDir).filter(file => /^\d+.*\.sql$/i.test(file)).sort();
    return files.at(-1) ?? null;
  } catch {
    return null;
  }
}

async function migrationHealth(db: DbLike, migrationDir: string): Promise<HealthComponent> {
  const latestFile = latestMigrationFile(migrationDir);
  if (!db) return { status: "unknown", message: "database unavailable; migration table not checked", details: { latestMigrationFile: latestFile } };
  try {
    const rows = await db.execute(sql`select hash, created_at from __drizzle_migrations order by created_at desc limit 1`);
    const applied = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0] : rows[0]) : rows;
    return {
      status: latestFile ? "degraded" : "unknown",
      message: latestFile ? "latest migration file detected; migration table smoke query succeeded but filename comparison is unavailable" : "migration table smoke query succeeded; migration files unavailable",
      details: { latestMigrationFile: latestFile, latestAppliedMigrationTracked: Boolean(applied) },
    };
  } catch {
    return { status: "unknown", message: "migration tracking table unavailable or not queryable", details: { latestMigrationFile: latestFile } };
  }
}

async function countQuery(db: DbLike, statement: ReturnType<typeof sql>): Promise<number | null> {
  if (!db) return null;
  const result = await db.execute(statement);
  const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result;
  const first = Array.isArray(rows) ? rows[0] : rows;
  const value = first && typeof first === "object" ? Object.values(first as Record<string, unknown>)[0] : null;
  return value === null || value === undefined ? null : Number(value);
}

async function stockSanityHealth(db: DbLike): Promise<HealthComponent> {
  if (!db) return { status: "unknown", message: "database unavailable; stock sanity not checked" };
  try {
    const negativeStockCount = await countQuery(db, sql`select count(*) as count from store_skus where stockQty < 0 or softLockedQty < 0`);
    const status: HealthStatus = negativeStockCount && negativeStockCount > 0 ? "unhealthy" : "healthy";
    return { status, message: "read-only stock invariant sanity check completed", details: { negativeStockCount: negativeStockCount ?? 0, readOnly: true } };
  } catch {
    return { status: "unknown", message: "stock sanity query unavailable", details: { readOnly: true } };
  }
}

async function reservationSanityHealth(db: DbLike, now: Date): Promise<HealthComponent> {
  if (!db) return { status: "unknown", message: "database unavailable; reservation sanity not checked" };
  try {
    const expiredActiveReservationCount = await countQuery(db, sql`select count(*) as count from stock_reservations where status = 'active' and expiresAt is not null and expiresAt < ${now}`);
    const activeReservationCount = await countQuery(db, sql`select count(*) as count from stock_reservations where status = 'active'`);
    const status: HealthStatus = expiredActiveReservationCount && expiredActiveReservationCount > 0 ? "degraded" : "healthy";
    return { status, message: "read-only reservation expiry sanity check completed", details: { activeReservationCount: activeReservationCount ?? 0, expiredActiveReservationCount: expiredActiveReservationCount ?? 0, readOnly: true } };
  } catch {
    return { status: "unknown", message: "reservation sanity query unavailable", details: { readOnly: true } };
  }
}

async function queueHealth(db: DbLike): Promise<HealthComponent> {
  if (!db) return { status: "unknown", message: "database unavailable; OCR queue backlog not checked" };
  try {
    const pendingOcrJobs = await countQuery(db, sql`select count(*) as count from ocr_jobs where status in ('pending','failed')`);
    return { status: "unknown", message: "OCR queue table detected; no durable worker heartbeat is implemented", details: { pendingOcrJobs: pendingOcrJobs ?? 0 } };
  } catch {
    return { status: "unknown", message: "queue table unavailable or no queue configured" };
  }
}

function workerHealth(env: NodeJS.ProcessEnv): HealthComponent {
  const hasAuth = Boolean(safeEnv(env, "WORKER_CRON_SECRET") || safeEnv(env, "WORKER_ADMIN_TOKEN"));
  const disabled = isEnabled(env.WORKER_DISABLED, false);
  if (disabled) return { status: "disabled", enabled: false, configured: false, message: "worker explicitly disabled" };
  return {
    status: hasAuth ? "unknown" : "not_configured",
    enabled: true,
    configured: hasAuth,
    message: hasAuth ? "worker trigger auth configured; no durable last-run heartbeat exists" : "worker trigger auth missing",
  };
}

function providerComponents(env: NodeJS.ProcessEnv): Record<string, HealthComponent> {
  return {
    storage: statusByRequiredConfig(env, "STORAGE_PROVIDER_ENABLED", ["BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY"], true),
    payment: statusByRequiredConfig(env, "PAYMENT_PROVIDER_ENABLED", ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"], false),
    paymentWebhook: statusByRequiredConfig(env, "PAYMENT_WEBHOOK_ENABLED", ["RAZORPAY_WEBHOOK_SECRET"], false),
    whatsApp: statusByRequiredConfig(env, "WHATSAPP_PROVIDER_ENABLED", ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_API_TOKEN"], false),
    sms: statusByRequiredConfig(env, "SMS_PROVIDER_ENABLED", ["SMS_PROVIDER_API_KEY"], false),
    otpProvider: statusByRequiredConfig(env, "OTP_PROVIDER_ENABLED", ["OTP_PROVIDER_API_KEY", "OTP_RATE_LIMIT_BACKEND"], false),
    ocr: statusByRequiredConfig(env, "OCR_PROVIDER_ENABLED", ["OCR_PROVIDER_API_KEY"], false),
    printer: statusByRequiredConfig(env, "PRINTER_PROVIDER_ENABLED", ["PRINTER_HOST"], false),
    tallyErpExport: statusByRequiredConfig(env, "ERP_PROVIDER_ENABLED", ["ERP_ENDPOINT", "ERP_API_KEY"], false),
    mapsGeocoding: statusByRequiredConfig(env, "MAPS_PROVIDER_ENABLED", ["GOOGLE_MAPS_API_KEY"], Boolean(safeEnv(env, "GOOGLE_MAPS_API_KEY"))),
  };
}

export function createLivenessReport(now = new Date()): HealthReport {
  const components = {
    app: { status: "healthy", message: "process is running", details: { uptimeSeconds: Math.round(process.uptime()) } },
  } satisfies Record<string, HealthComponent>;
  return { status: "healthy", service: "247-customer-app", scope: "public", timestamp: now.toISOString(), components };
}

export async function createHealthReport(scope: HealthScope = "readiness", deps: HealthDeps = {}): Promise<HealthReport> {
  const env = deps.env ?? process.env;
  const now = deps.now?.() ?? new Date();
  const db = await (deps.getDb ?? getDb)().catch(() => null);
  const migrationDir = deps.migrationDir ?? join(process.cwd(), "drizzle");
  const components: Record<string, HealthComponent> = {
    app: { status: "healthy", message: "process is running", details: { uptimeSeconds: Math.round(process.uptime()) } },
    db: await dbHealth(db),
    migrations: await migrationHealth(db, migrationDir),
    ...providerComponents(env),
    worker: workerHealth(env),
    queue: await queueHealth(db),
    stockSanity: await stockSanityHealth(db),
    reservationSanity: await reservationSanityHealth(db, now),
  };

  return {
    status: summarizeStatus(components),
    service: "247-customer-app",
    scope,
    timestamp: now.toISOString(),
    components,
  };
}

export function readinessSummary(report: HealthReport): HealthReport {
  const publicComponents = {
    app: report.components.app,
    db: report.components.db,
    migrations: report.components.migrations,
  };
  return { ...report, scope: "readiness", components: publicComponents, status: summarizeStatus(publicComponents) };
}
