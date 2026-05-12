import pino from "pino";
import { and, eq, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import { dsrRequests, dsrSlaMonitorLog } from "../../drizzle/schema";
import { ENV } from "../_core/env";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

const SLA_DAYS = 30;
const APPROACHING_THRESHOLD_DAYS = 7;

let dsrSlaTimer: ReturnType<typeof setInterval> | null = null;

export async function runDsrSlaMonitorTick(): Promise<{ alerts: number }> {
  const db = await getDb();
  if (!db) return { alerts: 0 };

  const now = new Date();
  // Find DSRs created more than (SLA_DAYS - APPROACHING_THRESHOLD_DAYS) days ago and still pending
  const cutoff = new Date(
    now.getTime() -
      (SLA_DAYS - APPROACHING_THRESHOLD_DAYS) * 24 * 60 * 60 * 1000
  );

  const candidates = await db
    .select()
    .from(dsrRequests)
    .where(
      and(
        eq(dsrRequests.requestStatus, "pending"),
        lte(dsrRequests.createdAt, cutoff)
      )
    );

  let alertCount = 0;
  for (const req of candidates) {
    const ageDays = Math.floor(
      (now.getTime() - new Date(req.createdAt).getTime()) /
        (24 * 60 * 60 * 1000)
    );
    const daysToSla = SLA_DAYS - ageDays;
    const alertKind = daysToSla < 0 ? "breached_sla" : "approaching_sla";

    await db
      .insert(dsrSlaMonitorLog)
      .values({
        dsrRequestId: req.id,
        alertKind,
        daysToSla,
        notifiedRecipientsJson: JSON.stringify([ENV.dpoEmail]),
        detectedAt: now,
      })
      .onDuplicateKeyUpdate({ set: { detectedAt: sql`NOW()` } });

    logger.warn(
      { requestId: req.id, alertKind, daysToSla },
      `DSR SLA alert: ${alertKind}`
    );
    alertCount++;
  }

  return { alerts: alertCount };
}

export function startDsrSlaMonitor(): ReturnType<typeof setInterval> | null {
  if (!ENV.dsrSlaMonitorEnabled) {
    logger.info(
      "dsrSlaMonitor: disabled by env (DSR_SLA_MONITOR_ENABLED=false)"
    );
    return null;
  }
  const intervalMs = 60 * 60 * 1000; // hourly
  logger.info({ intervalMs }, "dsrSlaMonitor: scheduled");
  runDsrSlaMonitorTick().catch(err =>
    logger.error({ err: String(err) }, "dsrSlaMonitor: initial tick failed")
  );
  dsrSlaTimer = setInterval(() => {
    runDsrSlaMonitorTick().catch(err =>
      logger.error({ err: String(err) }, "dsrSlaMonitor: tick failed")
    );
  }, intervalMs);
  return dsrSlaTimer;
}

export function stopDsrSlaMonitor(): void {
  if (dsrSlaTimer) {
    clearInterval(dsrSlaTimer);
    dsrSlaTimer = null;
  }
}
