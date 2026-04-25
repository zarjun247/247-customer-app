import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import { processQueue } from "../worker";

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
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // ─── Health Check ──────────────────────────────────────────────────────────
  // GET /api/health — returns service status for load balancers and monitoring
  // TODO: Add Sentry/PagerDuty alert if dbConnected is false for >2 minutes
  app.get("/api/health", async (_req, res) => {
    let dbConnected = false;
    try {
      const db = await getDb();
      dbConnected = db !== null;
    } catch {
      dbConnected = false;
    }
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      dbConnected,
      version: "1.0.0",
      // TODO: Add Sentry DSN check, Redis ping, storage ping
    });
  });

  // ─── Worker Trigger (scheduled task endpoint) ──────────────────────────────
  // POST /api/worker/run — trigger OCR queue processing
  // Called by Manus scheduled tasks (uses app_session_id cookie for auth)
  app.post("/api/worker/run", async (_req, res) => {
    try {
      const processed = await processQueue();
      res.json({ success: true, processed });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ success: false, error: message });
    }
  });
  // tRPC API
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
  });
}

startServer().catch(console.error);
