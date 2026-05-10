import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";

async function getDbSafe() {
  const { getDb } = await import("../db");
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function requireAdmin(role: string) {
  const ADMIN = ["admin", "super_admin"];
  if (!ADMIN.includes(role)) throw new TRPCError({ code: "FORBIDDEN" });
}

export const deploymentReadinessRouter = router({
  // Deployment readiness checklist
  readinessChecklist: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.user!.role);
      
      const checks = {
        environment: {
          nodeEnv: process.env.NODE_ENV,
          appVersion: process.env.npm_package_version ?? "1.0.0",
          buildSha: process.env.GIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "unknown",
          hasProductionSecrets: !!process.env.DATABASE_URL && process.env.NODE_ENV === "production",
        },
        required_env_vars: {
          database: !!process.env.DATABASE_URL,
          nodeEnv: !!process.env.NODE_ENV,
          appSecret: !!process.env.APP_SECRET,
          jwtSecret: !!process.env.JWT_SECRET,
          oauthServerUrl: !!process.env.OAUTH_SERVER_URL,
        },
        optional_env_vars: {
          paymentProvider: !!process.env.PAYMENT_PROVIDER_ENABLED,
          smsProvider: !!process.env.SMS_PROVIDER_ENABLED,
          whatsappProvider: !!process.env.WHATSAPP_PROVIDER_ENABLED,
          otpProvider: !!process.env.OTP_PROVIDER_ENABLED,
          ocrProvider: !!process.env.OCR_PROVIDER_ENABLED,
        },
      };

      const db = await getDbSafe();
      const { sql } = await import("drizzle-orm");
      
      // Check DB connectivity and migration status
      let dbStatus = "unknown";
      try {
        await db.execute(sql`SELECT 1`);
        dbStatus = "connected";
      } catch (e) {
        dbStatus = "disconnected";
      }

      // Check migration files
      let migrationStatus = "unknown";
      try {
        const fs = await import("fs");
        const path = await import("path");
        const drizzleDir = path.resolve(process.cwd(), "drizzle");
        const files = fs.existsSync(drizzleDir)
          ? fs.readdirSync(drizzleDir).filter((file) => /^\d{4}_.+\.sql$/.test(file)).sort()
          : [];
        migrationStatus = files.length > 0 ? "present" : "missing";
      } catch (e) {
        migrationStatus = "error";
      }

      const allRequiredPresent = Object.values(checks.required_env_vars).every(v => v);
      const overallStatus = dbStatus === "connected" && migrationStatus === "present" && allRequiredPresent
        ? "ready"
        : "not_ready";

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        checks: {
          ...checks,
          database: dbStatus,
          migrations: migrationStatus,
        },
      };
    }),

  // Startup validation
  startupValidation: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.user!.role);
      const { getHealthReport } = await import("../services/healthcheck");
      const report = await getHealthReport();
      
      const isHealthy = report.status === "healthy";
      const dbHealthy = report.database.status === "healthy";
      const migrationsOk = report.migrations.status !== "unhealthy";
      const providersConfigured = Object.values(report.providers)
        .filter((p) => p.status !== "disabled")
        .every((p) => p.status === "configured" || p.status === "healthy");

      return {
        status: isHealthy ? "healthy" : report.status,
        ready: isHealthy && dbHealthy && migrationsOk,
        database: report.database,
        migrations: report.migrations,
        providers: Object.entries(report.providers)
          .filter(([, p]) => p.status !== "disabled")
          .map(([key, p]) => ({ provider: key, status: p.status, message: p.message })),
        workerQueue: report.workerQueue,
        stockReservationSanity: report.stockReservationSanity,
        timestamp: report.generatedAt,
      };
    }),

  // Degraded mode signaling
  degradedModeStatus: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.user!.role);
      const { getHealthReport } = await import("../services/healthcheck");
      const report = await getHealthReport();

      const degradationReasons = [];
      
      if (report.database.status === "unhealthy") {
        degradationReasons.push({ component: "database", severity: "critical", message: report.database.message });
      }
      if (report.database.status === "degraded") {
        degradationReasons.push({ component: "database", severity: "warning", message: "Database latency high" });
      }
      if (report.workerQueue.status === "degraded") {
        degradationReasons.push({ component: "workerQueue", severity: "warning", message: "Dead letters or stale jobs detected" });
      }
      if (report.stockReservationSanity.status === "degraded") {
        degradationReasons.push({ component: "stockReservation", severity: "warning", message: "Negative stock or stale reservations detected" });
      }

      const isDegraded = degradationReasons.length > 0;

      return {
        isDegraded,
        degradationLevel: isDegraded ? (degradationReasons.some(r => r.severity === "critical") ? "critical" : "warning") : "healthy",
        reasons: degradationReasons,
        timestamp: new Date().toISOString(),
      };
    }),

  // Worker health summary
  workerHealth: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.user!.role);
      const { getHealthReport } = await import("../services/healthcheck");
      const report = await getHealthReport();
      
      return {
        status: report.workerQueue.status,
        details: report.workerQueue.details ?? {},
        timestamp: new Date().toISOString(),
      };
    }),

  // Database health with latency
  databaseHealth: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.user!.role);
      const { checkDatabase } = await import("../services/healthcheck");
      const dbHealth = await checkDatabase();
      
      return {
        status: dbHealth.status,
        latencyMs: dbHealth.latencyMs,
        message: dbHealth.message,
        timestamp: new Date().toISOString(),
      };
    }),

  // Provider health summary
  providerHealth: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.user!.role);
      const { getHealthReport } = await import("../services/healthcheck");
      const report = await getHealthReport();

      const providerStatuses = Object.entries(report.providers)
        .map(([key, health]) => ({
          provider: key,
          status: health.status,
          message: health.message,
        }));

      const enabledProviders = providerStatuses.filter(p => p.status !== "disabled");
      const healthyProviders = enabledProviders.filter(p => p.status === "configured" || p.status === "healthy");

      return {
        totalProviders: providerStatuses.length,
        enabledCount: enabledProviders.length,
        healthyCount: healthyProviders.length,
        providers: providerStatuses,
        timestamp: new Date().toISOString(),
      };
    }),

  // Queue health
  queueHealth: protectedProcedure
    .input(z.object({}))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.user!.role);
      const { getQueueStats } = await import("../services/jobQueue");
      const stats = await getQueueStats();

      return {
        queued: stats.queuedCount,
        running: stats.runningCount,
        retries: stats.retryCount,
        deadLetters: stats.deadLetterCount,
        staleRunning: stats.staleRunningCount,
        oldestQueuedAgeMs: stats.oldestQueuedAgeMs,
        oldestRetryAgeMs: stats.oldestRetryAgeMs,
        status: stats.deadLetterCount > 0 || stats.staleRunningCount > 0 ? "degraded" : "healthy",
        timestamp: stats.generatedAt,
      };
    }),
});
