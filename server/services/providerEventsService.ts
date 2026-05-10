import { getDb } from "../db";
import { sql } from "drizzle-orm";

export async function recordProviderEvent(args: {
  provider: string;
  operation: string;
  correlationId?: string | null;
  payload?: any;
  errorMessage?: string | null;
  status?: string;
}) {
  const db = await getDb();
  if (!db) return null;
  const payloadJson = args.payload ? JSON.stringify(args.payload) : null;
  const res = await db.execute(
    sql`INSERT INTO provider_events (provider, operation, correlationId, payload, errorMessage, status, createdAt, updatedAt) VALUES (${args.provider}, ${args.operation}, ${args.correlationId ?? null}, ${payloadJson}, ${args.errorMessage ?? null}, ${args.status ?? 'pending'}, NOW(), NOW())`
  );
  try { return (res as any)[0].insertId as number; } catch { return null; }
}

export async function markEventRetryScheduled(eventId: number, attemptCount: number, errorMessage?: string) {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`UPDATE provider_events SET attemptCount = ${attemptCount}, status = 'retry_scheduled', errorMessage = ${errorMessage ?? null}, updatedAt = NOW() WHERE id = ${eventId}`);
}

export async function moveToDeadLetter(eventId: number, reason?: string, lastError?: string, attemptCount = 0) {
  const db = await getDb();
  if (!db) return;
  try {
    // Insert dead-letter row only if not already present to ensure exactly-once dead-lettering.
    const insertSql = sql`INSERT INTO provider_dead_letters (providerEventId, reason, attemptCount, lastError, createdAt)
      SELECT ${eventId}, ${reason ?? null}, ${attemptCount}, ${lastError ?? null}, NOW()
      FROM DUAL
      WHERE NOT EXISTS (SELECT 1 FROM provider_dead_letters pd WHERE pd.providerEventId = ${eventId})`;
    await db.execute(insertSql);
    // Mark the provider event as dead_letter (idempotent update)
    await db.execute(sql`UPDATE provider_events SET status = 'dead_letter', updatedAt = NOW() WHERE id = ${eventId}`);
  } catch (error: any) {
    console.error('[providerEventsService] moveToDeadLetter error:', error?.message ?? error);
    throw error;
  }
}
