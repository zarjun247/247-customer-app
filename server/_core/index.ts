import "dotenv/config";
import { initializeTelemetry } from "./telemetry";
import { assertIndiaRegionStorage } from "../services/regionAssertion";
import {
  startRetentionWorker,
  stopRetentionWorker,
} from "../services/retentionWorker";
import {
  startDsrSlaMonitor,
  stopDsrSlaMonitor,
} from "../services/dsrSlaMonitor";
import {
  startOutboxDispatcher,
  stopOutboxDispatcher,
} from "../services/outboxDispatcher";
import {
  startReservationExpiryWorker,
  stopReservationExpiryWorker,
} from "../services/reservationExpiryWorker";
import {
  startStockLockCleanup,
  stopStockLockCleanup,
} from "../services/stockLockService";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { processQueue } from "../worker";
import { ENV } from "./env";
import { redactSensitive } from "./redact";
import { applyHttpSecurity } from "../middleware/httpSecurity";
import { registerPaymentWebhookRoutes } from "../paymentWebhookRoutes";
import { registerHealthRoutes } from "../routers/healthRouter";
import { initObservability } from "./observability";
import { registerObservabilityRoutes } from "../routers/observabilityRouter";
import { createEmergencyStopMiddleware } from "./emergencyStopMiddleware";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // DPDP region assertion: opt-in via DPDP_REGION_REQUIRED env var.
  // Throws at boot if DPDP_REGION_REQUIRED is set and storage is not in the required region.
  await assertIndiaRegionStorage().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("FATAL: India region assertion failed:", msg);
    if (process.env.DPDP_REGION_REQUIRED) process.exit(1);
  });

  // OTel SDK must start before Express/HTTP prototypes are first accessed.
  // shimmer patches exported prototype methods (not the require cache), so
  // calling start() here — before express() and createServer() — is sufficient
  // for HTTP + Express auto-instrumentation. A separate bootstrap.ts with
  // dynamic import() would be required if DB-level (mysql2) instrumentation
  // is added in a later MP1 or MP6 PR; tracked in OPEN_BLOCKERS.md.
  const sdk = initializeTelemetry();

  const app = express();
  const server = createServer(app);
  initObservability(app);
  registerObservabilityRoutes(app);
  applyHttpSecurity(app);
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerPaymentWebhookRoutes(app);

  registerHealthRoutes(app);

  // ─── Worker Trigger (scheduled task endpoint) ──────────────────────────────
  // POST /api/worker/run — trigger OCR queue processing
  // Called by Manus scheduled tasks (uses app_session_id cookie for auth)
  app.post("/api/worker/run", (req, res) => {
    void (async () => {
      const cronSecret = req.header("x-cron-secret") ?? "";
      const bearer =
        req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const hasConfiguredAuth = Boolean(
        ENV.workerCronSecret || ENV.workerAdminToken
      );
      const isAuthed =
        (ENV.workerCronSecret && cronSecret === ENV.workerCronSecret) ||
        (ENV.workerAdminToken && bearer === ENV.workerAdminToken);

      if (ENV.isProduction && (!hasConfiguredAuth || !isAuthed)) {
        console.warn("worker.run_attempt denied", { ip: req.ip });
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }

      try {
        console.info("worker.run_started", { ip: req.ip });
        const processed = await processQueue();
        console.info("worker.run_completed", { processed });
        res.json({ success: true, processed });
      } catch (err) {
        console.error("worker.run_failed", redactSensitive(String(err)));
        res.status(500).json({ success: false, error: "Worker run failed" });
      }
    })();
  });
  // tRPC API — emergency stop blocks customer mutations; fails open if DB unreachable.
  const emergencyStop = createEmergencyStopMiddleware({ adminBypass: false });
  app.use("/api/trpc", (req, res, next) => {
    void emergencyStop(req, res, next);
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Start background workers after server is listening
    startRetentionWorker();
    startDsrSlaMonitor();
    if (ENV.outboxDispatchEnabled) startOutboxDispatcher();
    if (ENV.reservationExpiryWorkerEnabled) startReservationExpiryWorker();
    if (ENV.stockLockCleanupEnabled) startStockLockCleanup();
  });

  function shutdown() {
    stopRetentionWorker();
    stopDsrSlaMonitor();
    stopOutboxDispatcher();
    stopReservationExpiryWorker();
    stopStockLockCleanup();
    void sdk.shutdown().finally(() => process.exit(0));
  }
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch(console.error);
