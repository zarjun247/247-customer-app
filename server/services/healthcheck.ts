import fs from "fs";
import path from "path";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { batches, stockReservations, storeSkus, workerJobs } from "../../drizzle/schema";
import { and, count, eq, lt, or } from "drizzle-orm";
import { getQueueStats } from "./jobQueue";
import { redactForObservability } from "./observability";

export type ComponentStatus = "healthy" | "configured" | "not_configured" | "disabled" | "degraded" | "unhealthy" | "unknown";
export type OverallStatus = "ok" | "degraded" | "unhealthy";

export interface HealthComponent {
  status: ComponentStatus;
  message?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface HealthReport {
  status: OverallStatus;
  generatedAt: string;
  app: HealthComponent & { uptimeSeconds: number; environment: string; version: string; requestIdSupported: boolean; buildSha?: string };
  database: HealthComponent;
  migrations: HealthComponent;
  providers: Record<string, HealthComponent>;
  workerQueue: HealthComponent;
  stockReservationSanity: HealthComponent;
}

const DISABLED_VALUES = new Set(["0", "false", "off", "disabled", "no"]);
const ENABLED_VALUES = new Set(["1", "true", "on", "enabled", "yes"]);

function hasEnv(name: string): boolean {
  return Boolean((process.env[name] ?? "").trim());
}

function flagStatus(name: string, defaultEnabled = true): "enabled" | "disabled" {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultEnabled ? "enabled" : "disabled";
  if (DISABLED_VALUES.has(raw)) return "disabled";
  if (ENABLED_VALUES.has(raw)) return "enabled";
  return defaultEnabled ? "enabled" : "disabled";
}

function configured(keys: string[]): boolean {
  return keys.every(hasEnv);
}

function optionalConfigured(keys: string[]): boolean {
  return keys.some(hasEnv);
}

function providerFromEnv(input: { name: string; enabledFlag?: string; defaultEnabled?: boolean; requiredAny?: string[]; requiredAll?: string[]; message?: string }): HealthComponent {
  if (input.enabledFlag && flagStatus(input.enabledFlag, input.defaultEnabled ?? true) === "disabled") {
    return { status: "disabled", message: `${input.name} disabled by configuration` };
  }
  const isConfigured = input.requiredAll ? configured(input.requiredAll) : optionalConfigured(input.requiredAny ?? []);
  return {
    status: isConfigured ? "configured" : "not_configured",
    message: isConfigured
      ? `${input.name} credentials/configuration are present; no external ping was performed`
      : `${input.name} is not configured`,
  };
}

async function checkDatabase(): Promise<HealthComponent> {
  const startedAt = Date.now();
  try {
    const db = await getDb();
    if (!db) return { status: "degraded", message: "Database client is unavailable or DATABASE_URL is not configured" };
    await (db as { execute: (query: unknown) => Promise<unknown> }).execute(sql`select 1 as ok`);
    return { status: "healthy", latencyMs: Date.now() - startedAt, message: "Read-only database ping succeeded" };
  } catch {
    return { status: "unhealthy", latencyMs: Date.now() - startedAt, message: "Read-only database ping failed" };
  }
}

export function checkMigrations(): HealthComponent {
  try {
    const drizzleDir = path.resolve(process.cwd(), "drizzle");
    const files = fs.existsSync(drizzleDir) ? fs.readdirSync(drizzleDir).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort() : [];
    const prefixes = files.map((file) => file.slice(0, 4));
    const duplicates = Array.from(new Set(prefixes.filter((prefix, index) => prefixes.indexOf(prefix) !== index)));
    const latest = prefixes.length ? prefixes[prefixes.length - 1] : null;
    return {
      status: duplicates.length ? "unhealthy" : "healthy",
      message: duplicates.length ? "Duplicate migration prefixes detected" : "Migration filenames have unique prefixes",
      details: {
        latestMigrationNumber: latest,
        migrationFileCount: files.length,
        duplicatePrefixes: duplicates,
        verifier: "static_filename_read_only",
      },
    };
  } catch {
    return { status: "unknown", message: "Migration files could not be inspected" };
  }
}

function checkProviders(): Record<string, HealthComponent> {
  return {
    razorpay: providerFromEnv({ name: "Razorpay", enabledFlag: "PAYMENT_PROVIDER_ENABLED", defaultEnabled: false, requiredAll: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"] }),
    paymentWebhook: providerFromEnv({ name: "Payment webhook", enabledFlag: "PAYMENT_WEBHOOK_ENABLED", defaultEnabled: false, requiredAny: ["RAZORPAY_WEBHOOK_SECRET", "PAYMENT_WEBHOOK_SECRET"] }),
    whatsapp: providerFromEnv({ name: "WhatsApp", enabledFlag: "WHATSAPP_ENABLED", requiredAny: ["WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_API_TOKEN"] }),
    sms: providerFromEnv({ name: "SMS", enabledFlag: "SMS_ENABLED", requiredAny: ["SMS_PROVIDER_API_KEY", "MSG91_API_KEY", "TWILIO_AUTH_TOKEN"] }),
    otp: providerFromEnv({ name: "OTP", enabledFlag: "OTP_ENABLED", requiredAny: ["OTP_RATE_LIMIT_BACKEND", "SMS_PROVIDER_API_KEY", "MSG91_API_KEY", "TWILIO_AUTH_TOKEN"] }),
    ocr: providerFromEnv({ name: "OCR", enabledFlag: "OCR_PRODUCTION_ENABLED", defaultEnabled: false, requiredAny: ["OCR_PROVIDER_API_KEY", "OCR_ENDPOINT"] }),
    printer: providerFromEnv({ name: "Printer", enabledFlag: "PRINTER_ENABLED", defaultEnabled: false, requiredAny: ["PRINTER_ENDPOINT", "PRINTNODE_API_KEY"] }),
    storage: providerFromEnv({ name: "Storage/S3", enabledFlag: "STORAGE_ENABLED", requiredAny: ["S3_BUCKET", "AWS_BUCKET", "BUILT_IN_FORGE_API_URL"] }),
    tally: providerFromEnv({ name: "Tally/ERP/export", enabledFlag: "TALLY_EXPORT_ENABLED", defaultEnabled: false, requiredAny: ["TALLY_ENDPOINT", "ERP_EXPORT_ENDPOINT"] }),
    maps: providerFromEnv({ name: "Maps/geocoding", enabledFlag: "MAPS_ENABLED", requiredAny: ["GOOGLE_MAPS_API_KEY", "MAPS_API_KEY"] }),
  };
}

async function checkWorkerQueue(): Promise<HealthComponent> {
  const dbBackedConfigured = hasEnv("DATABASE_URL");
  try {
    const stats = await getQueueStats();
    let dbStats: Record<string, unknown> = {};
    const db = await getDb();
    if (db) {
      const [pending] = await db.select({ value: count() }).from(workerJobs).where(or(eq(workerJobs.status, "queued"), eq(workerJobs.status, "retry_scheduled"))!);
      const [dead] = await db.select({ value: count() }).from(workerJobs).where(eq(workerJobs.status, "dead_letter"));
      const staleCutoff = new Date(Date.now() - 5 * 60_000);
      const [stale] = await db.select({ value: count() }).from(workerJobs).where(and(or(eq(workerJobs.status, "reserved"), eq(workerJobs.status, "running"))!, lt(workerJobs.heartbeatAt, staleCutoff)));
      dbStats = { dbPendingCount: pending?.value ?? 0, dbDeadLetterCount: dead?.value ?? 0, dbStaleRunningCount: stale?.value ?? 0 };
    }
    return {
      status: dbBackedConfigured ? "configured" : "degraded",
      message: dbBackedConfigured ? "Worker queue is configured; read-only counters collected" : "Worker queue is using in-memory/read-only counters because DATABASE_URL is unavailable",
      details: { ...stats, ...dbStats, readOnly: true },
    };
  } catch {
    return { status: "degraded", message: "Worker queue counters could not be collected safely", details: { readOnly: true } };
  }
}

async function checkStockReservationSanity(): Promise<HealthComponent> {
  try {
    const db = await getDb();
    if (!db) return { status: "unknown", message: "Database unavailable; stock/reservation sanity not proven", details: { readOnly: true } };
    const now = new Date();
    const [negativeStoreSku] = await db.select({ value: count() }).from(storeSkus).where(lt(storeSkus.stockQty, 0));
    const [negativeBatch] = await db.select({ value: count() }).from(batches).where(or(lt(batches.quantity, 0), lt(batches.qtyOnHand, 0))!);
    const [expiredActive] = await db.select({ value: count() }).from(stockReservations).where(and(eq(stockReservations.status, "active"), lt(stockReservations.expiresAt, now)));
    const negativeStockCount = Number(negativeStoreSku?.value ?? 0) + Number(negativeBatch?.value ?? 0);
    const expiredActiveReservationCount = Number(expiredActive?.value ?? 0);
    return {
      status: negativeStockCount > 0 || expiredActiveReservationCount > 0 ? "degraded" : "healthy",
      message: "Read-only stock/reservation sanity counters collected",
      details: {
        negativeStockCount,
        expiredActiveReservationCount,
        staleReservationCount: expiredActiveReservationCount,
        stockTruthCertification: "runtime_read_only_counters",
        readOnly: true,
      },
    };
  } catch {
    return { status: "unknown", message: "Stock/reservation sanity counters could not be collected safely", details: { readOnly: true } };
  }
}

function aggregateStatus(components: HealthComponent[]): OverallStatus {
  if (components.some((component) => component.status === "unhealthy")) return "unhealthy";
  if (components.some((component) => ["degraded", "unknown"].includes(component.status))) return "degraded";
  return "ok";
}

export async function getHealthReport(): Promise<HealthReport> {
  const database = await checkDatabase();
  const migrations = checkMigrations();
  const providers = checkProviders();
  const workerQueue = await checkWorkerQueue();
  const stockReservationSanity = await checkStockReservationSanity();
  const app = {
    status: "healthy" as ComponentStatus,
    message: "Process is running",
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || "development",
    version: process.env.npm_package_version || "1.0.0",
    buildSha: process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA,
    requestIdSupported: true,
  };
  const report: HealthReport = {
    status: aggregateStatus([database, migrations, workerQueue, stockReservationSanity]),
    generatedAt: new Date().toISOString(),
    app,
    database,
    migrations,
    providers,
    workerQueue,
    stockReservationSanity,
  };
  return redactForObservability(report);
}

export function toPublicLiveness(report: HealthReport) {
  return redactForObservability({ status: report.app.status === "healthy" ? "ok" : "unhealthy", requestIdSupported: report.app.requestIdSupported });
}

export function toPublicReadiness(report: HealthReport) {
  return redactForObservability({
    status: report.status === "unhealthy" ? "unhealthy" : report.status,
    ready: report.status !== "unhealthy",
    checks: {
      app: report.app.status,
      database: report.database.status === "healthy" ? "healthy" : report.database.status,
      migrations: report.migrations.status,
    },
  });
}
