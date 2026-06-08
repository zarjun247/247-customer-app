import { eq, lt } from "drizzle-orm";
import { randomUUID } from "crypto";
import pino from "pino";
import { getDb } from "../db";
import { stockLockKeys } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import {
  recordWorkerSuccess,
  recordWorkerFailure,
} from "./workerHealthRegistry";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

export type StockLock = {
  lockKey: string;
  acquiredBy: string;
  acquiredAt: Date;
  expiresAt: Date;
};

export class LockAcquisitionFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockAcquisitionFailedError";
  }
}

export class LockExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockExpiredError";
  }
}

const POLL_INTERVAL_MS = 100;

export async function acquireLock(
  lockKey: string,
  timeoutMs?: number
): Promise<StockLock> {
  const db = await getDb();
  if (!db)
    throw new LockAcquisitionFailedError("DB unavailable; cannot acquire lock");

  const ttlMs = timeoutMs ?? ENV.stockLockTimeoutMs;
  const deadline = Date.now() + ttlMs;
  const acquiredBy = randomUUID();
  const lockDurationMs = ttlMs + 10_000;

  while (Date.now() < deadline) {
    const acquiredAt = new Date();
    const expiresAt = new Date(acquiredAt.getTime() + lockDurationMs);

    try {
      await db.insert(stockLockKeys).values({
        lockKey,
        acquiredBy,
        acquiredAt,
        expiresAt,
      });

      logger.debug({ lockKey, acquiredBy }, "Lock acquired");
      return { lockKey, acquiredBy, acquiredAt, expiresAt };
    } catch {
      // Row exists — check if the existing lock is expired
      const existing = await db
        .select()
        .from(stockLockKeys)
        .where(eq(stockLockKeys.lockKey, lockKey))
        .limit(1);

      if (existing.length > 0 && existing[0].expiresAt < new Date()) {
        // Stale lock: delete and retry immediately
        await db
          .delete(stockLockKeys)
          .where(eq(stockLockKeys.lockKey, lockKey));
        continue;
      }

      // Live lock held by another caller — wait and poll
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  throw new LockAcquisitionFailedError(
    `Failed to acquire lock "${lockKey}" within ${ttlMs}ms`
  );
}

export async function releaseLock(
  lockKey: string,
  acquiredBy: string
): Promise<void> {
  const db = await getDb();
  if (!db) {
    logger.warn({ lockKey }, "DB unavailable; cannot release lock (non-fatal)");
    return;
  }

  await db.delete(stockLockKeys).where(eq(stockLockKeys.lockKey, lockKey));

  logger.debug({ lockKey, acquiredBy }, "Lock released");
}

export async function withLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  timeoutMs?: number
): Promise<T> {
  const lock = await acquireLock(lockKey, timeoutMs);
  try {
    return await fn();
  } finally {
    await releaseLock(lock.lockKey, lock.acquiredBy).catch((err: unknown) => {
      logger.warn(
        { err, lockKey },
        "Failed to release lock on cleanup (non-fatal)"
      );
    });
  }
}

export async function cleanupExpiredLocks(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const result: unknown = await db
    .delete(stockLockKeys)
    .where(lt(stockLockKeys.expiresAt, new Date()));
  const row: unknown = Array.isArray(result) ? result[0] : result;
  return (row as { affectedRows?: number }).affectedRows ?? 0;
}

let stockLockTimer: ReturnType<typeof setInterval> | null = null;

export function startStockLockCleanup(): void {
  if (stockLockTimer) return;
  const intervalMs = ENV.stockLockCleanupIntervalMs;
  stockLockTimer = setInterval(() => {
    cleanupExpiredLocks()
      .then(() => recordWorkerSuccess("stockLockCleanup"))
      .catch((err: unknown) => {
        logger.error({ err }, "stockLockCleanup tick failed");
        recordWorkerFailure("stockLockCleanup", err);
      });
  }, intervalMs);
  logger.info({ intervalMs }, "stockLockCleanup started");
}

export function stopStockLockCleanup(): void {
  if (stockLockTimer) {
    clearInterval(stockLockTimer);
    stockLockTimer = null;
    logger.info("stockLockCleanup stopped");
  }
}

export function isStockLockCleanupRunning(): boolean {
  return stockLockTimer !== null;
}

export function makeLockKey(
  storeId: number,
  productId: number,
  variantId?: number | null
): string {
  return variantId != null
    ? `stock:${storeId}:${productId}:${variantId}`
    : `stock:${storeId}:${productId}`;
}
