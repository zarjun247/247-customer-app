import { count, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { orders, stores, storeSkus, users } from "../../drizzle/schema";
import {
  checkProviders,
  checkWorkerQueue,
  getHealthReport,
  publicReadiness,
  type HealthStatus,
} from "./healthcheck";
import { safeMetadata } from "./observability";

export type RuntimeCheck = {
  status: HealthStatus | "ready" | "not_ready" | "manual_required";
  message?: string;
  details?: Record<string, unknown>;
};

function safeFailure(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}

function noProofClaim(): RuntimeCheck {
  return {
    status: "manual_required",
    message:
      "No production deployment proof is asserted by this endpoint; validate with real CI/CD logs, runtime URL checks, backups, and observability.",
  };
}

function rollup(statuses: string[]): "ready" | "not_ready" {
  return statuses.some(status =>
    ["unhealthy", "not_ready", "unknown"].includes(status)
  )
    ? "not_ready"
    : "ready";
}

export async function getDeploymentReadinessSummary() {
  const [readiness, health, workerQueue] = await Promise.all([
    publicReadiness(),
    getHealthReport(),
    checkWorkerQueue(),
  ]);
  const status = rollup([readiness.status, health.status, workerQueue.status]);
  return safeMetadata({
    status,
    generatedAt: new Date().toISOString(),
    publicReadiness: readiness,
    criticalChecks: {
      app: health.app.status,
      database: health.database.status,
      migrations: health.migrations.status,
      workerQueue: workerQueue.status,
      stockReservationSanity: health.stockReservationSanity.status,
    },
    degradedMode: getDegradedModeStatus(health.status, workerQueue.status),
    deploymentProof: noProofClaim(),
  });
}

export function getProviderReadiness() {
  return safeMetadata({
    status: "manual_required",
    generatedAt: new Date().toISOString(),
    providers: checkProviders(),
    note: "Configuration presence is not external delivery proof; live provider verification must be performed outside this safe endpoint.",
  });
}

export async function getWorkerQueueReadiness() {
  const workerQueue = await checkWorkerQueue();
  return safeMetadata({
    status: workerQueue.status,
    generatedAt: new Date().toISOString(),
    workerQueue,
  });
}

export function getDegradedModeStatus(...statuses: string[]) {
  const degraded = statuses.some(status =>
    ["degraded", "unhealthy", "unknown", "not_ready"].includes(status)
  );
  return {
    status: degraded ? "degraded" : "healthy",
    safeBehaviors: [
      "Public liveness stays minimal and secret-free.",
      "Readiness returns non-2xx when database or migration checks are unsafe.",
      "Provider-unconfigured and demo-skipped states are not treated as success.",
      "Destructive restore execution is refused by default and documented as a non-production drill only.",
    ],
  } as const;
}

export function getBackupRestoreDrillReadiness() {
  return {
    status: "manual_required" as const,
    generatedAt: new Date().toISOString(),
    backupScript: "scripts/backup-db.mjs --dry-run --metadata",
    restoreDrillScript:
      "scripts/restore-db-drill.mjs --dry-run --backup-file <non-production-backup.sql>",
    destructiveRestoreScriptAvailable: false,
    warning:
      "No production restore is automated. Restore drills require explicit non-production targets and refuse production-looking targets.",
  };
}

export function getOperationalFailureExerciseMatrix() {
  return safeMetadata({
    status: "manual_required" as const,
    generatedAt: new Date().toISOString(),
    proofClaim: "exercise_plan_only",
    exercises: [
      {
        name: "payment_provider_outage",
        degradedSignal: "provider_unavailable",
        failClosed: true,
        manualFallback:
          "cash/UPI only after pharmacist and cashier approval; no paid status without settlement evidence",
      },
      {
        name: "ocr_outage",
        degradedSignal: "ocr_unavailable",
        failClosed: true,
        manualFallback:
          "manual invoice/prescription entry with H/H1/pharmacist gates preserved",
      },
      {
        name: "whatsapp_sms_outage",
        degradedSignal: "notification_provider_unavailable",
        failClosed: false,
        manualFallback:
          "operator phone call and in-app status notes; no PHI in fallback messages",
      },
      {
        name: "queue_backlog",
        degradedSignal: "worker_queue_degraded",
        failClosed: false,
        manualFallback:
          "pause non-critical jobs, prioritize payment/refund/provider retries",
      },
      {
        name: "dead_letter_growth",
        degradedSignal: "dead_letters_require_review",
        failClosed: true,
        manualFallback:
          "operator review and replay only through audited retry path",
      },
      {
        name: "db_connection_degradation",
        degradedSignal: "database_degraded",
        failClosed: true,
        manualFallback:
          "stop stock-changing operations until readiness recovers",
      },
      {
        name: "worker_crash",
        degradedSignal: "worker_unhealthy",
        failClosed: false,
        manualFallback:
          "restart worker, monitor stale running jobs, reconcile provider side effects",
      },
      {
        name: "deployment_rollback",
        degradedSignal: "rollback_in_progress",
        failClosed: true,
        manualFallback:
          "freeze deploys and stock/commercial mutations until post-rollback smoke passes",
      },
    ],
  });
}

export async function getMultiStoreRuntimeOverview() {
  try {
    const db = await getDb();
    if (!db)
      return {
        status: "unknown" as const,
        message: "database_unavailable",
        generatedAt: new Date().toISOString(),
      };
    const [storeCount] = await db.select({ value: count() }).from(stores);
    const [activeStoreCount] = await db
      .select({ value: count() })
      .from(stores)
      .where(eq(stores.isActive, true));
    const [activeSkuCount] = await db
      .select({ value: count() })
      .from(storeSkus)
      .where(eq(storeSkus.isActive, true));
    const [negativeStock] = await db
      .select({ value: count() })
      .from(storeSkus)
      .where(lt(storeSkus.stockQty, 0));
    const [usersWithoutStore] = await db
      .select({ value: count() })
      .from(users)
      .where(
        sql`${users.onboardingComplete} = true and ${users.assignedStoreId} is null`
      );
    const [ordersWithoutStore] = await db
      .select({ value: count() })
      .from(orders)
      .where(sql`${orders.storeId} is null`);
    const isolation =
      Number(usersWithoutStore?.value ?? 0) === 0 &&
      Number(ordersWithoutStore?.value ?? 0) === 0 &&
      Number(negativeStock?.value ?? 0) === 0;
    return safeMetadata({
      status: isolation ? "healthy" : "degraded",
      generatedAt: new Date().toISOString(),
      stores: {
        total: Number(storeCount?.value ?? 0),
        active: Number(activeStoreCount?.value ?? 0),
      },
      inventory: {
        activeStoreSkuRows: Number(activeSkuCount?.value ?? 0),
        negativeStockRows: Number(negativeStock?.value ?? 0),
      },
      isolationChecks: {
        onboardedUsersWithoutAssignedStore: Number(
          usersWithoutStore?.value ?? 0
        ),
        ordersWithoutStoreId: Number(ordersWithoutStore?.value ?? 0),
      },
    });
  } catch (error) {
    return {
      status: "unknown" as const,
      message: safeFailure(error),
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function getStoreRuntimeDetail(storeId: number) {
  try {
    const db = await getDb();
    if (!db)
      return {
        status: "unknown" as const,
        message: "database_unavailable",
        generatedAt: new Date().toISOString(),
      };
    const [store] = await db
      .select({
        id: stores.id,
        name: stores.name,
        isActive: stores.isActive,
        type: stores.type,
        pincode: stores.pincode,
        slaMins: stores.slaMins,
      })
      .from(stores)
      .where(eq(stores.id, storeId))
      .limit(1);
    if (!store)
      return {
        status: "unknown" as const,
        message: "store_not_found",
        generatedAt: new Date().toISOString(),
      };
    const [skuRows] = await db
      .select({ value: count() })
      .from(storeSkus)
      .where(eq(storeSkus.storeId, storeId));
    const [orderRows] = await db
      .select({ value: count() })
      .from(orders)
      .where(eq(orders.storeId, storeId));
    return safeMetadata({
      status: store.isActive ? "healthy" : "disabled",
      generatedAt: new Date().toISOString(),
      store,
      inventory: { skuRows: Number(skuRows?.value ?? 0) },
      orders: { totalRows: Number(orderRows?.value ?? 0) },
    });
  } catch (error) {
    return {
      status: "unknown" as const,
      message: safeFailure(error),
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function getStoreIsolationChecks() {
  const overview = await getMultiStoreRuntimeOverview();
  return safeMetadata({
    ...(overview as Record<string, unknown>),
    generatedAt: new Date().toISOString(),
    policy:
      "Staff/admin only. Responses expose aggregate operational metadata only and never customer PHI/PII.",
  });
}
