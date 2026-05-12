export type RateLimitBackend = "memory" | "database" | "redis";

export interface RateLimitPolicy {
  windowMs: number;
  max: number;
  blockMs?: number;
}

export interface RateLimitHit {
  allowed: boolean;
  limited: boolean;
  key: string;
  count: number;
  max: number;
  remaining: number;
  resetAt: Date;
  retryAfterMs: number;
  backend: RateLimitBackend;
}

interface Bucket {
  count: number;
  resetAt: number;
  blockedUntil?: number;
  lastSeen: number;
}

export interface RateLimitStore {
  hit(key: string, policy: RateLimitPolicy, now?: number): RateLimitHit;
  reset(key?: string): void;
  size(): number;
}

const DEFAULT_MAX_BUCKETS = 25_000;

export class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly maxBuckets = DEFAULT_MAX_BUCKETS) {}

  hit(key: string, policy: RateLimitPolicy, now = Date.now()): RateLimitHit {
    this.prune(now);
    const existing = this.buckets.get(key);
    const active = existing && existing.resetAt > now ? existing : undefined;
    const blockedUntil =
      active?.blockedUntil && active.blockedUntil > now
        ? active.blockedUntil
        : undefined;
    const next: Bucket = active ?? {
      count: 0,
      resetAt: now + policy.windowMs,
      lastSeen: now,
    };
    next.count += 1;
    next.lastSeen = now;

    const overLimit = Boolean(blockedUntil) || next.count > policy.max;
    if (overLimit && policy.blockMs) {
      next.blockedUntil = Math.max(blockedUntil ?? 0, now + policy.blockMs);
    }
    this.buckets.set(key, next);
    this.evictIfNeeded();

    const retryUntil =
      next.blockedUntil && next.blockedUntil > now
        ? next.blockedUntil
        : next.resetAt;
    return {
      allowed: !overLimit,
      limited: overLimit,
      key,
      count: next.count,
      max: policy.max,
      remaining: Math.max(0, policy.max - next.count),
      resetAt: new Date(next.resetAt),
      retryAfterMs: overLimit ? Math.max(0, retryUntil - now) : 0,
      backend: "memory",
    };
  }

  reset(key?: string): void {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }

  size(): number {
    return this.buckets.size;
  }

  private prune(now: number): void {
    for (const [key, bucket] of Array.from(this.buckets.entries())) {
      const blocked = bucket.blockedUntil && bucket.blockedUntil > now;
      if (!blocked && bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  private evictIfNeeded(): void {
    if (this.buckets.size <= this.maxBuckets) return;
    const overflow = this.buckets.size - this.maxBuckets;
    const victims = Array.from(this.buckets.entries())
      .sort((a, b) => a[1].lastSeen - b[1].lastSeen)
      .slice(0, overflow);
    for (const [key] of victims) this.buckets.delete(key);
  }
}

export function normalizeKeyPart(value: unknown): string {
  if (value === undefined || value === null || value === "") return "anon";
  let s: string;
  if (typeof value === "object" && value !== null) {
    s = JSON.stringify(value);
  } else {
    const prim = value as string | number | boolean | bigint;
    s = String(prim);
  }
  return s.trim().toLowerCase().replace(/\s+/g, "_").slice(0, 160);
}

export function buildRateLimitKey(parts: Record<string, unknown>): string {
  return Object.entries(parts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, value]) => `${normalizeKeyPart(key)}=${normalizeKeyPart(value)}`
    )
    .join("|");
}

export const defaultRateLimitStore = new MemoryRateLimitStore();

export function getProductionRateLimitPosture(
  env: NodeJS.ProcessEnv = process.env
) {
  const nodeEnv = env.NODE_ENV ?? "development";
  const backend = (
    env.API_RATE_LIMIT_BACKEND ??
    env.OTP_RATE_LIMIT_BACKEND ??
    ""
  ).trim();
  const durable = backend === "database" || backend === "redis";
  const singleInstanceMemory = backend === "memory_allowed_for_single_instance";
  return {
    nodeEnv,
    backend: backend || "memory",
    productionReady:
      nodeEnv !== "production" || durable || singleInstanceMemory,
    durable,
    limitation:
      nodeEnv === "production" && !durable
        ? "Production abuse protection is not horizontally durable without API_RATE_LIMIT_BACKEND=redis/database or explicit memory_allowed_for_single_instance acceptance."
        : null,
  } as const;
}
