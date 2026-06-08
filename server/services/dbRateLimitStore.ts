/**
 * dbRateLimitStore.ts
 *
 * DB-backed rate limit store for horizontally-durable rate limiting.
 * Uses MySQL `INSERT ... ON DUPLICATE KEY UPDATE` with atomic counter
 * increment so multiple instances share the same rate limit state.
 *
 * Activate by setting: API_RATE_LIMIT_BACKEND=database
 *
 * Design notes:
 *   - Uses the `rate_limit_buckets` table (migration 0078).
 *   - Atomic increment via `count = count + 1` prevents race conditions.
 *   - Expired buckets are pruned lazily on hit (no background job needed).
 *   - Falls back to fail-open (allow) if DB is unavailable, logging a warning.
 *     This is intentional: a DB outage should not block all traffic.
 */
import { sql, lt } from "drizzle-orm";
import { rateLimitBuckets } from "../../drizzle/schema";
import { getDb } from "../db";
import type {
  RateLimitPolicy,
  RateLimitHit,
  RateLimitStore,
} from "./rateLimitService";
import pino from "pino";

const logger = pino({ name: "db-rate-limit" });

export class DatabaseRateLimitStore implements RateLimitStore {
  /**
   * Atomically increment the counter for the given key and return the result.
   * The window resets when `resetAt` is in the past.
   */
  async hit(
    key: string,
    policy: RateLimitPolicy,
    now = Date.now()
  ): Promise<RateLimitHit> {
    const db = await getDb();
    if (!db) {
      // DB unavailable — fail-open with a warning
      logger.warn({ key }, "db_rate_limit.db_unavailable.fail_open");
      return {
        allowed: true,
        limited: false,
        key,
        count: 0,
        max: policy.max,
        remaining: policy.max,
        resetAt: new Date(now + policy.windowMs),
        retryAfterMs: 0,
        backend: "database",
      };
    }

    const newResetAt = now + policy.windowMs;

    try {
      // Prune expired rows for this key first (lazy cleanup)
      await db
        .delete(rateLimitBuckets)
        .where(lt(rateLimitBuckets.resetAt, now));

      // Upsert: insert new bucket or atomically increment existing one
      await db
        .insert(rateLimitBuckets)
        .values({
          bucketKey: key,
          count: 1,
          resetAt: newResetAt,
          blockedUntil: null,
        })
        .onDuplicateKeyUpdate({
          set: {
            // Only increment if the window is still active; otherwise reset
            count: sql`IF(${rateLimitBuckets.resetAt} > ${now}, ${rateLimitBuckets.count} + 1, 1)`,
            resetAt: sql`IF(${rateLimitBuckets.resetAt} > ${now}, ${rateLimitBuckets.resetAt}, ${newResetAt})`,
          },
        });

      // Fetch the current state
      const [row] = await db
        .select()
        .from(rateLimitBuckets)
        .where(sql`${rateLimitBuckets.bucketKey} = ${key}`)
        .limit(1);

      if (!row) {
        // Should not happen — just inserted
        return this.allowResult(key, policy, now);
      }

      const blockedUntil = row.blockedUntil ?? 0;
      const isBlocked = blockedUntil > now;
      const overLimit = isBlocked || row.count > policy.max;

      // Apply blockMs if configured and over limit
      if (overLimit && policy.blockMs && !isBlocked) {
        const newBlockedUntil = now + policy.blockMs;
        await db
          .update(rateLimitBuckets)
          .set({ blockedUntil: newBlockedUntil })
          .where(sql`${rateLimitBuckets.bucketKey} = ${key}`);
        const retryUntil = newBlockedUntil;
        return this.buildResult(
          key,
          policy,
          row.count,
          row.resetAt,
          retryUntil,
          overLimit
        );
      }

      const retryUntil = isBlocked ? blockedUntil : row.resetAt;
      return this.buildResult(
        key,
        policy,
        row.count,
        row.resetAt,
        retryUntil,
        overLimit
      );
    } catch (err) {
      logger.warn({ err, key }, "db_rate_limit.error.fail_open");
      return this.allowResult(key, policy, now);
    }
  }

  reset(key?: string): void {
    // Fire-and-forget async reset (sync interface required by RateLimitStore)
    getDb()
      .then(db => {
        if (!db) return;
        if (key) {
          db.delete(rateLimitBuckets)
            .where(sql`${rateLimitBuckets.bucketKey} = ${key}`)
            .catch((err: unknown) =>
              logger.warn({ err, key }, "db_rate_limit.reset_error")
            );
        } else {
          db.delete(rateLimitBuckets).catch((err: unknown) =>
            logger.warn({ err }, "db_rate_limit.reset_all_error")
          );
        }
      })
      .catch((err: unknown) =>
        logger.warn({ err }, "db_rate_limit.reset_db_error")
      );
  }

  size(): number {
    // Cannot return synchronously from DB; return 0 as sentinel
    return 0;
  }

  private allowResult(
    key: string,
    policy: RateLimitPolicy,
    now: number
  ): RateLimitHit {
    return {
      allowed: true,
      limited: false,
      key,
      count: 0,
      max: policy.max,
      remaining: policy.max,
      resetAt: new Date(now + policy.windowMs),
      retryAfterMs: 0,
      backend: "database",
    };
  }

  private buildResult(
    key: string,
    policy: RateLimitPolicy,
    count: number,
    resetAt: number,
    retryUntil: number,
    overLimit: boolean
  ): RateLimitHit {
    return {
      allowed: !overLimit,
      limited: overLimit,
      key,
      count,
      max: policy.max,
      remaining: Math.max(0, policy.max - count),
      resetAt: new Date(resetAt),
      retryAfterMs: overLimit ? Math.max(0, retryUntil - Date.now()) : 0,
      backend: "database",
    };
  }
}

export const dbRateLimitStore = new DatabaseRateLimitStore();
