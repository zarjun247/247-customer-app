import pino from "pino";
import { sql, gte, eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  providerWebhookEvents,
  providerDeadLetters,
} from "../../drizzle/schema";
import { emitSloEvent } from "./sloService";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const DAY_MS = 86_400_000;

export type ProviderStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export type ProviderHealthSnapshot = {
  providerId: string;
  providerType: string;
  status: ProviderStatus;
  successRate24h: number | null;
  totalEvents24h: number;
  deadLetterCount: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  /** Milliseconds since oldest unresolved dead letter was created, or null */
  oldestUnresolvedDeadLetterAge: number | null;
  healthScore: number;
};

function classifyStatus(
  successRate: number | null,
  totalEvents: number,
  deadLetterCount: number,
  oldestUnresolvedAgeMs: number | null
): ProviderStatus {
  if (totalEvents === 0) return "unknown";
  const rate = successRate ?? 0;
  if (
    rate < 0.95 ||
    deadLetterCount >= 6 ||
    (oldestUnresolvedAgeMs != null && oldestUnresolvedAgeMs > 3_600_000)
  ) {
    return "unhealthy";
  }
  if (rate < 0.99 || (deadLetterCount >= 1 && deadLetterCount <= 5)) {
    return "degraded";
  }
  return "healthy";
}

function computeHealthScore(
  status: ProviderStatus,
  successRate: number | null
): number {
  const base = successRate != null ? Math.round(successRate * 100) : 0;
  if (status === "healthy") return Math.max(base, 95);
  if (status === "degraded") return Math.min(base, 94);
  if (status === "unhealthy") return Math.min(base, 70);
  return 0;
}

function asNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string") return Number(v) || 0;
  return 0;
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(v as string);
  return isNaN(d.getTime()) ? null : d;
}

export async function listProviderHealthSnapshots(): Promise<
  ProviderHealthSnapshot[]
> {
  const db = await getDb();
  if (!db) return [];

  const since24h = new Date(Date.now() - DAY_MS);

  const [eventRows, deadLetterRows] = await Promise.all([
    db
      .select({
        provider: providerWebhookEvents.provider,
        total: sql<number>`COUNT(*)`,
        succeeded: sql<number>`SUM(CASE WHEN ${providerWebhookEvents.processingStatus} = 'processed' THEN 1 ELSE 0 END)`,
        lastSuccess: sql<
          string | null
        >`MAX(CASE WHEN ${providerWebhookEvents.processingStatus} = 'processed' THEN ${providerWebhookEvents.updatedAt} ELSE NULL END)`,
        lastFailure: sql<
          string | null
        >`MAX(CASE WHEN ${providerWebhookEvents.processingStatus} IN ('failed', 'dead_letter') THEN ${providerWebhookEvents.updatedAt} ELSE NULL END)`,
      })
      .from(providerWebhookEvents)
      .where(gte(providerWebhookEvents.createdAt, since24h))
      .groupBy(providerWebhookEvents.provider),
    db
      .select({
        provider: providerDeadLetters.provider,
        unresolvedCount: sql<number>`SUM(CASE WHEN ${providerDeadLetters.reviewStatus} = 'pending_review' THEN 1 ELSE 0 END)`,
        oldestCreatedAt: sql<
          string | null
        >`MIN(CASE WHEN ${providerDeadLetters.reviewStatus} = 'pending_review' THEN ${providerDeadLetters.createdAt} ELSE NULL END)`,
      })
      .from(providerDeadLetters)
      .groupBy(providerDeadLetters.provider),
  ]);

  const deadLetterMap = new Map<
    string,
    { unresolvedCount: number; oldestCreatedAt: Date | null }
  >();
  for (const r of deadLetterRows) {
    deadLetterMap.set(r.provider, {
      unresolvedCount: asNum(r.unresolvedCount),
      oldestCreatedAt: asDate(r.oldestCreatedAt),
    });
  }

  const providerSet = new Set<string>([
    ...eventRows.map(r => r.provider),
    ...deadLetterRows.map(r => r.provider),
  ]);

  const snapshots: ProviderHealthSnapshot[] = [];

  for (const provider of Array.from(providerSet)) {
    const events = eventRows.find(r => r.provider === provider);
    const dl = deadLetterMap.get(provider);

    const totalEvents = asNum(events?.total);
    const succeeded = asNum(events?.succeeded);
    const successRate = totalEvents > 0 ? succeeded / totalEvents : null;
    const deadLetterCount = dl?.unresolvedCount ?? 0;
    const oldestDlAt = dl?.oldestCreatedAt ?? null;
    const oldestAgeMs = oldestDlAt ? Date.now() - oldestDlAt.getTime() : null;

    const status = classifyStatus(
      successRate,
      totalEvents,
      deadLetterCount,
      oldestAgeMs
    );
    const healthScore = computeHealthScore(status, successRate);

    snapshots.push({
      providerId: provider,
      providerType: provider,
      status,
      successRate24h: successRate,
      totalEvents24h: totalEvents,
      deadLetterCount,
      lastSuccessAt: asDate(events?.lastSuccess),
      lastFailureAt: asDate(events?.lastFailure),
      oldestUnresolvedDeadLetterAge: oldestAgeMs,
      healthScore,
    });
  }

  return snapshots.sort((a, b) => a.providerId.localeCompare(b.providerId));
}

export async function getProviderHealthDrilldown(
  providerType: string,
  _providerId: string
) {
  const db = await getDb();
  if (!db) return { events: [], deadLetters: [] };

  const [events, deadLetters] = await Promise.all([
    db
      .select()
      .from(providerWebhookEvents)
      .where(eq(providerWebhookEvents.provider, providerType))
      .orderBy(desc(providerWebhookEvents.createdAt))
      .limit(50),
    db
      .select()
      .from(providerDeadLetters)
      .where(eq(providerDeadLetters.provider, providerType))
      .orderBy(desc(providerDeadLetters.createdAt))
      .limit(20),
  ]);

  return { events, deadLetters };
}

export async function emitProviderHealthSloEvent(
  providerType: string,
  snapshot: ProviderHealthSnapshot
): Promise<void> {
  const sloName = `provider.${providerType}.success.rate`;
  const successRate = snapshot.successRate24h ?? 0;
  const target = 0.99;
  const withinBudget = successRate >= target;

  await emitSloEvent({
    sloName,
    target,
    measuredValue: successRate,
    withinBudget,
    sampleCount: snapshot.totalEvents24h,
    windowSeconds: 86400,
    context: {
      providerId: snapshot.providerId,
      status: snapshot.status,
      deadLetterCount: snapshot.deadLetterCount,
    },
  });

  logger.info(
    {
      event: "provider_health_slo_emitted",
      providerType,
      sloName,
      successRate,
      withinBudget,
    },
    "provider_health_slo_emitted"
  );
}
