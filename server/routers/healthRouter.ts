import type { Express, Request, RequestHandler, Response } from "express";
import { ADMIN_ROLES, STAFF_ROLES, type UserRole } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import {
  getHealthReport,
  publicLiveness,
  publicReadiness,
} from "../services/healthcheck";
import { safeError } from "../services/observability";

function isStaffOrAdmin(role: unknown): role is UserRole {
  return (
    typeof role === "string" &&
    [...STAFF_ROLES, ...ADMIN_ROLES].includes(role as UserRole)
  );
}

export const requireStaff: RequestHandler = (req, res, next) => {
  sdk
    .authenticateRequest(req)
    .then(user => {
      if (!isStaffOrAdmin(user.role)) throw new Error("staff_access_required");
      next();
    })
    .catch(error => {
      const isProduction = process.env.NODE_ENV === "production";
      res.status(isProduction ? 404 : 403).json({
        status: "forbidden",
        requestId: (res.locals as Record<string, string | undefined>).requestId,
        error: safeError(error).message,
      });
    });
};

function livenessHandler(_req: Request, res: Response) {
  res.status(200).json(publicLiveness());
}

async function readinessHandler(_req: Request, res: Response) {
  const readiness = await publicReadiness();
  res.status(readiness.status === "ready" ? 200 : 503).json(readiness);
}

async function detailedHealthHandler(_req: Request, res: Response) {
  const report = await getHealthReport();
  res.status(report.status === "unhealthy" ? 503 : 200).json(report);
}

export function registerHealthRoutes(app: Express): void {
  app.get("/healthz", livenessHandler);
  app.get("/api/healthz", livenessHandler);
  app.get("/readyz", (req, res, next) => {
    readinessHandler(req, res).catch(next);
  });
  app.get("/api/readyz", (req, res, next) => {
    readinessHandler(req, res).catch(next);
  });
  app.get("/api/health", requireStaff, (req, res, next) => {
    detailedHealthHandler(req, res).catch(next);
  });
  app.get("/api/admin/health", requireStaff, (req, res, next) => {
    detailedHealthHandler(req, res).catch(next);
  });
}

export const healthRouteHandlers = {
  livenessHandler,
  readinessHandler,
  detailedHealthHandler,
};
