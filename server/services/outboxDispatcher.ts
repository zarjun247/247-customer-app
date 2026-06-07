import pino from "pino";
import { and, eq, lt, lte } from "drizzle-orm";
import { getDb } from "../db";
import { commandOutbox } from "../../drizzle/schema";
import { readFlag } from "./emergencyStopService";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

export type SideEffectHandler = (
  payload: unknown,
  meta: { commandLogId: string; attempts: number }
) => Promise<void>;

// ─── Handler registry ──────────────────────────────────────────────────────────

const handlers: Map<string, SideEffectHandler> = new Map();

/**
 * Registers a side-effect handler for the given outbox command kind.
 *
 * @param kind - The `commandOutbox.kind` value this handler processes
 * @param handler - Async function invoked per outbox row; must be idempotent
 * @throws Error if a handler for this kind is already registered
 */
export function registerOutboxHandler(
  kind: string,
  handler: SideEffectHandler
): void {
  if (handlers.has(kind)) {
    throw new Error(`Outbox handler for kind "${kind}" already registered`);
  }
  handlers.set(kind, handler);
}

export function unregisterAllHandlers(): void {
  handlers.clear();
}

export function getRegisteredKinds(): string[] {
  return Array.from(handlers.keys());
}

// ─── Polling worker ───────────────────────────────────────────────────────────

let pollingTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

// ─── Health state ─────────────────────────────────────────────────────────────
let _lastPollAt: Date | null = null;
let _lastPollSucceeded: boolean | null = null;
let _lastPollError: string | null = null;
let _consecutiveFailures = 0;
let _totalPolls = 0;
let _startedAt: Date | null = null;

export type OutboxDispatcherHealth = {
  running: boolean;
  startedAt: Date | null;
  lastPollAt: Date | null;
  lastPollSucceeded: boolean | null;
  lastPollError: string | null;
  consecutiveFailures: number;
  totalPolls: number;
};

export function getOutboxDispatcherHealth(): OutboxDispatcherHealth {
  return {
    running: pollingTimer !== null,
    startedAt: _startedAt,
    lastPollAt: _lastPollAt,
    lastPollSucceeded: _lastPollSucceeded,
    lastPollError: _lastPollError,
    consecutiveFailures: _consecutiveFailures,
    totalPolls: _totalPolls,
  };
}

/**
 * Starts the outbox polling loop.
 * P0-4 fix: The OUTBOX_DISPATCH_ENABLED guard has been moved to env.ts which
 * now defaults to true in production. The caller (index.ts) is responsible for
 * checking ENV.outboxDispatchEnabled before calling this function.
 * Interval controlled by OUTBOX_POLL_INTERVAL_MS (default 5000 ms).
 */
export function startOutboxDispatcher(): void {
  if (pollingTimer) {
    logger.warn("Outbox dispatcher already running");
    return;
  }
  const intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? "5000");
  _startedAt = new Date();
  pollingTimer = setInterval(() => {
    void pollOnce()
      .then(result => {
        _lastPollAt = new Date();
        _totalPolls++;
        if (result.failed > 0) {
          _consecutiveFailures++;
          _lastPollSucceeded = false;
          _lastPollError = `${result.failed} outbox rows failed in last poll`;
          if (_consecutiveFailures >= 5) {
            logger.error(
              { consecutiveFailures: _consecutiveFailures, ...result },
              "Outbox dispatcher: repeated consecutive failures — check dead-letter queue"
            );
          }
        } else {
          _consecutiveFailures = 0;
          _lastPollSucceeded = true;
          _lastPollError = null;
        }
      })
      .catch((err: unknown) => {
        _lastPollAt = new Date();
        _totalPolls++;
        _consecutiveFailures++;
        _lastPollSucceeded = false;
        _lastPollError = err instanceof Error ? err.message : String(err);
        logger.error(
          { err, consecutiveFailures: _consecutiveFailures },
          "Outbox dispatcher poll error"
        );
      });
  }, intervalMs);
  logger.info({ intervalMs }, "Outbox dispatcher started");
}

/** Stops the outbox polling loop. Safe to call even if the dispatcher is not running. */
export function stopOutboxDispatcher(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    logger.info("Outbox dispatcher stopped");
  }
}

export function isOutboxDispatcherRunning(): boolean {
  return pollingTimer !== null;
}

/**
 * Processes one batch of pending outbox rows. Safe to call from tests or a
 * one-shot worker invocation. Skips if a poll is already in progress or if
 * the emergency stop flag is active.
 *
 * @returns Counts of processed, succeeded, and failed rows
 */
export async function pollOnce(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  if (isPolling) {
    return { processed: 0, succeeded: 0, failed: 0 };
  }
  const stopFlag = await readFlag();
  if (stopFlag.active) {
    logger.warn(
      { reason: stopFlag.reason },
      "outboxDispatcher: skipping tick — emergency stop active"
    );
    return { processed: 0, succeeded: 0, failed: 0 };
  }
  isPolling = true;
  try {
    const db = await getDb();
    if (!db) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const batchSize = Number(process.env.OUTBOX_BATCH_SIZE ?? "20");
    const now = new Date();

    const pending = await db
      .select()
      .from(commandOutbox)
      .where(
        and(
          eq(commandOutbox.state, "pending"),
          lte(commandOutbox.nextAttemptAt, now),
          lt(commandOutbox.attempts, commandOutbox.maxAttempts)
        )
      )
      .limit(batchSize);

    let succeeded = 0;
    let failed = 0;

    for (const row of pending) {
      const handler = handlers.get(row.sideEffectKind);
      if (!handler) {
        logger.warn(
          { kind: row.sideEffectKind, id: row.id },
          "No handler registered for side effect kind; skipping"
        );
        continue;
      }

      const attemptNum = row.attempts + 1;
      try {
        await handler(row.sideEffectPayload, {
          commandLogId: row.commandLogId,
          attempts: attemptNum,
        });
        await db
          .update(commandOutbox)
          .set({
            state: "dispatched",
            attempts: attemptNum,
            dispatchedAt: new Date(),
          })
          .where(eq(commandOutbox.id, row.id));
        succeeded++;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const backoffMs = Math.min(60_000, 1_000 * Math.pow(2, attemptNum));
        const nextAttempt = new Date(Date.now() + backoffMs);

        if (attemptNum >= row.maxAttempts) {
          await db
            .update(commandOutbox)
            .set({
              state: "failed",
              attempts: attemptNum,
              failedAt: new Date(),
              lastErrorMessage: errorMessage,
            })
            .where(eq(commandOutbox.id, row.id));
        } else {
          await db
            .update(commandOutbox)
            .set({
              attempts: attemptNum,
              nextAttemptAt: nextAttempt,
              lastErrorMessage: errorMessage,
            })
            .where(eq(commandOutbox.id, row.id));
        }
        failed++;
      }
    }

    return { processed: pending.length, succeeded, failed };
  } finally {
    isPolling = false;
  }
}
