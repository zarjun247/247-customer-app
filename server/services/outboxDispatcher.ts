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

export function startOutboxDispatcher(): void {
  const enabled =
    (process.env.OUTBOX_DISPATCH_ENABLED ?? "").toLowerCase() === "true";
  if (!enabled) {
    logger.info(
      "Outbox dispatcher disabled by OUTBOX_DISPATCH_ENABLED env flag"
    );
    return;
  }
  if (pollingTimer) {
    logger.warn("Outbox dispatcher already running");
    return;
  }
  const intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? "5000");
  pollingTimer = setInterval(() => {
    void pollOnce();
  }, intervalMs);
  logger.info({ intervalMs }, "Outbox dispatcher started");
}

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
