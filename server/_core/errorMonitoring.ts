/**
 * server/_core/errorMonitoring.ts
 *
 * Sentry error monitoring integration.
 *
 * When SENTRY_DSN is set, Sentry is initialized and all unhandled errors
 * are captured. When SENTRY_DSN is not set (local dev / pre-credentials),
 * all calls are no-ops and a warning is logged at startup.
 *
 * Usage:
 *   import { initErrorMonitoring, captureException, captureMessage } from "./_core/errorMonitoring";
 *   initErrorMonitoring(); // call once at startup, before express()
 *   captureException(err); // anywhere in the app
 *
 * Required env vars:
 *   SENTRY_DSN         — Sentry project DSN (required for production monitoring)
 *   SENTRY_ENVIRONMENT — environment tag (defaults to NODE_ENV)
 *   SENTRY_RELEASE     — release tag (defaults to GIT_SHA or npm_package_version)
 *
 * To enable Sentry, install @sentry/node:
 *   pnpm add @sentry/node
 * Then replace the stub below with the real Sentry SDK calls.
 */

let sentryInitialized = false;

export interface ErrorMonitoringContext {
  userId?: string | number;
  orderId?: string | number;
  requestId?: string;
  [key: string]: unknown;
}

/**
 * Initialize error monitoring. Must be called before any other module.
 * Safe to call multiple times (idempotent).
 */
export function initErrorMonitoring(): void {
  if (sentryInitialized) return;
  sentryInitialized = true;

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[ErrorMonitoring] SENTRY_DSN not set — error monitoring disabled in production. " +
          "Set SENTRY_DSN to enable Sentry error capture."
      );
    }
    return;
  }

  // ─── Sentry SDK integration (activate when @sentry/node is installed) ──────
  // Uncomment the following block after running: pnpm add @sentry/node
  //
  // import * as Sentry from "@sentry/node";
  // Sentry.init({
  //   dsn,
  //   environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? "production",
  //   release:
  //     process.env.SENTRY_RELEASE ??
  //     process.env.GIT_SHA ??
  //     process.env.npm_package_version ??
  //     "unknown",
  //   tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  //   integrations: [
  //     Sentry.httpIntegration(),
  //     Sentry.expressIntegration(),
  //   ],
  //   beforeSend(event) {
  //     // Redact PII from error events before sending to Sentry.
  //     return event;
  //   },
  // });
  // _sentryInstance = Sentry;
  // ─────────────────────────────────────────────────────────────────────────────

  console.info(
    `[ErrorMonitoring] Sentry DSN configured (${dsn.slice(0, 20)}...). ` +
      "Install @sentry/node and uncomment the Sentry.init() block to activate."
  );
}

/**
 * Capture an exception and send to Sentry (or log if Sentry not configured).
 */
export function captureException(
  err: unknown,
  context?: ErrorMonitoringContext
): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    // No Sentry — log to stderr so the error is not silently swallowed.
    console.error(
      "[ErrorMonitoring] Unhandled exception (Sentry not configured):",
      err,
      context ?? {}
    );
    return;
  }
  // Uncomment when @sentry/node is installed:
  // import * as Sentry from "@sentry/node";
  // Sentry.withScope(scope => {
  //   if (context?.userId) scope.setUser({ id: String(context.userId) });
  //   if (context?.requestId) scope.setTag("requestId", String(context.requestId));
  //   if (context?.orderId) scope.setTag("orderId", String(context.orderId));
  //   Sentry.captureException(err);
  // });
  console.error(
    "[ErrorMonitoring] Exception (Sentry stub):",
    err,
    context ?? {}
  );
}

/**
 * Capture a message (non-exception alert) and send to Sentry.
 */
export function captureMessage(
  message: string,
  level: "info" | "warning" | "error" = "info",
  context?: ErrorMonitoringContext
): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    console.warn(
      `[ErrorMonitoring] Message (${level}): ${message}`,
      context ?? {}
    );
    return;
  }
  // Uncomment when @sentry/node is installed:
  // Sentry.captureMessage(message, level);
  console.warn(
    `[ErrorMonitoring] Message stub (${level}): ${message}`,
    context ?? {}
  );
}

/**
 * Register process-level unhandled rejection and uncaught exception handlers.
 * Call once at startup, after initErrorMonitoring().
 */
export function registerProcessErrorHandlers(): void {
  process.on("unhandledRejection", (reason, promise) => {
    console.error("[Process] Unhandled promise rejection:", reason, promise);
    captureException(reason, { context: "unhandledRejection" });
  });

  process.on("uncaughtException", err => {
    console.error("[Process] Uncaught exception:", err);
    captureException(err, { context: "uncaughtException" });
    // Allow process to exit after capturing — uncaughtException is not recoverable.
    process.exit(1);
  });
}
