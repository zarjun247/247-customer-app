import { and, eq, lte } from "drizzle-orm";
import pino from "pino";
import { getDb } from "../db";
import { reservations } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { expire } from "./reservationLedger";
import type { CommandContext } from "./executeCommand";
import { readFlag } from "./emergencyStopService";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

let pollingTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

const SYSTEM_CONTEXT: CommandContext = {
  actorUserId: null,
  actorRole: "system",
  storeId: null,
  traceId: null,
};

/**
 * Starts the reservation expiry sweep on an interval controlled by
 * `ENV.reservationExpirySweepIntervalMs`. Idempotent — safe to call multiple times.
 */
export function startReservationExpiryWorker(): void {
  if (pollingTimer) return;
  const intervalMs = ENV.reservationExpirySweepIntervalMs;
  pollingTimer = setInterval(() => {
    void sweepOnce();
  }, intervalMs);
  logger.info({ intervalMs }, "Reservation expiry worker started");
}

/** Stops the sweep interval. Safe to call if the worker is not running. */
export function stopReservationExpiryWorker(): void {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

export function isReservationExpiryWorkerRunning(): boolean {
  return pollingTimer !== null;
}

/**
 * Expires all active reservations past their `expiresAt` timestamp in one batch.
 * Skips if an emergency stop is active or if a sweep is already in progress.
 *
 * @returns Counts of swept, succeeded, and failed reservation expirations
 */
export async function sweepOnce(): Promise<{
  swept: number;
  succeeded: number;
  failed: number;
}> {
  if (isPolling) return { swept: 0, succeeded: 0, failed: 0 };
  isPolling = true;
  try {
    const stopFlag = await readFlag();
    if (stopFlag.active) {
      logger.warn(
        { reason: stopFlag.reason },
        "reservationExpiryWorker: skipping tick — emergency stop active"
      );
      return { swept: 0, succeeded: 0, failed: 0 };
    }

    const db = await getDb();
    if (!db) return { swept: 0, succeeded: 0, failed: 0 };

    const now = new Date();
    const batchSize = ENV.reservationExpiryBatchSize;

    const expired = await db
      .select()
      .from(reservations)
      .where(
        and(eq(reservations.state, "active"), lte(reservations.expiresAt, now))
      )
      .limit(batchSize);

    let succeeded = 0;
    let failed = 0;

    for (const r of expired) {
      try {
        await expire(
          {
            reservationId: r.id,
            idempotencyKey: `expire:${r.id}:${r.expiresAt.toISOString()}`,
          },
          { ...SYSTEM_CONTEXT, storeId: String(r.storeId) }
        );
        succeeded++;
      } catch (err) {
        logger.warn(
          { err, reservationId: r.id },
          "Failed to expire reservation in sweep"
        );
        failed++;
      }
    }

    if (expired.length > 0) {
      logger.info(
        { swept: expired.length, succeeded, failed },
        "Reservation expiry sweep complete"
      );
    }

    return { swept: expired.length, succeeded, failed };
  } finally {
    isPolling = false;
  }
}
