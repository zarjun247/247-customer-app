import fs from "fs";
import path from "path";
import { count, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { stockReservations, storeSkus } from "../../drizzle/schema";
import { getQueueStats } from "./jobQueue";
import { safeMetadata } from "./observability";
import { readFlag } from "./emergencyStopService";
import { isOutboxDispatcherRunning } from "./outboxDispatcher";
import { isReservationExpiryWorkerRunning } from "./reservationExpiryWorker";
import { isRetentionWorkerRunning } from "./retentionWorker";
import { isDsrSlaMonitorRunning } from "./dsrSlaMonitor";
import { isStockLockCleanupRunning } from "./stockLockService";
import { ENV } from "../_core/env";

export type HealthStatus =
  | "healthy"
  | "configured"
  | "not_configured"
  | "disabled"
  | "degraded"
  | "unhealthy"
  | "unknown";

export type HealthComponent = {
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
};

export type WorkerStatus = {
  outboxDispatcher: boolean;
  reservationExpiryWorker: boolean;
  retentionWorker: boolean;
  dsrSlaMonitor: boolean;
  stockLockCleanup: boolean;
};

export type ReadinessReport = {
  status: "ready" | "not_ready";
  timestamp: string;
  checks: {
    database: HealthStatus;
    migrations: HealthStatus;
    storage: HealthStatus;
    workers: HealthStatus;
    emergency_stop: HealthStatus;
  };
  workers?: WorkerStatus;
  emergency_stop?: { active: boolean; reason: string | null };
};

export type HealthReport = {
  status: HealthStatus;
  generatedAt: string;
  app: HealthComponent & {
    uptimeSeconds: number;
    environment: string;
    version?: string;
    buildSha?: string;
  };
  database: HealthComponent;
  migrations: HealthComponent;
  providers: Record<string, HealthComponent>;
  workerQueue: HealthComponent;
  stockReservationSanity: HealthComponent;
};

const PROVIDERS = [
  {
    key: "razorpay",
    enabled: "PAYMENT_PROVIDER_ENABLED",
    required: ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"],
  },
  {
    key: "whatsapp",
    enabled: "WHATSAPP_PROVIDER_ENABLED",
    required: ["WHATSAPP_WEBHOOK_SECRET"],
    optional: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_TOKEN"],
  },
  {
    key: "sms",
    enabled: "SMS_PROVIDER_ENABLED",
    required: ["SMS_PROVIDER_API_KEY"],
  },
  {
    key: "otp",
    enabled: "OTP_PROVIDER_ENABLED",
    required: ["OTP_PROVIDER_API_KEY"],
  },
  {
    key: "ocr",
    enabled: "OCR_PROVIDER_ENABLED",
    required: ["OCR_PROVIDER_API_KEY"],
  },
  {
    key: "printer",
    enabled: "PRINTER_PROVIDER_ENABLED",
    required: ["PRINTER_ENDPOINT"],
  },
  {
    key: "storageS3",
    enabled: "STORAGE_PROVIDER_ENABLED",
    required: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "S3_BUCKET"],
  },
  {
    key: "tallyErpExport",
    enabled: "TALLY_EXPORT_ENABLED",
    required: ["TALLY_EXPORT_PATH"],
  },
  {
    key: "mapsGeocoding",
    enabled: "MAPS_PROVIDER_ENABLED",
    required: ["GOOGLE_MAPS_API_KEY"],
  },
];

