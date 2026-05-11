import pino from "pino";
import { and, avg, count, eq, gte, max, sql } from "drizzle-orm";
import { getDb } from "../db";
import { sloEvents } from "../../drizzle/schema";

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

export type SloDefinition = {
  name: string;
  target: number;
  windowSeconds: number;
  description: string;
};

export const SLO_DEFINITIONS: readonly SloDefinition[] = [
  { name: "trpc.sale.confirm.p99", target: 0.99, windowSeconds: 60, description: "Sale confirmation tRPC handler p99 success rate" },
  { name: "trpc.purchase.commit.p99", target: 0.99, windowSeconds: 60, description: "Purchase commit tRPC handler p99 success rate" },
  { name: "trpc.payment.verify.p99", target: 0.99, windowSeconds: 60, description: "Payment verify tRPC handler p99 success rate" },
  { name: "http.api.latency.p95", target: 0.95, windowSeconds: 60, description: "HTTP API latency p95 within-budget rate" },
  { name: "provider.razorpay.success.rate", target: 0.995, windowSeconds: 300, description: "Razorpay provider call success rate" },
  { name: "provider.whatsapp.success.rate", target: 0.99, windowSeconds: 300, description: "WhatsApp provider call success rate" },
] as const;

export type SloEventInput = {
  sloName: string;
  target: number;
  measuredValue: number;
  withinBudget: boolean;
  sampleCount?: number;
  windowSeconds?: number;
  context?: Record<string, unknown> | null;
  measuredAt?: Date;
};

export type SloBudgetSnapshot = {
  name: string;
  target: number;
  actualRate: number;
  eventCount: number;
  lastBreachAt: Date | null;
};

function findDefinition(sloName: string): SloDefinition | undefined {
  return SLO_DEFINITIONS.find((d) => d.name === sloName);
}

export async function emitSloEvent(input: SloEventInput): Promise<void> {
  try {
    const db = await getDb();
    if (!db) {
      logger.warn({ event: "slo_event_skipped", sloName: input.sloName, reason: "db_unavailable" }, "slo_event_skipped");
      return;
    }
    await db.insert(sloEvents).values({
      sloName: input.sloName,
      target: String(input.target),
      measuredValue: String(input.measuredValue),
      withinBudget: input.withinBudget,
      sampleCount: input.sampleCount ?? 1,
      windowSeconds: input.windowSeconds ?? 60,
      context: input.context ?? null,
      measuredAt: input.measuredAt ?? new Date(),
    });
  } catch (error) {
    logger.warn(
      { event: "slo_event_write_failed", sloName: input.sloName, reason: (error as Error)?.message ?? String(error) },
      "slo_event_write_failed"
    );
  }
}

export async function recordLatencyForSlo(
  sloName: string,
  latencySeconds: number,
  context?: Record<string, unknown>
): Promise<void> {
  const def = findDefinition(sloName);
  if (!def) {
    logger.warn({ event: "slo_unknown_name", sloName }, "slo_unknown_name");
    return;
  }
  // withinBudget: the observation completed within the SLO measurement window.
  // getSloBudgetSummary computes the aggregate success rate against target.
  const withinBudget = latencySeconds <= def.windowSeconds;
  await emitSloEvent({
    sloName,
    target: def.target,
    measuredValue: latencySeconds,
    withinBudget,
    sampleCount: 1,
    windowSeconds: def.windowSeconds,
    context: context ?? null,
  });
}

export async function getSloBudgetSummary(
  sloName: string,
  windowSeconds?: number
): Promise<SloBudgetSnapshot> {
  const def = findDefinition(sloName);
  const effectiveTarget = def?.target ?? 0;
  const effectiveWindow = windowSeconds ?? def?.windowSeconds ?? 60;
  const zero: SloBudgetSnapshot = { name: sloName, target: effectiveTarget, actualRate: 0, eventCount: 0, lastBreachAt: null };

  try {
    const db = await getDb();
    if (!db) return zero;

    const since = new Date(Date.now() - effectiveWindow * 1000);

    const rows = await db
      .select({
        eventCount: count(),
        withinCount: sql<number>`SUM(CASE WHEN ${sloEvents.withinBudget} = 1 THEN 1 ELSE 0 END)`,
      })
      .from(sloEvents)
      .where(and(eq(sloEvents.sloName, sloName), gte(sloEvents.measuredAt, since)));

    const row = rows[0];
    const total = Number(row?.eventCount ?? 0);
    if (total === 0) return zero;

    const within = Number(row?.withinCount ?? 0);
    const actualRate = within / total;

    // Find last breach
    const breachRows = await db
      .select({ lastBreachAt: max(sloEvents.measuredAt) })
      .from(sloEvents)
      .where(
        and(
          eq(sloEvents.sloName, sloName),
          gte(sloEvents.measuredAt, since),
          eq(sloEvents.withinBudget, false)
        )
      );

    const lastBreachAt = breachRows[0]?.lastBreachAt ?? null;

    return {
      name: sloName,
      target: effectiveTarget,
      actualRate,
      eventCount: total,
      lastBreachAt: lastBreachAt instanceof Date ? lastBreachAt : lastBreachAt ? new Date(lastBreachAt) : null,
    };
  } catch (error) {
    logger.warn(
      { event: "slo_budget_summary_failed", sloName, reason: (error as Error)?.message ?? String(error) },
      "slo_budget_summary_failed"
    );
    return zero;
  }
}
