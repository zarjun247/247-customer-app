/**
 * WorkerHealthRegistry
 *
 * Centralised health tracking for all background workers.
 * Each worker calls recordSuccess() or recordFailure() after each run.
 * The healthcheck endpoint reads getWorkerHealth() to surface per-worker
 * last-run time, consecutive failure count, and overall status.
 *
 * Design: mirrors the OutboxDispatcherHealth pattern already used for the
 * outbox dispatcher, extended to cover all remaining workers.
 */

import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkerName =
  | "reservationExpiryWorker"
  | "retentionWorker"
  | "dsrSlaMonitor"
  | "stockLockCleanup"
  | "queueWorker";

export type WorkerHealthEntry = {
  /** Whether the worker is currently registered (has run at least once) */
  registered: boolean;
  /** Timestamp of the most recent successful run */
  lastSuccessAt: Date | null;
  /** Timestamp of the most recent run (success or failure) */
  lastRunAt: Date | null;
  /** Number of consecutive failures since the last success */
  consecutiveFailures: number;
  /** Total number of runs recorded */
  totalRuns: number;
  /** Last error message, if the most recent run failed */
  lastError: string | null;
};

export type WorkerHealthSnapshot = Record<WorkerName, WorkerHealthEntry>;

// ─── Registry State ───────────────────────────────────────────────────────────

const CONSECUTIVE_FAILURE_ALERT_THRESHOLD = 3;

const _state: Map<WorkerName, WorkerHealthEntry> = new Map();

function _getOrInit(name: WorkerName): WorkerHealthEntry {
  if (!_state.has(name)) {
    _state.set(name, {
      registered: false,
      lastSuccessAt: null,
      lastRunAt: null,
      consecutiveFailures: 0,
      totalRuns: 0,
      lastError: null,
    });
  }
  return _state.get(name)!;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a successful worker run.
 */
export function recordWorkerSuccess(name: WorkerName): void {
  const entry = _getOrInit(name);
  const now = new Date();
  entry.registered = true;
  entry.lastRunAt = now;
  entry.lastSuccessAt = now;
  entry.consecutiveFailures = 0;
  entry.totalRuns++;
  entry.lastError = null;
}

/**
 * Record a failed worker run.
 * Logs a warning when consecutive failures exceed the alert threshold.
 */
export function recordWorkerFailure(name: WorkerName, error: unknown): void {
  const entry = _getOrInit(name);
  const errorMessage = error instanceof Error ? error.message : String(error);
  entry.registered = true;
  entry.lastRunAt = new Date();
  entry.consecutiveFailures++;
  entry.totalRuns++;
  entry.lastError = errorMessage;

  if (entry.consecutiveFailures >= CONSECUTIVE_FAILURE_ALERT_THRESHOLD) {
    logger.warn(
      {
        worker: name,
        consecutiveFailures: entry.consecutiveFailures,
        lastError: errorMessage,
      },
      `Worker ${name}: ${entry.consecutiveFailures} consecutive failures — check worker logs`
    );
  }
}

/**
 * Returns a snapshot of health for all registered workers.
 * Workers that have never run appear with registered: false.
 */
export function getWorkerHealthSnapshot(): WorkerHealthSnapshot {
  const allNames: WorkerName[] = [
    "reservationExpiryWorker",
    "retentionWorker",
    "dsrSlaMonitor",
    "stockLockCleanup",
    "queueWorker",
  ];
  const snapshot = {} as WorkerHealthSnapshot;
  for (const name of allNames) {
    snapshot[name] = { ..._getOrInit(name) };
  }
  return snapshot;
}

/**
 * Returns true if any registered worker has consecutiveFailures >= threshold.
 */
export function hasWorkerHealthAlerts(): boolean {
  for (const entry of Array.from(_state.values())) {
    if (entry.consecutiveFailures >= CONSECUTIVE_FAILURE_ALERT_THRESHOLD)
      return true;
  }
  return false;
}