function enabled(flag: string, env = process.env): boolean | undefined {
  const raw = env[flag];
  if (raw === undefined) return undefined;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function configured(keys: string[], env = process.env): boolean {
  return keys.every(key => Boolean(env[key]?.trim()));
}

function safeFailure(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

function rollup(critical: HealthStatus[]): HealthStatus {
  if (critical.includes("unhealthy")) return "unhealthy";
  if (critical.includes("degraded")) return "degraded";
  if (critical.includes("unknown")) return "unknown";
  return "healthy";
}

export async function checkDatabase(): Promise<HealthComponent> {
  const started = Date.now();
  try {
    const db = await getDb();
    if (!db) return { status: "unhealthy", message: "database_unavailable" };
    await db.execute(sql`select 1`);
    return { status: "healthy", latencyMs: Date.now() - started };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - started,
      message: safeFailure(error),
    };
  }
}

export function checkMigrations(
  drizzleDir = path.resolve(process.cwd(), "drizzle")
): HealthComponent {
  try {
    const files = fs.existsSync(drizzleDir)
      ? fs
          .readdirSync(drizzleDir)
          .filter(file => /^\d{4}_.+\.sql$/.test(file))
          .sort()
      : [];
    const prefixes = new Map<string, string[]>();
    for (const file of files) {
      const prefix = file.slice(0, 4);
      prefixes.set(prefix, [...(prefixes.get(prefix) ?? []), file]);
    }
    const duplicates = Array.from(prefixes.entries())
      .filter(([, names]) => names.length > 1)
      .map(([prefix]) => prefix);
    const latest = files.at(-1)?.slice(0, 4) ?? null;
    if (duplicates.length > 0) {
      return {
        status: "unhealthy",
        message: "duplicate_migration_prefix",
        details: {
          duplicatePrefixes: duplicates,
          latestMigrationPrefix: latest,
          migrationCount: files.length,
        },
      };
    }
    return {
      status: "healthy",
      details: { latestMigrationPrefix: latest, migrationCount: files.length },
    };
  } catch (error) {
    return { status: "unknown", message: safeFailure(error) };
  }
}

export function checkProviders(
  env = process.env
): Record<string, HealthComponent> {
  const entries: Array<[string, HealthComponent]> = PROVIDERS.map(provider => {
    const isEnabled = enabled(provider.enabled, env);
    if (isEnabled === false)
      return [
        provider.key,
        { status: "disabled" as const, message: "provider_disabled" },
      ];
    const hasRequiredConfig = configured(provider.required, env);
    if (!hasRequiredConfig)
      return [
        provider.key,
        {
          status: "not_configured" as const,
          message: "required_configuration_missing",
        },
      ];
    return [
      provider.key,
      {
        status: "configured" as const,
        message: "configuration_present_external_health_not_asserted",
      },
    ];
  });
  return Object.fromEntries(entries);
}

export async function checkWorkerQueue(): Promise<HealthComponent> {
  try {
    const stats = await getQueueStats();
    const status: HealthStatus =
      stats.deadLetterCount > 0 || stats.staleRunningCount > 0
        ? "degraded"
        : "configured";
    return {
      status,
      details: safeMetadata({
        queuedCount: stats.queuedCount,
        runningCount: stats.runningCount,
        retryCount: stats.retryCount,
        deadLetterCount: stats.deadLetterCount,
        staleRunningCount: stats.staleRunningCount,
        oldestQueuedAgeMs: stats.oldestQueuedAgeMs,
        oldestRetryAgeMs: stats.oldestRetryAgeMs,
        generatedAt: stats.generatedAt,
      }) as Record<string, unknown>,
    };
  } catch (error) {
    return { status: "unknown", message: safeFailure(error) };
  }
}

export async function checkStockReservationSanity(): Promise<HealthComponent> {
  try {
    const db = await getDb();
    if (!db) return { status: "unknown", message: "database_unavailable" };
    const [negativeStock] = await db
      .select({ value: count() })
      .from(storeSkus)
      .where(lt(storeSkus.stockQty, 0));
    const [staleReservations] = await db
      .select({ value: count() })
      .from(stockReservations)
      .where(
        sql`${stockReservations.status} = 'active' and ${stockReservations.expiresAt} is not null and ${stockReservations.expiresAt} < now()`
      );
    const negativeStockCount = Number(negativeStock?.value ?? 0);
    const staleActiveReservationCount = Number(staleReservations?.value ?? 0);
    return {
      status:
        negativeStockCount > 0 || staleActiveReservationCount > 0
          ? "degraded"
          : "healthy",
      details: { negativeStockCount, staleActiveReservationCount },
    };
  } catch (error) {
    return { status: "unknown", message: safeFailure(error) };
  }
}

export async function getHealthReport(): Promise<HealthReport> {
  const [database, workerQueue, stockReservationSanity] = await Promise.all([
    checkDatabase(),
    checkWorkerQueue(),
    checkStockReservationSanity(),
  ]);
  const migrations = checkMigrations();
  const providers = checkProviders();
  const status = rollup([database.status, migrations.status]);
  return safeMetadata({
    status,
    generatedAt: new Date().toISOString(),
    app: {
      status: "healthy",
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV ?? "development",
      version: process.env.npm_package_version ?? "1.0.0",
      buildSha:
        process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    },
    database,
    migrations,
    providers,
    workerQueue,
    stockReservationSanity,
  }) as HealthReport;
}

export function checkWorkers(): HealthComponent & {
  workerStatus: WorkerStatus;
} {
  const workerStatus: WorkerStatus = {
    outboxDispatcher: isOutboxDispatcherRunning(),
    reservationExpiryWorker: isReservationExpiryWorkerRunning(),
    retentionWorker: isRetentionWorkerRunning(),
    dsrSlaMonitor: isDsrSlaMonitorRunning(),
    stockLockCleanup: isStockLockCleanupRunning(),
  };

  // Only count workers that are enabled (env-gated workers that are intentionally off are OK)
  const expectedOutbox = ENV.outboxDispatchEnabled;
  const expectedReservation = ENV.reservationExpiryWorkerEnabled;
  const expectedStockLock = ENV.stockLockCleanupEnabled;
  const expectedRetention = ENV.retentionWorkerEnabled;
  const expectedDsr = ENV.dsrSlaMonitorEnabled;

  const expectedRunning = [
    expectedOutbox && !workerStatus.outboxDispatcher,
    expectedReservation && !workerStatus.reservationExpiryWorker,
    expectedStockLock && !workerStatus.stockLockCleanup,
    expectedRetention && !workerStatus.retentionWorker,
    expectedDsr && !workerStatus.dsrSlaMonitor,
  ].filter(Boolean);

  const status: HealthStatus =
    expectedRunning.length > 0 ? "degraded" : "healthy";
  return {
    status,
    message:
      status === "degraded"
        ? "one_or_more_expected_workers_not_running"
        : undefined,
    details: { ...(workerStatus as Record<string, unknown>) },
    workerStatus,
  };
}

export async function checkEmergencyStopStatus(): Promise<
  HealthComponent & { flagActive: boolean; reason: string | null }
> {
  try {
    const flag = await readFlag();
    return {
      status: flag.active ? "degraded" : "healthy",
      message: flag.active ? "emergency_stop_active" : undefined,
      flagActive: flag.active,
      reason: flag.reason,
    };
  } catch {
    return {
      status: "unknown",
      message: "emergency_stop_check_failed",
      flagActive: false,
      reason: null,
    };
  }
}

export function checkStorageConfig(): HealthComponent {
  const storageEnabled =
    (process.env.STORAGE_PROVIDER_ENABLED ?? "").toLowerCase() !== "false";
  if (!storageEnabled)
    return { status: "disabled", message: "storage_disabled" };
  const hasForgeKey = Boolean(process.env.BUILT_IN_FORGE_API_URL?.trim());
  if (!hasForgeKey)
    return { status: "not_configured", message: "forge_api_url_missing" };
  return { status: "configured", message: "storage_configured" };
}

export function publicLiveness() {
  return { status: "ok", timestamp: new Date().toISOString() };
}

export async function publicReadiness(): Promise<ReadinessReport> {
  const [database, emergencyStop] = await Promise.all([
    checkDatabase(),
    checkEmergencyStopStatus(),
  ]);
  const migrations = checkMigrations();
  const storage = checkStorageConfig();
  const workers = checkWorkers();

  const ready =
    !["unhealthy", "degraded"].includes(database.status) &&
    migrations.status !== "unhealthy" &&
    !emergencyStop.flagActive;

  return {
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    checks: {
      database: database.status,
      migrations: migrations.status,
      storage: storage.status,
      workers: workers.status,
      emergency_stop: emergencyStop.flagActive ? "degraded" : "healthy",
    },
    workers: workers.workerStatus,
    emergency_stop: {
      active: emergencyStop.flagActive,
      reason: emergencyStop.reason,
    },
  };
}
