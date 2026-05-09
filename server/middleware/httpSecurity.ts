import type { RequestHandler } from "express";
import express from "express";
import helmet from "helmet";
import { isSafeRequestId } from "../services/observability";
import { requestIdMiddleware, requestLoggerMiddleware, requestErrorLoggerMiddleware, buildRequestLogEntry } from "./requestLogger";

export const NORMAL_JSON_LIMIT = "1mb";
export const NORMAL_URLENCODED_LIMIT = "256kb";
export const RAW_WEBHOOK_LIMIT = "2mb";
export const PRESCRIPTION_UPLOAD_LIMIT = "12mb";



export type RateLimitPolicy = {
  id: string;
  routes: string[];
  productionBackendRequired: boolean;
  notes: string;
};

export const rateLimitScaffold: RateLimitPolicy[] = [
  { id: "auth-otp", routes: ["auth.sendOtp", "auth.verifyOtp", "/api/auth", "/api/otp"], productionBackendRequired: true, notes: "OTP send/verify must use OTP_RATE_LIMIT_BACKEND in production; existing OTP guard fails closed for provider-backed OTP." },
  { id: "login-auth", routes: ["auth.verifyOtp", "/api/login", "/api/oauth"], productionBackendRequired: true, notes: "Login/auth attempts require a shared backend before multi-instance production." },
  { id: "prescription-upload", routes: ["prescription.create", "prescription.upload", "/api/storage", "/api/uploads"], productionBackendRequired: true, notes: "Upload pressure must be limited per user/IP and paired with route-specific body limits." },
  { id: "checkout-cart-mutation", routes: ["cart.", "checkout.", "order.create"], productionBackendRequired: true, notes: "Cart/checkout mutations need per-user/IP throttles to protect stock reservation boundaries." },
  { id: "public-product-search", routes: ["catalog.list", "/api/search"], productionBackendRequired: true, notes: "Search endpoints need abuse controls without changing catalog business rules." },
  { id: "webhook-provider", routes: ["/api/webhooks/razorpay", "/api/webhooks/whatsapp"], productionBackendRequired: false, notes: "Provider webhooks should prefer signature verification and provider retry semantics over blunt blocking." },
];

const DEFAULT_DEV_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
]);

export function parseOriginAllowlist(env: NodeJS.ProcessEnv = process.env, isProduction = env.NODE_ENV === "production"): Set<string> {
  const configured = [env.CORS_ALLOWED_ORIGINS, env.APP_ORIGIN, env.ADMIN_ORIGIN]
    .filter(Boolean)
    .flatMap(value => String(value).split(","))
    .map(value => value.trim())
    .filter(Boolean)
    .filter(value => value !== "*");

  const origins = new Set(configured);
  if (!isProduction) {
    Array.from(DEFAULT_DEV_ORIGINS).forEach(origin => origins.add(origin));
  }
  return origins;
}

export function corsAllowlistMiddleware(env: NodeJS.ProcessEnv = process.env): RequestHandler {
  const isProduction = env.NODE_ENV === "production";
  const allowlist = parseOriginAllowlist(env, isProduction);

  return (req, res, next) => {
    const origin = req.header("origin");
    const isAllowed = origin ? allowlist.has(origin) : false;

    res.setHeader("Vary", [res.getHeader("Vary"), "Origin"].filter(Boolean).join(", "));
    if (origin && isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id, X-Cron-Secret");
      res.setHeader("Access-Control-Max-Age", isProduction ? "600" : "60");
    }

    if (req.method === "OPTIONS") {
      res.status(origin && isAllowed ? 204 : 403).end();
      return;
    }

    next();
  };
}

export function securityHeadersMiddleware(): RequestHandler {
  return helmet({
    // The app serves Vite/dev assets and may embed runtime-generated media URLs. Keep CSP in report/design mode until asset origins are inventoried.
    contentSecurityPolicy: false,
    // COEP can break Vite HMR and cross-origin embedded assets; keep disabled pending an asset isolation pass.
    crossOriginEmbedderPolicy: false,
  });
}

export const accessLogMiddleware = requestLoggerMiddleware;
export const errorAccessLogMiddleware = requestErrorLoggerMiddleware;
export const buildAccessLogEntry = buildRequestLogEntry;
export { isSafeRequestId, requestIdMiddleware };

type MiddlewareRegistrar = { use: (...args: any[]) => unknown };

export function registerRawWebhookParsers(app: MiddlewareRegistrar) {
  app.use("/api/webhooks/razorpay", express.raw({ type: "application/json", limit: RAW_WEBHOOK_LIMIT }));
  app.use("/api/webhooks/whatsapp", express.raw({ type: "application/json", limit: RAW_WEBHOOK_LIMIT }));
}

export function normalJsonParser(): RequestHandler {
  return express.json({ limit: NORMAL_JSON_LIMIT });
}

export function normalUrlencodedParser(): RequestHandler {
  return express.urlencoded({ limit: NORMAL_URLENCODED_LIMIT, extended: true });
}

export function uploadJsonParser(): RequestHandler {
  return express.json({ limit: PRESCRIPTION_UPLOAD_LIMIT });
}

export function applyHttpSecurity(app: MiddlewareRegistrar, env: NodeJS.ProcessEnv = process.env) {
  app.use(requestIdMiddleware());
  app.use(securityHeadersMiddleware());
  app.use(corsAllowlistMiddleware(env));
  app.use(accessLogMiddleware());
  registerRawWebhookParsers(app);
  app.use(["/api/storage", "/api/uploads"], uploadJsonParser());
  app.use(normalJsonParser());
  app.use(normalUrlencodedParser());
}
